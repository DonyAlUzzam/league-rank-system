import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useApi, useLeague } from '../api';
import { isAdmin } from '../auth';
import { Confirm, CrudForm, useCrud, type FieldDef } from '../components/ui';
import { Transfer } from '../components/Transfer';
import type { TransferColumn } from '../lib/transfer';
import { Pagination, usePagination } from '../components/Pagination';
import { POS_LABEL, POSITIONS, type Position } from '../lib/positions';
import { PageError, PageLoading } from './Dashboard';

type Team = { id: string; league_id: string; name: string; short_name: string };

type Player = {
  id: string;
  team_id: string;
  team?: Team;
  name: string;
  jersey_number: number;
  position: Position;
  nationality: string;
  date_of_birth?: string | null;
  photo_url?: string | null;
};

type PlayerStat = {
  player_id: string;
  matches_played: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
};

type Row = Player &
  Partial<PlayerStat> & { team_name: string; short: string };

export default function Players({ query }: { query: string }) {
  const { list, leagueId, select, isLoading: leaguesLoading, isError, error } = useLeague();
  const teams = useApi<Team[]>('/teams?league_id=' + leagueId, !!leagueId);
  const players = useApi<Player[]>('/players');
  const stats = useApi<PlayerStat[]>('/statistics/players');

  const admin = isAdmin();
  const form = useCrud();
  const del = useCrud();
  const [open, setOpen] = useState<'new' | Player | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);

  // ---- pure derivations (safe while queries are still loading) ----
  const leagueTeams = new Map((teams.data ?? []).map((t) => [t.id, t]));
  const statById = new Map((stats.data ?? []).map((s) => [s.player_id, s]));

  const q = query.trim().toLowerCase();
  const rows: Row[] = (players.data ?? [])
    // Keep only players belonging to the selected league.
    .filter((p) => leagueTeams.has(p.team_id))
    .map((p) => ({
      ...p,
      team_name: leagueTeams.get(p.team_id)?.name ?? '',
      short: leagueTeams.get(p.team_id)?.short_name ?? '',
      ...(statById.get(p.id) ?? {
        matches_played: 0,
        goals: 0,
        assists: 0,
        yellow_cards: 0,
        red_cards: 0,
      }),
    }))
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.team_name.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q),
    )
    .sort(
      (a, b) =>
        (b.goals ?? 0) - (a.goals ?? 0) ||
        (b.assists ?? 0) - (a.assists ?? 0) ||
        a.name.localeCompare(b.name),
    );

  const pg = usePagination(rows.length, { resetKey: `${leagueId}|${query}` });

  // ---- hooks are all declared above: safe to bail out now ----
  if (leaguesLoading || players.isLoading) return <PageLoading label="Loading players…" />;
  if (isError) return <PageError error={error} />;
  if (players.isError) return <PageError error={players.error} />;

  const visible = rows.slice(pg.startIndex, pg.endIndex);

  /**
   * `team` is the club's name (resolved back by the backend) so the sheet is
   * readable; `id` is what decides create-vs-update on the way back in.
   */
  const PLAYER_COLS: TransferColumn[] = [
    { key: 'id', label: 'id', kind: 'id', get: (p) => p.id },
    { key: 'team', label: 'team', kind: 'text', required: true, example: 'Jakarta FC', get: (p) => p.team_name },
    { key: 'name', label: 'name', kind: 'text', required: true, example: 'Egy Maulana', get: (p) => p.name },
    {
      key: 'jersey_number',
      label: 'jersey number',
      kind: 'int',
      required: true,
      example: '10',
      get: (p) => p.jersey_number,
    },
    {
      key: 'position',
      label: 'position',
      kind: 'enum',
      required: true,
      values: POSITIONS,
      get: (p) => p.position,
    },
    {
      key: 'nationality',
      label: 'nationality',
      kind: 'text',
      required: true,
      example: 'Indonesia',
      get: (p) => p.nationality,
    },
    {
      key: 'date_of_birth',
      label: 'date of birth',
      kind: 'date',
      example: '1999-05-04',
      get: (p) => p.date_of_birth ?? '',
    },
    { key: 'photo_url', label: 'photo url', kind: 'text', get: (p) => p.photo_url ?? '' },
  ];
  const sum = (k: 'matches_played' | 'goals' | 'assists' | 'yellow_cards' | 'red_cards') =>
    rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const topScorers = rows.filter((r) => (r.goals ?? 0) > 0).slice(0, 5);

  const playerFields: FieldDef[] = [
    {
      name: 'team_id',
      label: 'Team',
      type: 'select',
      required: true,
      options: (teams.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    },
    { name: 'name', label: 'Full name', type: 'text', required: true, placeholder: 'Egy Maulana' },
    { name: 'jersey_number', label: 'Jersey number', type: 'number', required: true, min: 0, max: 999, defaultValue: '1' },
    {
      name: 'position',
      label: 'Position',
      type: 'select',
      required: true,
      defaultValue: 'MIDFIELDER',
      options: POSITIONS.map((p) => ({ value: p, label: POS_LABEL[p] })),
    },
    { name: 'nationality', label: 'Nationality', type: 'text', required: true, placeholder: 'Indonesia' },
    { name: 'date_of_birth', label: 'Date of birth', type: 'date' },
    { name: 'photo_url', label: 'Photo URL', type: 'text', span: 2, placeholder: 'https://…' },
  ];

  const save = async (payload: Record<string, unknown>) => {
    const ok = await form.run(async () => {
      if (open && open !== 'new') await api.patch(`/players/${open.id}`, payload);
      else await api.post('/players', payload);
    });
    if (ok) setOpen(null);
  };

  const confirmDelete = async () => {
    if (!removing) return;
    const ok = await del.run(() => api.delete(`/players/${removing.id}`));
    if (ok) setRemoving(null);
  };

  return (
    <main>
      <div className="eyebrow">SQUAD DATA</div>
      <h1>Players</h1>
      <p className="muted">Individual performance across the selected competition.</p>

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
        <span className="chip chip-muted">
          {rows.length} / {players.data?.length ?? 0} players
        </span>
        <Transfer entity="players" base="players" columns={PLAYER_COLS} rows={rows} noun="player" />
        {admin && (
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              form.reset();
              setOpen('new');
            }}
          >
            <Plus size={14} /> New player
          </button>
        )}
      </div>

      <div className="cards cards-4">
        {[
          ['Players', rows.length],
          ['Goals', sum('goals')],
          ['Assists', sum('assists')],
          ['Yellow Cards', sum('yellow_cards')],
        ].map(([label, value]: any) => (
          <div className="card" key={label}>
            <div>
              <span>{label}</span>
              <strong>{stats.isLoading ? '…' : value}</strong>
            </div>
          </div>
        ))}
      </div>

      <section className="grid">
        <div className="panel">
          <div className="panel-head">
            <h2>All Players</h2>
            <span className="muted">Ranked by goals</span>
          </div>

          {rows.length === 0 ? (
            <p className="muted">No players match “{query}”.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>PLAYER</th>
                      <th>TEAM</th>
                      <th>POS</th>
                      <th>#</th>
                      <th>MP</th>
                      <th>G</th>
                      <th>A</th>
                      <th>YC</th>
                      <th>RC</th>
                      {admin && <th className="ta-r">ACTIONS</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => (
                      <tr key={p.id}>
                        <td className="team">
                          <b>{p.name}</b>
                          <small className="sub">{p.nationality}</small>
                        </td>
                        <td>
                          <span className="crest">{p.short}</span>
                          {p.team_name}
                        </td>
                        <td>
                          <span className={`pos pos-${p.position}`}>
                            {POS_LABEL[p.position]}
                          </span>
                        </td>
                        <td>{p.jersey_number}</td>
                        <td>{p.matches_played ?? 0}</td>
                        <td>
                          <b>{p.goals ?? 0}</b>
                        </td>
                        <td>{p.assists ?? 0}</td>
                        <td>{p.yellow_cards ?? 0}</td>
                        <td>{p.red_cards ?? 0}</td>
                        {admin && (
                          <td className="ta-r">
                            <div className="row-actions end">
                              <button
                                className="icon-btn"
                                title={`Edit ${p.name}`}
                                onClick={() => {
                                  form.reset();
                                  setOpen(p);
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                className="icon-btn danger"
                                title={`Delete ${p.name}`}
                                onClick={() => {
                                  setRemoving(p);
                                  del.reset();
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
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
              />
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Top Scorers</h2>
          </div>
          {topScorers.length === 0 && <p className="muted">No goals recorded yet.</p>}
          {topScorers.map((p, i) => (
            <div className="match" key={p.id}>
              <div>
                <small>{p.team_name}</small>
                <b>{p.name}</b>
              </div>
              <span className="rank">{i + 1}</span>
              <span className="goals">{p.goals ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      {open && (
        <CrudForm
          key={open === 'new' ? 'new' : open.id}
          title={open === 'new' ? 'New player' : `Edit ${open.name}`}
          subtitle="PLAYER"
          fields={playerFields}
          initial={open === 'new' ? { team_id: leagueId } : open}
          submitLabel={open === 'new' ? 'Create player' : 'Save changes'}
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
          subtitle="PLAYER"
          message="The player is removed from the squad and their per-match statistics are deleted with them."
          facts={[
            removing.team_name ? `Plays for ${removing.team_name}` : '',
            (removing.matches_played ?? 0) > 0
              ? `${removing.matches_played} statistic row(s) will be deleted`
              : 'No statistics recorded yet',
          ].filter(Boolean)}
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
