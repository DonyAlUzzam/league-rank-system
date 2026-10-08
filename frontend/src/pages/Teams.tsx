import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useApi, useLeague } from '../api';
import { isAdmin } from '../auth';
import { Confirm, CrudForm, useCrud, type FieldDef } from '../components/ui';
import { Transfer } from '../components/Transfer';
import type { TransferColumn } from '../lib/transfer';
import { PageError, PageLoading } from './Dashboard';

type Team = {
  id: string;
  league_id: string;
  name: string;
  short_name: string;
  logo_url?: string;
  city?: string;
  stadium?: string;
  founded_year?: number | null;
  history?: string | null;
};

type StandingRow = {
  position: number;
  team_id: string;
  team: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goal_difference: number;
  points: number;
};

type TeamStat = { team_id: string; win_percentage: number };

export default function Teams({ query }: { query: string }) {
  const { list, leagueId, league, select, isLoading: leaguesLoading, isError, error } = useLeague();
  const teams = useApi<Team[]>('/teams?league_id=' + leagueId, !!leagueId);
  const standings = useApi<StandingRow[]>(
    '/leagues/' + leagueId + '/standings',
    !!leagueId,
  );
  const stats = useApi<TeamStat[]>('/statistics/teams');

  const admin = isAdmin();
  const form = useCrud();
  const del = useCrud();
  const [open, setOpen] = useState<'new' | Team | null>(null);
  const [removing, setRemoving] = useState<Team | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);

  if (leaguesLoading || teams.isLoading) return <PageLoading label="Loading teams…" />;
  if (isError) return <PageError error={error} />;
  if (teams.isError) return <PageError error={teams.error} />;

  const q = query.trim().toLowerCase();
  const teamById = new Map((teams.data ?? []).map((t) => [t.id, t]));
  const statById = new Map((stats.data ?? []).map((s) => [s.team_id, s]));

  // Standings give the official ranking; fall back to the raw team list when a
  // league has no finished matches yet.
  const source: StandingRow[] =
    standings.data ??
    (teams.data ?? []).map((t, i) => ({
      position: i + 1,
      team_id: t.id,
      team: t.name,
      played: 0,
      won: 0,
      draw: 0,
      lost: 0,
      goal_difference: 0,
      points: 0,
    }));

  const rows = source
    .map((r) => {
      const t = teamById.get(r.team_id);
      return {
        ...r,
        city: t?.city || '–',
        stadium: t?.stadium || '–',
        short_name: t?.short_name || '',
        win_percentage: statById.get(r.team_id)?.win_percentage ?? 0,
      };
    })
    .filter(
      (r) =>
        !q ||
        r.team.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.stadium.toLowerCase().includes(q) ||
        r.short_name.toLowerCase().includes(q),
    );

  const isEdit = !!open && open !== 'new';

  /**
   * `league` is a *name* rather than a uuid so the file stays readable — the
   * backend resolves it back. It is also why a team can never change league
   * through a spreadsheet, exactly like the edit form.
   */
  const TEAM_COLS: TransferColumn[] = [
    { key: 'id', label: 'id', kind: 'id', get: (r) => r.team_id },
    {
      key: 'league',
      label: 'league',
      kind: 'text',
      required: true,
      example: league?.name ?? '',
      get: () => league?.name ?? '',
    },
    { key: 'name', label: 'name', kind: 'text', required: true, example: 'Jakarta FC', get: (r) => r.team },
    {
      key: 'short_name',
      label: 'short name',
      kind: 'text',
      required: true,
      example: 'JKT',
      get: (r) => r.short_name,
    },
    { key: 'city', label: 'city', kind: 'text', example: 'Jakarta', get: (r) => (r.city === '–' ? '' : r.city) },
    {
      key: 'stadium',
      label: 'stadium',
      kind: 'text',
      example: 'Gelora Bung Karno',
      get: (r) => (r.stadium === '–' ? '' : r.stadium),
    },
    { key: 'logo_url', label: 'logo url', kind: 'text', get: (r) => teamById.get(r.team_id)?.logo_url ?? '' },
    {
      key: 'founded_year',
      label: 'founded year',
      kind: 'int',
      example: '1970',
      get: (r) => teamById.get(r.team_id)?.founded_year ?? '',
    },
    {
      key: 'history',
      label: 'history',
      kind: 'text',
      example: 'Founded in 1970…',
      get: (r) => teamById.get(r.team_id)?.history ?? '',
    },
  ];

  const teamFields: FieldDef[] = [
    {
      name: 'league_id',
      label: 'League',
      type: 'select',
      required: true,
      defaultValue: leagueId,
      readOnly: isEdit,
      hint: isEdit ? 'Changing league would orphan existing fixtures — create a team in the target league instead.' : undefined,
      options: list.map((l) => ({ value: l.id, label: `${l.name} · ${l.season}` })),
    },
    { name: 'name', label: 'Team name', type: 'text', required: true, placeholder: 'Jakarta FC' },
    { name: 'short_name', label: 'Short name', type: 'text', required: true, placeholder: 'JKT' },
    { name: 'city', label: 'City', type: 'text', placeholder: 'Jakarta' },
    { name: 'stadium', label: 'Stadium', type: 'text', placeholder: 'Gelora Bung Karno' },
    {
      name: 'founded_year',
      label: 'Founded',
      type: 'number',
      min: 1000,
      max: 2100,
      placeholder: '1970',
      hint: 'Shown on the club page. Leave blank if unknown.',
    },
    { name: 'logo_url', label: 'Logo URL', type: 'text', span: 2, placeholder: 'https://…' },
    {
      name: 'history',
      label: 'Club history',
      type: 'textarea',
      span: 2,
      placeholder: 'Founded in 1970 as…',
      hint: 'The story shown on the club page. Leave blank to clear it.',
    },
  ];

  const save = async (payload: Record<string, unknown>) => {
    const ok = await form.run(async () => {
      if (open && open !== 'new') await api.patch(`/teams/${open.id}`, payload);
      else await api.post('/teams', payload);
    });
    if (ok) setOpen(null);
  };

  const askDelete = (t: Team) => {
    setRemoving(t);
    setFacts([]);
    setFactsLoading(true);
    void api
      .get(`/teams/${t.id}/usage`)
      .then((r) => {
        const d = r.data?.data ?? {};
        setFacts(
          [
            d.players ? `${d.players} player(s) will be deleted with the team` : '',
            d.fixtures
              ? `BLOCKED — ${d.fixtures} fixture(s) still reference this team; delete them first`
              : 'No fixtures reference this team',
          ].filter(Boolean),
        );
      })
      .catch(() => setFacts([]))
      .finally(() => setFactsLoading(false));
  };

  const confirmDelete = async () => {
    if (!removing) return;
    const ok = await del.run(() => api.delete(`/teams/${removing.id}`));
    if (ok) setRemoving(null);
  };

  return (
    <main>
      <div className="eyebrow">SQUADS</div>
      <h1>Teams</h1>
      <p className="muted">Club roster and performance for the selected competition.</p>

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

        <span className="chip">
          {league ? `${league.name} · ${league.status}` : 'No league selected'}
        </span>
        <span className="chip chip-muted">
          {rows.length} / {teams.data?.length ?? 0} teams
        </span>
        <Transfer entity="teams" base="teams" columns={TEAM_COLS} rows={rows} noun="team" />
        {admin && (
          <button className="btn-primary btn-sm" onClick={() => setOpen('new')}>
            <Plus size={14} /> New team
          </button>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>League Teams</h2>
          {standings.isLoading && <span className="muted">Computing standings…</span>}
        </div>

        {rows.length === 0 ? (
          <p className="muted">No teams match “{query}”.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>POS</th>
                  <th>TEAM</th>
                  <th>CITY</th>
                  <th>STADIUM</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GD</th>
                  <th>PTS</th>
                  <th>WIN %</th>
                  {admin && <th className="ta-r">ACTIONS</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const team = teamById.get(r.team_id);
                  return (
                    <tr key={r.team_id}>
                      <td>
                        <b>{r.position}</b>
                      </td>
                      <td className="team">
                        <span className="crest">{r.short_name || r.team.slice(0, 2)}</span>
                        <a className="team-link" href={`#teams/${r.team_id}`} title={`Open ${r.team}`}>
                          {r.team}
                        </a>
                      </td>
                      <td>{r.city}</td>
                      <td>{r.stadium}</td>
                      <td>{r.played}</td>
                      <td>{r.won}</td>
                      <td>{r.draw}</td>
                      <td>{r.lost}</td>
                      <td>{r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}</td>
                      <td>
                        <b>{r.points}</b>
                      </td>
                      <td>{r.win_percentage}%</td>
                      {admin && (
                        <td className="ta-r">
                          <div className="row-actions end">
                            <button
                              className="icon-btn"
                              title={`Edit ${r.team}`}
                              disabled={!team}
                              onClick={() => {
                                form.reset();
                                setOpen(team!);
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="icon-btn danger"
                              title={`Delete ${r.team}`}
                              disabled={!team}
                              onClick={() => team && askDelete(team)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <CrudForm
          key={open === 'new' ? 'new' : open.id}
          title={open === 'new' ? 'New team' : `Edit ${open.name}`}
          subtitle="TEAM"
          fields={teamFields}
          initial={open === 'new' ? undefined : open}
          submitLabel={open === 'new' ? 'Create team' : 'Save changes'}
          busy={form.busy}
          error={form.error}
          onSubmit={save}
          onClose={() => {
            form.reset();
            setOpen(null);
          }}
        />
      )}

      {removing && (
        <Confirm
          title={`Delete ${removing.name}?`}
          subtitle="TEAM"
          message="Deleting a team removes its squad. Fixtures must be removed first."
          facts={factsLoading ? ['Checking what will be affected…'] : facts}
          busy={del.busy}
          error={del.error}
          onConfirm={confirmDelete}
          onClose={() => {
            del.reset();
            setRemoving(null);
          }}
        />
      )}
    </main>
  );
}
