import {
  Trophy,
  Users,
  CalendarDays,
  BarChart3,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { useApi, useLeague, errMsg } from '../api';

type Summary = {
  totalTeams: number;
  totalPlayers: number;
  totalMatches: number;
  matchesPlayed: number;
  upcomingMatches: number;
  totalGoals: number;
};

type DashboardData = {
  summary?: Summary;
  recentMatches?: any[];
  upcomingMatches?: Fixture[];
};

type TeamLite = { id: string; name: string; short_name: string; stadium?: string };

type Fixture = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  status: string;
  venue?: string;
};

const kickoff = (iso: string) => {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
};

export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return <main className="loading">{label}</main>;
}

export function PageError({ error }: { error: unknown }) {
  return <main className="loading error">Backend error: {errMsg(error)}</main>;
}

export default function Dashboard() {
  const { leagueId, isLoading: leaguesLoading } = useLeague();
  const dash = useApi<DashboardData>('/dashboard');
  const teams = useApi<TeamLite[]>('/teams?league_id=' + leagueId, !!leagueId);
  const standings = useApi<any[]>('/leagues/' + leagueId + '/standings', !!leagueId);

  if (dash.isLoading || leaguesLoading || teams.isLoading)
    return <PageLoading label="Loading dashboard…" />;
  if (dash.isError) return <PageError error={dash.error} />;

  const teamById = new Map((teams.data ?? []).map((t) => [t.id, t]));
  const nameOf = (id: string) => teamById.get(id)?.name ?? `${String(id).slice(0, 8)}…`;

  const s = dash.data?.summary;
  const cards: any[] = [
    ['Teams', s?.totalTeams, Shield],
    ['Players', s?.totalPlayers, Users],
    ['Matches', s?.totalMatches, CalendarDays],
    ['Played', s?.matchesPlayed, Trophy],
    ['Upcoming', s?.upcomingMatches, CalendarDays],
    ['Goals', s?.totalGoals, BarChart3],
  ];

  const rows: any[] = standings.data ?? [];
  const upcoming: Fixture[] = dash.data?.upcomingMatches ?? [];

  return (
    <main>
      <div className="eyebrow">SPORTS ANALYTICS</div>
      <h1>League Dashboard</h1>
      <p className="muted">A modern command center for your competition.</p>

      <div className="cards">
        {cards.map(([label, value, Icon]) => (
          <div className="card" key={label}>
            <div className="icon">
              <Icon size={18} />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value ?? '–'}</strong>
            </div>
          </div>
        ))}
      </div>

      <section className="grid">
        <div className="panel">
          <div className="panel-head">
            <h2>League Table</h2>
            <a href="#standings">
              View full <ChevronRight size={16} />
            </a>
          </div>
          {standings.isLoading ? (
            <p className="muted">Loading standings…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>POS</th>
                  <th>TEAM</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GD</th>
                  <th>PTS</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8}>No standings available.</td>
                  </tr>
                )}
                {rows.slice(0, 6).map((r) => (
                  <tr key={r.team_id}>
                    <td>
                      <b>{r.position}</b>
                    </td>
                    <td className="team">{r.team}</td>
                    <td>{r.played}</td>
                    <td>{r.won}</td>
                    <td>{r.draw}</td>
                    <td>{r.lost}</td>
                    <td>{r.goal_difference}</td>
                    <td>
                      <b>{r.points}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Upcoming Matches</h2>
            <a href="#matches">
              All {s?.upcomingMatches ?? 0} <ChevronRight size={16} />
            </a>
          </div>

          {upcoming.length === 0 && (
            <p className="muted">No upcoming matches scheduled.</p>
          )}

          {upcoming.map((m) => (
            <div className="fixture" key={m.id}>
              <div className="fixture-date">{kickoff(m.scheduled_at)}</div>
              <div className="fixture-teams">
                <b>{nameOf(m.home_team_id)}</b>
                <span className="vs-badge">VS</span>
                <b>{nameOf(m.away_team_id)}</b>
              </div>
              <div className="fixture-venue">
                {m.venue || teamById.get(m.away_team_id)?.stadium || 'Venue TBC'}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
