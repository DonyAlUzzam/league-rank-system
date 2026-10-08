import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Match,
  MatchStatus,
  Team,
  League,
  AuditLog,
} from '../database/entities';
import { StandingService } from '../standings/standings.service';
import { rebuildMatchStats } from './player-stats';

/**
 * What the HTTP layer may send. `scheduled_at` arrives as an ISO string from
 * `@IsDateString()` and is normalised to a `Date` before touching the entity.
 */
export type MatchInput = Omit<Partial<Match>, 'scheduled_at'> & {
  scheduled_at?: string | Date;
};

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match) private r: Repository<Match>,
    @InjectRepository(Team) private t: Repository<Team>,
    @InjectRepository(League) private l: Repository<League>,
    @InjectRepository(AuditLog) private audit: Repository<AuditLog>,
    private standings: StandingService,
  ) {}

  /**
   * Audit actions that form the undo stack. `MATCH_RESULT_REVERTED` is
   * deliberately excluded so stepping back twice walks further into the
   * history instead of toggling the same result.
   */
  private static readonly UNDO_STACK = [
    'MATCH_RESULT_SIMULATED',
    'MATCH_RESULT_UPDATED',
  ];

  /**
   * `can_revert` lets the UI show the Undo button only where there is
   * actually a previous state to go back to — one extra query for the page.
   */
  async all(league_id?: string) {
    const matches = await this.r.find({
      where: league_id ? { league_id } : undefined,
      order: { scheduled_at: 'DESC' },
    });
    if (matches.length === 0) return [];

    const audited = await this.audit.find({
      where: {
        entity: 'matches',
        entity_id: In(matches.map((m) => m.id)),
        action: In(MatchesService.UNDO_STACK),
      },
    });
    const revertible = new Set(audited.map((a) => a.entity_id));

    return matches.map((m) => ({ ...m, can_revert: revertible.has(m.id) }));
  }

  async one(id: string) {
    const x = await this.r.findOne({ where: { id } });
    if (!x) throw new NotFoundException('Match not found');
    return x;
  }

  async create(d: MatchInput) {
    if (d.home_team_id === d.away_team_id)
      throw new BadRequestException('Home and away team must differ');
    if ((d.home_score != null && d.home_score < 0) || (d.away_score != null && d.away_score < 0))
      throw new BadRequestException('Score cannot be negative');

    const [h, a] = await Promise.all([
      this.t.findOneBy({ id: d.home_team_id }),
      this.t.findOneBy({ id: d.away_team_id }),
    ]);
    if (!h || !a || h.league_id !== a.league_id || h.league_id !== d.league_id)
      throw new BadRequestException('Teams must belong to the same league');
    if (d.status === MatchStatus.FINISHED && (d.home_score == null || d.away_score == null))
      throw new BadRequestException('Finished match requires scores');

    const saved = await this.r.save(
      this.r.create({ ...d, scheduled_at: new Date(d.scheduled_at ?? Date.now()) }),
    );
    // A fixture may be born FINISHED straight from the editor; its player
    // statistics have to exist too, not only after a simulate().
    await rebuildMatchStats(this.r.manager, saved);
    return saved;
  }

  async update(id: string, d: MatchInput) {
    const x = await this.one(id);
    if (x.status === MatchStatus.FINISHED && !d.status)
      throw new BadRequestException(
        'Finished matches require an explicit audited workflow',
      );
    if (
      d.status === MatchStatus.FINISHED &&
      (d.home_score == null && x.home_score == null ||
        d.away_score == null && x.away_score == null)
    )
      throw new BadRequestException('Finished match requires scores');

    const { scheduled_at, ...rest } = d;
    Object.assign(x, rest);
    if (scheduled_at !== undefined) x.scheduled_at = new Date(scheduled_at);
    const saved = await this.r.save(x);
    // Stats follow the score line: flipping a fixture back to SCHEDULED
    // clears them, giving it a result creates them.
    await rebuildMatchStats(this.r.manager, saved);
    return saved;
  }

  async remove(id: string) {
    const x = await this.one(id);
    if (x.status === MatchStatus.FINISHED)
      throw new BadRequestException('Finished match cannot be deleted');
    await this.r.delete(id);
    return { success: true };
  }

  /**
   * Simulate a final result (admin action).
   *
   * Standings and the dashboard are always derived from `matches`, so they
   * pick the new score up on the next read — nothing is cached. What *is*
   * persisted here is the individual player statistics, which only exist for
   * finished matches, plus an audit trail of the change.
   */
  async simulate(id: string, home_score: number, away_score: number) {
    if (
      !Number.isInteger(home_score) ||
      !Number.isInteger(away_score) ||
      home_score < 0 ||
      away_score < 0
    ) {
      throw new BadRequestException('Scores must be non-negative whole numbers');
    }

    const match = await this.one(id);
    const previous = {
      home_score: match.home_score,
      away_score: match.away_score,
      status: match.status,
    };

    match.home_score = home_score;
    match.away_score = away_score;
    match.status = MatchStatus.FINISHED;
    const saved = await this.r.save(match);

    // --- player statistics follow the score line (replace any previous run) ---
    const generated = await rebuildMatchStats(this.r.manager, saved);

    // --- derived views, recomputed on read ---
    const standings = await this.standings.calculate(saved.league_id);

    // --- audit trail ---
    await this.audit.save(
      this.audit.create({
        action:
          previous.status === MatchStatus.FINISHED
            ? 'MATCH_RESULT_UPDATED'
            : 'MATCH_RESULT_SIMULATED',
        entity: 'matches',
        entity_id: saved.id,
        old_data: previous as unknown as Record<string, unknown>,
        new_data: {
          home_score,
          away_score,
          status: MatchStatus.FINISHED,
        },
      }),
    );

    return {
      match: saved,
      standings,
      stats_generated: generated,
      previous,
    };
  }

  /**
   * Undo the last simulation for a match.
   *
   * Pops the newest entry off the undo stack (the audit row written by
   * `simulate`), restores the score/status it recorded, then rebuilds or
   * removes the player statistics accordingly. Reverting a first-time
   * simulation therefore puts the fixture back to SCHEDULED.
   */
  async revert(id: string) {
    const match = await this.one(id);

    const step = await this.audit.findOne({
      where: {
        entity: 'matches',
        entity_id: match.id,
        action: In(MatchesService.UNDO_STACK),
      },
      order: { created_at: 'DESC' },
    });
    if (!step) {
      throw new BadRequestException(
        'Nothing to revert — this match has no recorded previous result',
      );
    }

    const restored = (step.old_data ?? {}) as {
      home_score?: number | null;
      away_score?: number | null;
      status?: MatchStatus;
    };
    const before = {
      home_score: match.home_score,
      away_score: match.away_score,
      status: match.status,
    };

    match.home_score = restored.home_score ?? null;
    match.away_score = restored.away_score ?? null;
    match.status = restored.status ?? MatchStatus.SCHEDULED;
    const saved = await this.r.save(match);

    // --- player statistics follow the restored score line ---
    const generated = await rebuildMatchStats(this.r.manager, saved);

    // Consume this undo step so a second revert walks further back.
    await this.audit.delete({ id: step.id });

    // Paper trail — excluded from the undo stack.
    await this.audit.save(
      this.audit.create({
        action: 'MATCH_RESULT_REVERTED',
        entity: 'matches',
        entity_id: saved.id,
        old_data: before as unknown as Record<string, unknown>,
        new_data: {
          home_score: saved.home_score,
          away_score: saved.away_score,
          status: saved.status,
        },
      }),
    );

    const standings = await this.standings.calculate(saved.league_id);

    return {
      match: saved,
      standings,
      restored,
      stats_generated: generated,
    };
  }
}
