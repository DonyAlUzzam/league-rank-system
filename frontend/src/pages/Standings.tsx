import { useApi, useLeague } from '../api';
import { Pagination, usePagination } from '../components/Pagination';
import { PageError, PageLoading } from './Dashboard';

type StandingRow = {
  position: number;
  team_id: string;
  team: string;
  logo_url?: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
};

type Match = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  status: string;
  home_score?: number | null;
  away_score?: number | null;
};

/** Last 5 FINISHED results for a team, oldest → newest. */
function recentForm(teamId: string, finished: Match[]): string[] {
  return finished
    .filter((m) => m.home_team_id === teamId || m.away_team_id === teamId)
    .slice(-5)
    .map((m) => {
      const isHome = m.home_team_id === teamId;
      const gf = isHome ? m.home_score ?? 0 : m.away_score ?? 0;
      const ga = isHome ? m.away_score ?? 0 : m.home_score ?? 0;
      return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    });
}

export default function Standings({ query }: { query: string }) {
  const { list, leagueId, league, select, isLoading: leaguesLoading, isError, error } =
    useLeague();
  const standings = useApi<StandingRow[]>(
    '/leagues/' + leagueId + '/standings',
    !!leagueId,
  );
  const matches = useApi<Match[]>('/matches?league_id=' + leagueId, !!leagueId);

  // ---- pure derivations (safe while queries are still loading) ----
  const finished = (matches.data ?? [])
    .filter((m) => m.status === 'FINISHED' && m.home_score != null && m.away_score != null)
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));

  const table = standings.data ?? [];
  const q = query.trim().toLowerCase();
  const rows = table.filter((r) => !q || r.team.toLowerCase().includes(q));

  const pg = usePagination(rows.length, {
    pageSize: 5,
    resetKey: `${leagueId}|${query}`,
  });

  // ---- hooks are all declared above: safe to bail out now ----
  if (leaguesLoading || standings.isLoading)
    return <PageLoading label="Loading standings…" />;
  if (isError) return <PageError error={error} />;
  if (standings.isError) return <PageError error={standings.error} />;

  const visible = rows.slice(pg.startIndex, pg.endIndex);
  const totalGoals = finished.reduce((s, m) => s + (m.home_score ?? 0) + (m.away_score ?? 0), 0);
  const relegationFrom = table.length - 2; // bottom 3 of the full table

  return (
    <main>
      <div className="eyebrow">LEAGUE TABLE</div>
      <h1>Standings</h1>
      <p className="muted">
        {league ? `${league.name} · Season ${league.season}` : 'Official ranking'}
        {' — '}Win 3 pts · Draw 1 pt · Loss 0 pts
      </p>

      <div className="toolbar">
        <label className="field">
          <span>League</span>
          <select value={leagueId} onChange={(e) => select(e.target.value)}>
            {list.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.season}
              </option>
            ))}
            {list.length === 0 && <option>No leagues available</option>}
          </select>
        </label>
        <div className="spacer" />
        <span className="legend">
          <i className="swatch swatch-title" /> Title
          <i className="swatch swatch-drop" /> Relegation
        </span>
      </div>

      <div className="cards cards-4">
        {[
          ['Teams', table.length],
          ['Matches Played', finished.length],
          ['Goals', matches.isLoading ? '…' : totalGoals],
          ['Leader', table[0]?.team ?? '–'],
        ].map(([label, value]: any) => (
          <div className="card" key={label}>
            <div>
              <span>{label}</span>
              <strong>{standings.isLoading ? '…' : value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Full Table</h2>
          {matches.isLoading && <span className="muted">Building form guide…</span>}
        </div>

        {rows.length === 0 ? (
          <p className="muted">No teams match “{query}”.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>POS</th>
                    <th>TEAM</th>
                    <th>P</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>GD</th>
                    <th>PTS</th>
                    <th>FORM</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const cls =
                      r.position <= 3 ? 'leader' : r.position >= relegationFrom ? 'danger' : '';
                    return (
                      <tr key={r.team_id} className={cls}>
                        <td>
                          <b>{r.position}</b>
                        </td>
                        <td className="team">
                          <a className="team-link" href={`#teams/${r.team_id}`} title={`Open ${r.team}`}>
                            {r.team}
                          </a>
                        </td>
                        <td>{r.played}</td>
                        <td>{r.won}</td>
                        <td>{r.draw}</td>
                        <td>{r.lost}</td>
                        <td>{r.goals_for}</td>
                        <td>{r.goals_against}</td>
                        <td
                          className={
                            r.goal_difference > 0
                              ? 'plus'
                              : r.goal_difference < 0
                                ? 'minus'
                                : ''
                          }
                        >
                          {r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}
                        </td>
                        <td>
                          <b>{r.points}</b>
                        </td>
                        <td>
                          <span className="form">
                            {recentForm(r.team_id, finished).map((res, i) => (
                              <i key={i} className={res}>
                                {res}
                              </i>
                            ))}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={pg.page}
              totalPages={pg.totalPages}
              from={pg.from}
              to={pg.to}
              total={rows.length}
              onPage={pg.setPage}
              pageSize={pg.pageSize}
              onPageSize={pg.setPageSize}
              sizes={[5, 10, 25, 50]}
            />
          </>
        )}
      </div>
    </main>
  );
}
