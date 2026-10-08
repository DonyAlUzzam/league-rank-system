import { EntityManager } from 'typeorm';
import { MatchStatus, Player, PlayerMatchStatistic, Position } from '../database/entities';

export type ScoreLine = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score?: number | null;
  away_score?: number | null;
};

export type SquadIndex = Map<string, Player[]>;

/** Deterministic PRNG (mulberry32 over an FNV-1a hash) so results are reproducible. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Forwards score most, goalkeepers least. */
const scorerWeight = (p: Player): number =>
  p.position === Position.FORWARD
    ? 5
    : p.position === Position.MIDFIELDER
      ? 3
      : p.position === Position.DEFENDER
        ? 1.5
        : 0.3;

function pickWeighted(
  list: Player[],
  r: () => number,
  exclude?: Player,
): Player | undefined {
  const pool = exclude ? list.filter((p) => p.id !== exclude.id) : list;
  if (pool.length === 0) return undefined; // no squad / nobody left to pick
  const total = pool.reduce((s, p) => s + scorerWeight(p), 0);
  let x = r() * total;
  for (const p of pool) {
    x -= scorerWeight(p);
    if (x <= 0) return p;
  }
  return pool[pool.length - 1];
}

/**
 * One row per player per match.
 *
 * Goals are distributed to the scoring team only and exactly `home_score` +
 * `away_score` times, so summed goals always agree with the dashboard's
 * `totalGoals`. Same PRNG seed ⇒ same distribution, which keeps the seed and
 * the match simulator perfectly consistent.
 */
export function buildPlayerMatchStats(
  match: ScoreLine,
  playersByTeam: SquadIndex,
): Partial<PlayerMatchStatistic>[] {
  const r = rng(match.id);
  const sides: Array<{ teamId: string; scored: number }> = [
    { teamId: match.home_team_id, scored: match.home_score ?? 0 },
    { teamId: match.away_team_id, scored: match.away_score ?? 0 },
  ];

  const perPlayer = new Map<string, Partial<PlayerMatchStatistic>>();

  for (const { teamId, scored } of sides) {
    const squad = playersByTeam.get(teamId) ?? [];

    // Everyone in the matchday squad played a full match.
    for (const p of squad) {
      perPlayer.set(p.id, {
        player_id: p.id,
        match_id: match.id,
        matches_played: 1,
        goals: 0,
        assists: 0,
        yellow_cards: 0,
        red_cards: 0,
      });
    }

    // Distribute the exact number of goals among this team's players.
    for (let g = 0; g < scored; g++) {
      const scorer = pickWeighted(squad, r);
      const row = scorer ? perPlayer.get(scorer.id) : undefined;
      if (!row) break; // empty squad — nothing to attribute goals to
      row.goals = (row.goals ?? 0) + 1;

      // ~70% of goals come with an assist from a different player.
      if (r() < 0.7 && scorer) {
        const helper = pickWeighted(squad, r, scorer);
        const hrow = helper ? perPlayer.get(helper.id) : undefined;
        if (hrow) hrow.assists = (hrow.assists ?? 0) + 1;
      }
    }

    // Discipline: outfield players carded more often than keepers.
    for (const p of squad) {
      const row = perPlayer.get(p.id)!;
      const yellowChance = p.position === Position.GOALKEEPER ? 0.05 : 0.13;
      if (r() < yellowChance) row.yellow_cards = 1;
      if (r() < 0.02) row.red_cards = 1;
    }
  }

  return [...perPlayer.values()];
}

/**
 * Rebuild the per-match player statistics for a single fixture.
 *
 * The individual stat rows only exist for finished matches, and they must
 * always mirror the score line — so this is done identically by the seed,
 * `simulate()`, `revert()` and a bulk spreadsheet import. Stale rows are
 * removed first, which also means flipping a fixture back to SCHEDULED
 * clears its statistics.
 *
 * The caller supplies the `EntityManager`, so a bulk import can run this
 * inside its transaction and stay all-or-nothing.
 *
 * @returns how many stat rows were written (0 when nothing to record).
 */
export async function rebuildMatchStats(
  em: EntityManager,
  match: ScoreLine & { status: string },
): Promise<number> {
  await em.delete(PlayerMatchStatistic, { match_id: match.id });

  const finished =
    match.status === MatchStatus.FINISHED &&
    match.home_score != null &&
    match.away_score != null;
  if (!finished) return 0;

  const players = await em.find(Player, {
    where: [{ team_id: match.home_team_id }, { team_id: match.away_team_id }],
    order: { jersey_number: 'ASC' },
  });
  const byTeam: SquadIndex = new Map();
  for (const pl of players) {
    const squad = byTeam.get(pl.team_id) ?? [];
    squad.push(pl);
    byTeam.set(pl.team_id, squad);
  }

  const rows = buildPlayerMatchStats(match, byTeam);
  if (rows.length > 0) await em.save(PlayerMatchStatistic, rows as PlayerMatchStatistic[]);
  return rows.length;
}
