import { useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2, Trophy, Users } from 'lucide-react';
import { api, useApi, type League } from '../api';
import { isAdmin } from '../auth';
import { Confirm, CrudForm, useCrud, type FieldDef } from '../components/ui';
import { Transfer } from '../components/Transfer';
import type { TransferColumn } from '../lib/transfer';
import { PageError, PageLoading } from './Dashboard';

type Team = { id: string; league_id: string };
type Match = { id: string; league_id: string; status: string };

const STATUSES = ['UPCOMING', 'ONGOING', 'FINISHED'] as const;

const FIELDS: FieldDef[] = [
  { name: 'name', label: 'League name', type: 'text', required: true, span: 2, placeholder: 'Indonesia Premier League' },
  { name: 'sport', label: 'Sport', type: 'text', required: true, placeholder: 'Football' },
  { name: 'season', label: 'Season', type: 'text', required: true, placeholder: '2026' },
  { name: 'start_date', label: 'Start date', type: 'date', required: true },
  { name: 'end_date', label: 'End date', type: 'date', required: true },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    required: true,
    defaultValue: 'ONGOING',
    options: STATUSES.map((s) => ({ value: s, label: s })),
  },
  { name: 'description', label: 'Description', type: 'textarea', span: 2, placeholder: 'Optional note shown under the league name' },
];

/**
 * Export/import column contract for leagues — the header row of every file we
 * hand out, and the field names we accept back. Keep in sync with
 * `CreateLeagueDto`.
 */
const LEAGUE_COLS: TransferColumn[] = [
  { key: 'id', label: 'id', kind: 'id', get: (l) => l.id },
  {
    key: 'name',
    label: 'name',
    kind: 'text',
    required: true,
    example: 'Indonesia Premier League',
    get: (l) => l.name,
  },
  { key: 'sport', label: 'sport', kind: 'text', required: true, example: 'Football', get: (l) => l.sport },
  { key: 'season', label: 'season', kind: 'text', required: true, example: '2026', get: (l) => l.season },
  {
    key: 'start_date',
    label: 'start date',
    kind: 'date',
    required: true,
    example: '2026-01-01',
    get: (l) => l.start_date,
  },
  { key: 'end_date', label: 'end date', kind: 'date', required: true, example: '2026-12-31', get: (l) => l.end_date },
  {
    key: 'status',
    label: 'status',
    kind: 'enum',
    required: true,
    values: ['UPCOMING', 'ONGOING', 'FINISHED'],
    get: (l) => l.status,
  },
  { key: 'description', label: 'description', kind: 'text', get: (l) => l.description ?? '' },
];

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '–';

export default function Leagues({ query }: { query: string }) {
  const leagues = useApi<League[]>('/leagues');
  const teams = useApi<Team[]>('/teams');
  const matches = useApi<Match[]>('/matches');

  const admin = isAdmin();
  const form = useCrud();
  const del = useCrud();
  const [open, setOpen] = useState<'new' | League | null>(null);
  const [removing, setRemoving] = useState<League | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);

  if (leagues.isLoading) return <PageLoading label="Loading leagues…" />;
  if (leagues.isError) return <PageError error={leagues.error} />;

  const q = query.trim().toLowerCase();
  const list = (leagues.data ?? []).filter(
    (l) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.sport.toLowerCase().includes(q) ||
      l.season.toLowerCase().includes(q) ||
      l.status.toLowerCase().includes(q),
  );

  const teamsOf = (id: string) => (teams.data ?? []).filter((t) => t.league_id === id).length;
  const matchesOf = (id: string) => (matches.data ?? []).filter((m) => m.league_id === id).length;
  const playedOf = (id: string) =>
    (matches.data ?? []).filter((m) => m.league_id === id && m.status === 'FINISHED').length;

  // ---- create / edit ----
  const save = async (payload: Record<string, unknown>) => {
    const ok = await form.run(async () => {
      if (open && open !== 'new') await api.patch(`/leagues/${open.id}`, payload);
      else await api.post('/leagues', payload);
    });
    if (ok) setOpen(null);
  };

  // ---- delete ----
  const askDelete = (l: League) => {
    setRemoving(l);
    setFacts([]);
    setFactsLoading(true);
    void api
      .get(`/leagues/${l.id}/usage`)
      .then((r) => {
        const d = r.data?.data ?? {};
        setFacts([
          d.teams ? `${d.teams} team(s) will be deleted` : '',
          d.players ? `${d.players} player(s) will be deleted` : '',
          d.matches ? `${d.matches} fixture(s) with their statistics will be deleted` : '',
        ].filter(Boolean));
      })
      .catch(() => setFacts([]))
      .finally(() => setFactsLoading(false));
  };

  const confirmDelete = async () => {
    if (!removing) return;
    const ok = await del.run(() => api.delete(`/leagues/${removing.id}`));
    if (ok) setRemoving(null);
  };

  return (
    <main>
      <div className="eyebrow">COMPETITIONS</div>
      <h1>Leagues</h1>
      <p className="muted">Every competition hosted on the platform.</p>

      <div className="cards cards-3">
        {[
          ['Leagues', leagues.data?.length ?? 0, Trophy],
          ['Teams', teams.data?.length ?? 0, Users],
          ['Matches', matches.data?.length ?? 0, CalendarDays],
        ].map(([label, value, Icon]: any) => (
          <div className="card" key={label}>
            <div className="icon">
              <Icon size={18} />
            </div>
            <div>
              <span>{label}</span>
              <strong>{teams.isLoading || matches.isLoading ? '…' : value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>All Leagues</h2>
          <div className="head-side">
            <span className="muted">{list.length} result(s)</span>
            <Transfer
              entity="leagues"
              base="leagues"
              columns={LEAGUE_COLS}
              rows={list}
              noun="league"
            />
            {admin && (
              <button className="btn-primary btn-sm" onClick={() => setOpen('new')}>
                <Plus size={14} /> New league
              </button>
            )}
          </div>
        </div>

        {list.length === 0 ? (
          <p className="muted">No leagues match “{query}”.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>LEAGUE</th>
                  <th>SPORT</th>
                  <th>SEASON</th>
                  <th>TEAMS</th>
                  <th>MATCHES</th>
                  <th>PLAYED</th>
                  <th>PERIOD</th>
                  <th>STATUS</th>
                  {admin && <th className="ta-r">ACTIONS</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.name}</b>
                      {l.description && <small className="sub">{l.description}</small>}
                    </td>
                    <td>{l.sport}</td>
                    <td>{l.season}</td>
                    <td>{teams.isLoading ? '…' : teamsOf(l.id)}</td>
                    <td>{matches.isLoading ? '…' : matchesOf(l.id)}</td>
                    <td>{matches.isLoading ? '…' : playedOf(l.id)}</td>
                    <td>
                      {fmtDate(l.start_date)} – {fmtDate(l.end_date)}
                    </td>
                    <td>
                      <span className={`badge badge-${l.status}`}>{l.status}</span>
                    </td>
                    {admin && (
                      <td className="ta-r">
                        <div className="row-actions end">
                          <button
                            className="icon-btn"
                            title={`Edit ${l.name}`}
                            onClick={() => {
                              form.reset();
                              setOpen(l);
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="icon-btn danger"
                            title={`Delete ${l.name}`}
                            onClick={() => askDelete(l)}
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
        )}
      </div>

      {open && (
        <CrudForm
          title={open === 'new' ? 'New league' : `Edit ${open.name}`}
          subtitle="LEAGUE"
          fields={FIELDS}
          initial={open === 'new' ? undefined : open}
          submitLabel={open === 'new' ? 'Create league' : 'Save changes'}
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
          subtitle="LEAGUE"
          message="This removes the competition and everything nested under it. This cannot be undone."
          facts={factsLoading ? ['Loading what will be affected…'] : facts}
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
