import { Player, PlayerMatchStatistic, Position } from '../database/entities';
import { buildPlayerMatchStats } from './player-stats';

const mk = (id: string, position: Position, n: number): Player =>
  ({
    id,
    jersey_number: n,
    position,
  }) as Player;

const home = ['h1', 'h2', 'h3', 'h4'].map((id, i) =>
  mk(id, [Position.GOALKEEPER, Position.DEFENDER, Position.MIDFIELDER, Position.FORWARD][i], i + 1),
);
const away = ['a1', 'a2', 'a3', 'a4'].map((id, i) =>
  mk(id, [Position.GOALKEEPER, Position.DEFENDER, Position.MIDFIELDER, Position.FORWARD][i], i + 1),
);

const squads = new Map<string, Player[]>([
  ['home-team', home],
  ['away-team', away],
]);

const match = {
  id: 'match-1',
  home_team_id: 'home-team',
  away_team_id: 'away-team',
  home_score: 3,
  away_score: 1,
};

describe('buildPlayerMatchStats', () => {
  const rows = buildPlayerMatchStats(match, squads);

  it('gives every squad member one appearance', () => {
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.player_id)).size).toBe(8);
    expect(rows.every((r) => r.matches_played === 1)).toBe(true);
  });

  it('totals exactly the score line', () => {
    const goals = rows.reduce((s, r) => s + (r.goals ?? 0), 0);
    expect(goals).toBe(match.home_score + match.away_score);
  });

  it('only awards goals to the scoring side', () => {
    const homeGoals = rows
      .filter((r) => (r.player_id ?? '').startsWith('h'))
      .reduce((s, r) => s + (r.goals ?? 0), 0);
    const awayGoals = rows
      .filter((r) => (r.player_id ?? '').startsWith('a'))
      .reduce((s, r) => s + (r.goals ?? 0), 0);
    expect(homeGoals).toBe(3);
    expect(awayGoals).toBe(1);
  });

  it('is deterministic for the same fixture', () => {
    expect(buildPlayerMatchStats(match, squads)).toEqual(rows);
  });

  it('emits rows ready to persist', () => {
    expect(rows.every((r) => r.match_id === match.id)).toBe(true);
    expect(rows.every((r) => typeof r.yellow_cards === 'number')).toBe(true);
  });

  it('handles a clean sheet', () => {
    const zero = buildPlayerMatchStats(
      { ...match, home_score: 0, away_score: 0 },
      squads,
    );
    expect(zero).toHaveLength(8);
    expect(zero.every((r) => (r.goals ?? 0) === 0)).toBe(true);
  });

  it('tolerates a missing squad', () => {
    const rows2 = buildPlayerMatchStats(match, new Map());
    expect(rows2).toHaveLength(0);
  });
});

describe('PlayerMatchStatistic shape', () => {
  it('matches the entity contract', () => {
    const row = buildPlayerMatchStats(match, squads)[0] as PlayerMatchStatistic;
    expect(Object.keys(row).sort()).toEqual(
      ['assists', 'goals', 'matches_played', 'match_id', 'player_id', 'red_cards', 'yellow_cards'].sort(),
    );
  });
});
