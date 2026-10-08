import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import {
  CreateLeagueDto,
  CreateMatchDto,
  CreatePlayerDto,
  CreateTeamDto,
} from '../common/dto';
import {
  AuditLog,
  League,
  Match,
  MatchStatus,
  Player,
  Team,
} from '../database/entities';
import { rebuildMatchStats } from '../matches/player-stats';

export type Row = Record<string, unknown>;

/** One row-level problem, addressed by its 1-based index inside `rows`. */
export type ImportError = { row: number; column?: string; message: string };

export type ImportReport = {
  entity: string;
  created: number;
  updated: number;
  total: number;
  /** Only for `matches` — stat rows rebuilt for finished fixtures. */
  stats_written?: number;
};

type Item<T> = {
  row: number;
  id?: string;
  data: Nullable<T>;
};

/**
 * `Partial<T>` with `null` allowed on every key: an empty spreadsheet cell is
 * an explicit `null` so an update *clears* the column, where `undefined` would
 * silently leave the old value behind.
 */
type Nullable<T> = { [K in keyof T]?: T[K] | null };

/** `scheduled_at` is still the ISO string the DTO expects at validation time. */
type MatchItem = {
  row: number;
  id?: string;
  data: Nullable<Omit<Partial<Match>, 'scheduled_at'>> & { scheduled_at: string };
};

/**
 * Bulk create/update driven by a spreadsheet.
 *
 * Everything — reading the current rows, resolving references, uniqueness
 * checks, DTO validation and the writes — happens inside **one transaction**.
 * A single bad row therefore throws and rolls the entire batch back, which is
 * what "all or nothing" means in practice: no half-imported league to clean up.
 *
 * Reference columns hold *names* (`league`, `team`, `home_team`) rather than
 * UUIDs so the file stays readable in Excel; they are resolved to ids here,
 * where the database is available. A blank `id` column means "create this row",
 * a populated one means "update it".
 */
@Injectable()
export class ImportService {
  constructor(private ds: DataSource) {}

  async run(entity: string, rows: Row[]): Promise<ImportReport> {
    switch (entity) {
      case 'leagues':
        return this.importLeagues(rows);
      case 'teams':
        return this.importTeams(rows);
      case 'players':
        return this.importPlayers(rows);
      case 'matches':
        return this.importMatches(rows);
      default:
        throw new NotFoundException(
          `Unknown import target "${entity}" — use leagues, teams, players or matches`,
        );
    }
  }

  // ---------------------------------------------------------------- cells

  /** Trimmed text cell; `null`/`undefined`/blank → `''`. */
  private s(raw: Row, key: string): string {
    const v = raw[key];
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  /** Blank optional cell → explicit `null`, so an update clears the column. */
  private opt(raw: Row, key: string): string | null {
    return this.s(raw, key) || null;
  }

  /** Blank → `null` (DTO's `@IsOptional()` then skips it), else a number. */
  private num(raw: Row, key: string): number | null {
    const v = this.s(raw, key);
    return v === '' ? null : Number(v);
  }

  private eq(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  // ------------------------------------------------------------ references

  /**
   * Resolve a human-readable name (league/team) to exactly one record.
   * Zero or several matches are reported as row errors instead of guessed at.
   */
  private ref<T extends { id: string; name: string }>(
    list: T[],
    name: string,
    errors: ImportError[],
    row: number,
    column: string,
  ): T | null {
    if (!name) {
      errors.push({ row, column, message: `"${column}" is required` });
      return null;
    }
    const hits = list.filter((x) => this.eq(x.name, name));
    if (hits.length === 0) {
      errors.push({ row, column, message: `No ${column} named "${name}"` });
      return null;
    }
    if (hits.length > 1) {
      errors.push({
        row,
        column,
        message: `Ambiguous ${column} "${name}" — ${hits.length} records share that name`,
      });
      return null;
    }
    return hits[0];
  }

  // ------------------------------------------------------------ validation

  /**
   * Run the exact same DTO the single-row endpoint uses, so a spreadsheet row
   * can never be "more valid" than a hand-typed request.
   */
  private async validate(
    Dto: new () => object,
    items: Array<{ row: number; data: any }>,
    errors: ImportError[],
  ): Promise<void> {
    for (const it of items) {
      const found = await validate(plainToInstance(Dto, { ...it.data }), {
        whitelist: true,
      });
      for (const e of found) {
        const all = Object.entries(e.constraints ?? {});
        // A non-numeric cell trips `isInt` *and* min/max at once; only the
        // type error says what actually went wrong, so drop the consequences.
        const keep = all.some(([k]) => k === 'isInt')
          ? all.filter(([k]) => k === 'isInt')
          : all;
        const messages = keep.map(([k, v]) =>
          k === 'isDateString'
            ? `${e.property}: expected a date such as 2026-10-10 (or 2026-10-10 19:00 for a kick-off)`
            : v,
        );
        errors.push({ row: it.row, column: e.property, message: messages.join('; ') });
      }
    }
  }

  private importError(entity: string, errors: ImportError[]): BadRequestException {
    const bad = new Set(errors.map((e) => e.row)).size;
    return new BadRequestException({
      statusCode: 400,
      message: `Import aborted — ${bad} row(s) have problems. Nothing was written.`,
      entity,
      errors,
    });
  }

  /**
   * The one place that talks to TypeORM with a prepared row.
   *
   * `QueryDeepPartialEntity` has no notion of `null` even though every column
   * we clear *is* nullable, so the row model and the query layer only agree
   * behind this narrow, deliberately untyped boundary.
   */
  private persist(
    em: EntityManager,
    Entity: any,
    data: any,
    id?: string,
  ): Promise<any> {
    return id ? em.update(Entity, id, data) : em.insert(Entity, data);
  }

  // ---------------------------------------------------------------- leagues

  async importLeagues(rows: Row[]): Promise<ImportReport> {
    return this.ds.transaction(async (em) => {
      const errors: ImportError[] = [];
      const existing = await em.find(League);
      const items: Item<Partial<League>>[] = [];

      rows.forEach((raw, i) => {
        const row = i + 1;
        const id = this.s(raw, 'id');
        const name = this.s(raw, 'name');
        const season = this.s(raw, 'season');

        if (id) {
          if (!existing.some((x) => x.id === id)) {
            errors.push({ row, column: 'id', message: `No league with id "${id}"` });
            return;
          }
        } else {
          const dup = existing.find((x) => this.eq(x.name, name) && this.eq(x.season, season));
          if (dup) {
            errors.push({
              row,
              column: 'name',
              message: `League "${name}" (${season}) already exists — its id is ${dup.id}`,
            });
            return;
          }
        }

        items.push({
          row,
          id: id || undefined,
          data: {
            name,
            description: this.opt(raw, 'description'),
            sport: this.s(raw, 'sport'),
            season,
            start_date: this.s(raw, 'start_date'),
            end_date: this.s(raw, 'end_date'),
            status: this.s(raw, 'status') as League['status'],
          },
        });
      });

      await this.validate(CreateLeagueDto, items, errors);
      if (errors.length) throw this.importError('leagues', errors);

      let created = 0;
      let updated = 0;
      for (const it of items) {
        await this.persist(em, League, it.data, it.id);
        it.id ? updated++ : created++;
      }
      return { entity: 'leagues', created, updated, total: items.length };
    });
  }

  // ------------------------------------------------------------------ teams

  async importTeams(rows: Row[]): Promise<ImportReport> {
    return this.ds.transaction(async (em) => {
      const errors: ImportError[] = [];
      const [leagues, existing] = await Promise.all([em.find(League), em.find(Team)]);
      const items: Item<Partial<Team>>[] = [];

      rows.forEach((raw, i) => {
        const row = i + 1;
        const id = this.s(raw, 'id');
        const cur = id ? existing.find((x) => x.id === id) : undefined;
        if (id && !cur) {
          errors.push({ row, column: 'id', message: `No team with id "${id}"` });
          return;
        }

        const name = this.s(raw, 'name');
        const leagueName = this.s(raw, 'league');
        let league_id = cur?.league_id ?? '';

        if (leagueName) {
          const hit = this.ref(leagues, leagueName, errors, row, 'league');
          if (!hit) return;
          if (cur && hit.id !== cur.league_id) {
            errors.push({
              row,
              column: 'league',
              message: `"${cur.name}" already belongs to another league — a team cannot be moved by import`,
            });
            return;
          }
          league_id = hit.id;
        } else if (!cur) {
          errors.push({ row, column: 'league', message: 'League is required when creating a team' });
          return;
        }

        if (!cur) {
          const dup = existing.find((x) => x.league_id === league_id && this.eq(x.name, name));
          if (dup) {
            errors.push({
              row,
              column: 'name',
              message: `Team "${name}" already exists in that league — its id is ${dup.id}`,
            });
            return;
          }
        }

        items.push({
          row,
          id: id || undefined,
          data: {
            league_id,
            name,
            short_name: this.s(raw, 'short_name'),
            city: this.opt(raw, 'city'),
            stadium: this.opt(raw, 'stadium'),
            logo_url: this.opt(raw, 'logo_url'),
            // Club profile — `founded_year` becomes null when the cell is
            // blank, which is what "unknown" means, and a non-numeric cell
            // reaches the DTO as NaN and is rejected like any bad row.
            founded_year: this.num(raw, 'founded_year'),
            history: this.opt(raw, 'history'),
          },
        });
      });

      await this.validate(CreateTeamDto, items, errors);
      if (errors.length) throw this.importError('teams', errors);

      let created = 0;
      let updated = 0;
      for (const it of items) {
        await this.persist(em, Team, it.data, it.id);
        it.id ? updated++ : created++;
      }
      return { entity: 'teams', created, updated, total: items.length };
    });
  }

  // --------------------------------------------------------------- players

  async importPlayers(rows: Row[]): Promise<ImportReport> {
    return this.ds.transaction(async (em) => {
      const errors: ImportError[] = [];
      const [teams, existing] = await Promise.all([em.find(Team), em.find(Player)]);
      const items: Item<Partial<Player>>[] = [];

      rows.forEach((raw, i) => {
        const row = i + 1;
        const id = this.s(raw, 'id');
        const cur = id ? existing.find((x) => x.id === id) : undefined;
        if (id && !cur) {
          errors.push({ row, column: 'id', message: `No player with id "${id}"` });
          return;
        }

        const name = this.s(raw, 'name');
        const teamName = this.s(raw, 'team');
        let team_id = cur?.team_id ?? '';

        if (teamName) {
          const hit = this.ref(teams, teamName, errors, row, 'team');
          if (!hit) return;
          team_id = hit.id;
        } else if (!cur) {
          errors.push({ row, column: 'team', message: 'Team is required when creating a player' });
          return;
        }

        if (!cur) {
          const jersey = this.num(raw, 'jersey_number');
          const dup = existing.find(
            (x) =>
              x.team_id === team_id &&
              (this.eq(x.name, name) || (jersey != null && x.jersey_number === jersey)),
          );
          if (dup) {
            errors.push({
              row,
              column: dup.name === name ? 'name' : 'jersey_number',
              message: `"${dup.name}" (#${dup.jersey_number}) already plays for that team — its id is ${dup.id}`,
            });
            return;
          }
        }

        items.push({
          row,
          id: id || undefined,
          data: {
            team_id,
            name,
            jersey_number: this.num(raw, 'jersey_number'),
            position: this.s(raw, 'position') as Player['position'],
            nationality: this.s(raw, 'nationality'),
            date_of_birth: this.opt(raw, 'date_of_birth'),
            photo_url: this.opt(raw, 'photo_url'),
          },
        });
      });

      await this.validate(CreatePlayerDto, items, errors);
      if (errors.length) throw this.importError('players', errors);

      let created = 0;
      let updated = 0;
      for (const it of items) {
        await this.persist(em, Player, it.data, it.id);
        it.id ? updated++ : created++;
      }
      return { entity: 'players', created, updated, total: items.length };
    });
  }

  // --------------------------------------------------------------- matches

  async importMatches(rows: Row[]): Promise<ImportReport> {
    return this.ds.transaction(async (em) => {
      const errors: ImportError[] = [];
      const [teams, existing] = await Promise.all([em.find(Team), em.find(Match)]);
      const items: MatchItem[] = [];

      rows.forEach((raw, i) => {
        const row = i + 1;
        const id = this.s(raw, 'id');
        const cur = id ? existing.find((x) => x.id === id) : undefined;
        if (id && !cur) {
          errors.push({ row, column: 'id', message: `No match with id "${id}"` });
          return;
        }

        const resolve = (column: string): Team | null => {
          const name = this.s(raw, column);
          if (name) return this.ref(teams, name, errors, row, column);
          if (cur) {
            const known = teams.find((t) =>
              t.id === (column === 'home_team' ? cur!.home_team_id : cur!.away_team_id),
            );
            if (known) return known;
          }
          errors.push({ row, column, message: `"${column}" is required` });
          return null;
        };

        const home = resolve('home_team');
        if (!home) return;
        const away = resolve('away_team');
        if (!away) return;

        if (home.id === away.id) {
          errors.push({ row, column: 'away_team', message: 'Home and away team must differ' });
          return;
        }
        if (home.league_id !== away.league_id) {
          errors.push({
            row,
            column: 'away_team',
            message: 'Both teams must belong to the same league',
          });
          return;
        }

        const scheduled = this.s(raw, 'scheduled_at');
        if (!cur) {
          const at = new Date(scheduled).getTime();
          const dup = existing.find(
            (x) =>
              x.home_team_id === home.id &&
              x.away_team_id === away.id &&
              new Date(x.scheduled_at).getTime() === at,
          );
          if (dup) {
            errors.push({
              row,
              column: 'scheduled_at',
              message: 'That fixture is already on the schedule',
            });
            return;
          }
        }

        const home_score = this.num(raw, 'home_score');
        const away_score = this.num(raw, 'away_score');
        const status = this.s(raw, 'status');
        if (status === MatchStatus.FINISHED && (home_score == null || away_score == null)) {
          errors.push({
            row,
            column: 'home_score',
            message: 'A FINISHED match needs both scores',
          });
          return;
        }
        if (home_score != null && away_score != null && (home_score < 0 || away_score < 0)) {
          errors.push({ row, column: 'home_score', message: 'Scores cannot be negative' });
          return;
        }

        items.push({
          row,
          id: id || undefined,
          data: {
            league_id: home.league_id,
            home_team_id: home.id,
            away_team_id: away.id,
            scheduled_at: scheduled,
            status: status as MatchStatus,
            home_score,
            away_score,
            venue: this.opt(raw, 'venue'),
          },
        });
      });

      await this.validate(CreateMatchDto, items, errors);
      if (errors.length) throw this.importError('matches', errors);

      let created = 0;
      let updated = 0;
      let stats_written = 0;

      for (const it of items) {
        const payload = {
          ...it.data,
          scheduled_at: new Date(it.data.scheduled_at),
        };

        let saved: Match;
        let before: Match | null = null;

        if (it.id) {
          const prev = await em.findOne(Match, { where: { id: it.id } });
          if (!prev) {
            throw this.importError('matches', [
              { row: it.row, column: 'id', message: 'Match disappeared during import' },
            ]);
          }
          before = { ...prev };
          Object.assign(prev, payload);
          saved = await em.save(prev);
          updated++;
        } else {
          saved = await em.save(em.create(Match, payload as any));
          created++;
        }

        // Player statistics only exist for finished fixtures and must follow
        // the score line; a row flipped back to SCHEDULED loses them here.
        stats_written += await rebuildMatchStats(em, saved);
        await this.auditResult(em, saved, before);
      }

      return { entity: 'matches', created, updated, total: items.length, stats_written };
    });
  }

  /**
   * Record a changed result on the undo stack, exactly as `simulate()` does,
   * so an imported score line can still be undone from the Fixtures page.
   */
  private async auditResult(em: EntityManager, saved: Match, before: Match | null) {
    const now = saved.status === MatchStatus.FINISHED;
    const was = before?.status === MatchStatus.FINISHED;
    if (!now && !was) return;

    const changed =
      !before ||
      before.home_score !== saved.home_score ||
      before.away_score !== saved.away_score ||
      before.status !== saved.status;
    if (!changed) return;

    await this.persist(em, AuditLog, {
      action: was ? 'MATCH_RESULT_UPDATED' : 'MATCH_RESULT_SIMULATED',
      entity: 'matches',
      entity_id: saved.id,
      old_data: before
        ? { home_score: before.home_score, away_score: before.away_score, status: before.status }
        : { home_score: null, away_score: null, status: MatchStatus.SCHEDULED },
      new_data: {
        home_score: saved.home_score,
        away_score: saved.away_score,
        status: saved.status,
      },
    });
  }
}
