import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  League,
  Team,
  Player,
  Match,
  PlayerMatchStatistic,
  MatchStatus,
  LeagueStatus,
  Position,
  User,
  Role,
} from './entities';
import ds from './data-source';
import { buildPlayerMatchStats } from '../matches/player-stats';

/**
 * Generates one row per player per FINISHED match.
 * Goals are distributed to the scoring team only, so the summed goals always
 * equal `totalGoals` reported by the dashboard.
 */
async function seedPlayerMatchStatistics(): Promise<void> {
  const stats = ds.getRepository(PlayerMatchStatistic);
  if ((await stats.count()) > 0) {
    console.log('player_match_statistics already seeded');
    return;
  }

  const matches = await ds.getRepository(Match).find({
    where: { status: MatchStatus.FINISHED },
  });
  if (matches.length === 0) {
    console.log('No finished matches, skipping player_match_statistics');
    return;
  }

  const players = await ds.getRepository(Player).find({
    order: { jersey_number: 'ASC' },
  });
  const byTeam = new Map<string, Player[]>();
  for (const p of players) {
    const arr = byTeam.get(p.team_id) ?? [];
    arr.push(p);
    byTeam.set(p.team_id, arr);
  }

  const rows: Partial<PlayerMatchStatistic>[] = [];
  let totalGoals = 0;

  for (const m of matches) {
    rows.push(...buildPlayerMatchStats(m, byTeam));
    totalGoals += (m.home_score ?? 0) + (m.away_score ?? 0);
  }

  for (let i = 0; i < rows.length; i += 500) {
    await stats.save(rows.slice(i, i + 500) as PlayerMatchStatistic[]);
  }

  console.log(
    `Seeded ${rows.length} player_match_statistics across ${matches.length} matches (${totalGoals} goals)`,
  );
}

/**
 * Classic circle method: n (even) teams → n-1 rounds, each round pairing every
 * team exactly once. Used to build realistic matchdays for the fixtures.
 */
function roundRobin(ids: string[]): string[][][] {
  const arr = [...ids];
  const n = arr.length;
  const rounds: string[][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: string[][] = [];
    for (let i = 0; i < n / 2; i++) pairs.push([arr[i], arr[n - 1 - i]]);
    rounds.push(pairs);
    // Keep the first slot fixed, rotate the rest.
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

/**
 * Next matchdays: the return legs of the opening rounds, scheduled in the
 * future (next Saturday 19:00, then weekly) so the dashboard has real
 * "Upcoming Matches" to show.
 */
async function seedUpcomingMatches(): Promise<void> {
  const matches = ds.getRepository(Match);
  const teamsRepo = ds.getRepository(Team);

  if ((await matches.countBy({ status: MatchStatus.SCHEDULED })) > 0) {
    console.log('Upcoming matches already seeded');
    return;
  }

  const leagues = await ds.getRepository(League).find({ order: { created_at: 'ASC' } });
  const MATCHDAYS = 3;

  for (const league of leagues) {
    const teams = await teamsRepo.find({
      where: { league_id: league.id },
      order: { name: 'ASC' },
    });

    let ids = teams.map((t) => t.id);
    if (ids.length % 2 !== 0) ids = ids.slice(0, -1); // circle method needs an even count
    if (ids.length < 4) continue;

    const byId = new Map(teams.map((t) => [t.id, t]));
    const rounds = roundRobin(ids).slice(0, MATCHDAYS);

    // Kickoffs: the next Saturday at 19:00, then one per week.
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const toSaturday = (6 - base.getDay() + 7) % 7 || 7;
    const firstKickoff = new Date(base.getTime() + toSaturday * 86_400_000);
    firstKickoff.setHours(19, 0, 0, 0);

    const rows: Partial<Match>[] = [];
    rounds.forEach((pairs, index) => {
      const kickoff = new Date(firstKickoff.getTime() + index * 7 * 86_400_000);
      for (const [home, away] of pairs) {
        rows.push(
          matches.create({
            league_id: league.id,
            // Return leg: reverse of the fixture already played.
            home_team_id: away,
            away_team_id: home,
            scheduled_at: kickoff,
            status: MatchStatus.SCHEDULED,
            venue: byId.get(away)?.stadium,
          }),
        );
      }
    });

    if (rows.length > 0) {
      await matches.save(rows as Match[]);
      console.log(
        `Seeded ${rows.length} upcoming matches (${MATCHDAYS} matchdays) for ${league.name}`,
      );
    }
  }
}

async function main(): Promise<void> {
  await ds.initialize();

  const users = ds.getRepository(User);
  const leagues = ds.getRepository(League);
  const teams = ds.getRepository(Team);
  const players = ds.getRepository(Player);
  const matches = ds.getRepository(Match);

  if ((await users.count()) === 0) {
    await users.save([
      {
        email: 'admin@league.local',
        password: await bcrypt.hash('Admin123!', 10),
        role: Role.ADMIN,
      },
      {
        email: 'user@league.local',
        password: await bcrypt.hash('User123!', 10),
        role: Role.USER,
      },
    ]);
  }

  if ((await leagues.count()) === 0) {
    const league = await leagues.save(
      leagues.create({
        name: 'Indonesia Premier League',
        description: 'Demo football competition',
        sport: 'Football',
        season: '2026',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        status: LeagueStatus.ONGOING,
      }),
    );

    const names = [
      'Jakarta FC',
      'Bandung United',
      'Surabaya Warriors',
      'Bali Stars',
      'Makassar FC',
      'Medan United',
      'Semarang City',
      'Yogyakarta FC',
      'Palembang United',
      'Borneo Stars',
    ];
    const ts = await teams.save(
      names.map((name, i) =>
        teams.create({
          league_id: league.id,
          name,
          short_name: name.split(' ').map((x) => x[0]).join(''),
          city: name.split(' ')[0],
          stadium: `${name} Stadium`,
        }),
      ),
    );

    const positions = [
      Position.GOALKEEPER,
      Position.DEFENDER,
      Position.MIDFIELDER,
      Position.FORWARD,
    ];
    const ps: Player[] = [];
    for (const [ti, t] of ts.entries()) {
      for (let n = 1; n <= 10; n++) {
        ps.push(
          players.create({
            team_id: t.id,
            name: `${t.short_name} Player ${n}`,
            jersey_number: n,
            position: positions[(n - 1) % 4],
            nationality: 'Indonesia',
            date_of_birth: `${1998 + (n % 7)}-0${(n % 9) + 1}-15`,
          }),
        );
      }
    }
    await players.save(ps);

    const ms: Match[] = [];
    let day = 1;
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const home_score = (i * 2 + j) % 4;
        const away_score = (j + i) % 3;
        ms.push(
          matches.create({
            league_id: league.id,
            home_team_id: ts[i].id,
            away_team_id: ts[j].id,
            scheduled_at: new Date(2026, 8, day, 19, 0, 0), // 19:00 local, not 19:00 UTC
            status: MatchStatus.FINISHED,
            home_score,
            away_score,
            venue: ts[i].stadium,
          }),
        );
        day++;
        if (day > 30) day = 1;
      }
    }
    await matches.save(ms);
    console.log('Seeded demo data. Admin: admin@league.local / Admin123!');
  } else {
    console.log('Seed already exists');
  }

  await seedPlayerMatchStatistics();
  await seedUpcomingMatches();

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
