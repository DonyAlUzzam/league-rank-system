import { Fragment, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useApi, useLeague, api, queryClient, errMsg } from '../api';
import { isAdmin } from '../auth';
import { Confirm, CrudForm, useCrud, type FieldDef } from '../components/ui';
import { Transfer } from '../components/Transfer';
import type { TransferColumn } from '../lib/transfer';
import { Pagination, usePagination } from '../components/Pagination';
import { PageError, PageLoading } from './Dashboard';

type Team = { id: string; name: string; short_name: string };

type Match = {
  id: string;
  league_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  home_score?: number | null;
  away_score?: number | null;
  venue?: string;
  /** set by the backend when a previous result exists to undo */
  can_revert?: boolean;
};

type StandingRow = {
  position: number;
  team_id: string;
  points: number;
  goal_difference: number;
};

type Feedback = { kind: 'ok' | 'err'; title: string; detail?: string };

const STATUSES: Array<Match['status'] | 'ALL'> = [
  'ALL',
  'FINISHED',
  'SCHEDULED',
  'LIVE',
  'POSTPONED',
  'CANCELLED',
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const gd = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** ISO → the `YYYY-MM-DDTHH:mm` value an `<input type="datetime-local">` wants. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const FIXTURE_STATUSES: Array<Match['status']> = [
  'SCHEDULED',
  'LIVE',
  'FINISHED',
  'POSTPONED',
  'CANCELLED',
];

export default function Matches({ query }: { query: string }) {
  const [statusFilter, setStatusFilter] = useState<Match['status'] | 'ALL'>('ALL');

  // match simulator state
  const [editing, setEditing] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // fixture CRUD state
  const form = useCrud();
  const del = useCrud();
  const [fixtureOpen, setFixtureOpen] = useState<'new' | Match | null>(null);
  const [removing, setRemoving] = useState<Match | null>(null);

  const { list, leagueId, select, isLoading: leaguesLoading, isError, error } = useLeague();
  const matches = useApi<Match[]>('/matches?league_id=' + leagueId, !!leagueId);
  const teams = useApi<Team[]>('/teams?league_id=' + leagueId, !!leagueId);

  // ---- pure derivations (safe while queries are still loading) ----
  const teamById = new Map((teams.data ?? []).map((t) => [t.id, t]));
  const nameOf = (id: string) => teamById.get(id)?.name ?? 'Unknown team';
  const shortOf = (id: string) => teamById.get(id)?.short_name ?? '??';

  const all = matches.data ?? [];
  const finished = all.filter((m) => m.status === 'FINISHED');
  const goals = finished.reduce((s, m) => s + (m.home_score ?? 0) + (m.away_score ?? 0), 0);

  const q = query.trim().toLowerCase();
  const rows = all
    .filter((m) => statusFilter === 'ALL' || m.status === statusFilter)
    .filter(
      (m) =>
        !q ||
        nameOf(m.home_team_id).toLowerCase().includes(q) ||
        nameOf(m.away_team_id).toLowerCase().includes(q) ||
        (m.venue ?? '').toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q),
    );

  const pg = usePagination(rows.length, {
    pageSize: 10,
    resetKey: `${leagueId}|${statusFilter}|${query}`,
  });

  // ---- hooks are all declared above: safe to bail out now ----
  if (leaguesLoading || matches.isLoading) return <PageLoading label="Loading matches…" />;
  if (isError) return <PageError error={error} />;
  if (matches.isError) return <PageError error={matches.error} />;

  const visible = rows.slice(pg.startIndex, pg.endIndex);

  /**
   * Teams are exported by name rather than uuid — readable in Excel, and the
   * backend resolves them (and derives the league from the home side).
   */
  const FIXTURE_COLS: TransferColumn[] = [
    { key: 'id', label: 'id', kind: 'id', get: (m) => m.id },
    { key: 'home_team', label: 'home team', kind: 'text', required: true, get: (m) => nameOf(m.home_team_id) },
    { key: 'away_team', label: 'away team', kind: 'text', required: true, get: (m) => nameOf(m.away_team_id) },
    {
      key: 'scheduled_at',
      label: 'kick off',
      kind: 'datetime',
      required: true,
      example: '2026-10-10 19:00',
      get: (m) => m.scheduled_at,
    },
    {
      key: 'status',
      label: 'status',
      kind: 'enum',
      required: true,
      values: FIXTURE_STATUSES,
      get: (m) => m.status,
    },
    {
      key: 'home_score',
      label: 'home score',
      kind: 'int',
      example: '3',
      note: 'required when status is FINISHED',
      get: (m) => m.home_score ?? '',
    },
    {
      key: 'away_score',
      label: 'away score',
      kind: 'int',
      example: '1',
      note: 'required when status is FINISHED',
      get: (m) => m.away_score ?? '',
    },
    { key: 'venue', label: 'venue', kind: 'text', example: 'Gelora Bung Karno', get: (m) => m.venue ?? '' },
  ];

  // Role gate — the API answers 403 anyway, but a disabled button says so
  // before the round-trip.
  const admin = isAdmin();

  // ---- simulator actions ----
  const openEditor = (m: Match) => {
    setEditing(m.id);
    setHomeScore(m.home_score != null ? String(m.home_score) : '');
    setAwayScore(m.away_score != null ? String(m.away_score) : '');
    setFeedback(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setFeedback(null);
  };

  /** Where both teams ended up after a standings recompute. */
  const rankingDetail = (table: StandingRow[], m: Match) =>
    [
      (() => {
        const r = table.find((x) => x.team_id === m.home_team_id);
        return r && `${nameOf(m.home_team_id)} now #${r.position} · ${r.points} pts · GD ${gd(r.goal_difference)}`;
      })(),
      (() => {
        const r = table.find((x) => x.team_id === m.away_team_id);
        return r && `${nameOf(m.away_team_id)} now #${r.position} · ${r.points} pts · GD ${gd(r.goal_difference)}`;
      })(),
    ]
      .filter(Boolean)
      .join('  ·  ');

  const submit = async (m: Match) => {
    const h = Number(homeScore);
    const a = Number(awayScore);
    if (!isAdmin()) {
      setFeedback({ kind: 'err', title: 'Your account is read-only — ADMIN is required to save a result.' });
      return;
    }
    if (
      homeScore === '' ||
      awayScore === '' ||
      !Number.isInteger(h) ||
      !Number.isInteger(a) ||
      h < 0 ||
      a < 0 ||
      h > 99 ||
      a > 99
    ) {
      setFeedback({ kind: 'err', title: 'Enter whole numbers between 0 and 99 on both sides.' });
      return;
    }

    setPending(true);
    setFeedback(null);
    try {
      const res = await api.post(`/matches/${m.id}/simulate`, {
        home_score: h,
        away_score: a,
      });
      const data = res.data?.data ?? {};
      const table: StandingRow[] = data.standings ?? [];

      // Everything else is derived — drop the cache so dashboard, standings,
      // players and statistics refetch the moment we land back on them.
      await queryClient.invalidateQueries();

      // Close the editor: the result is on the server now, so there is no
      // half-typed score left behind (and no doubt about what Cancel does).
      setEditing(null);
      setHomeScore('');
      setAwayScore('');

      setFeedback({
        kind: 'ok',
        title: `Saved — ${nameOf(m.home_team_id)} ${h}–${a} ${nameOf(m.away_team_id)}`,
        detail: [rankingDetail(table, m), `${data.stats_generated ?? 0} player-stat rows rebuilt`]
          .filter(Boolean)
          .join('  ·  '),
      });
    } catch (e) {
      setFeedback({ kind: 'err', title: errMsg(e) });
    } finally {
      setPending(false);
    }
  };

  /** Undo the last saved simulation for this fixture. */
  const revert = async (m: Match) => {
    if (!isAdmin()) {
      setFeedback({ kind: 'err', title: 'Your account is read-only — ADMIN is required to undo a result.' });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const res = await api.post(`/matches/${m.id}/revert`);
      const data = res.data?.data ?? {};
      const table: StandingRow[] = data.standings ?? [];
      const restored = data.restored ?? {};
      const back =
        restored.status === 'FINISHED' && restored.home_score != null
          ? `→ ${restored.home_score}–${restored.away_score}`
          : '→ back to SCHEDULED';

      await queryClient.invalidateQueries();

      if (editing === m.id) {
        setEditing(null);
        setHomeScore('');
        setAwayScore('');
      }

      setFeedback({
        kind: 'ok',
        title: `Reverted — ${nameOf(m.home_team_id)} vs ${nameOf(m.away_team_id)} ${back}`,
        detail: [
          rankingDetail(table, m),
          restored.status === 'FINISHED'
            ? `${data.stats_generated ?? 0} player-stat rows rebuilt`
            : 'player stats for this fixture removed',
        ]
          .filter(Boolean)
          .join('  ·  '),
      });
    } catch (e) {
      setFeedback({ kind: 'err', title: errMsg(e) });
    } finally {
      setPending(false);
    }
  };

  // ---- fixture CRUD (create / reschedule / delete) ----
  const teamOptions = (teams.data ?? []).map((t) => ({ value: t.id, label: t.name }));

  const fixtureFields: FieldDef[] = [
    { name: 'home_team_id', label: 'Home team', type: 'select', required: true, options: teamOptions },
    { name: 'away_team_id', label: 'Away team', type: 'select', required: true, options: teamOptions },
    {
      name: 'scheduled_at',
      label: 'Kick-off',
      type: 'datetime-local',
      required: true,
      defaultValue: toLocalInput(new Date().toISOString()),
      hint: 'Local time of your browser',
    },
    { name: 'venue', label: 'Venue', type: 'text', placeholder: 'Gelora Bung Karno' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'SCHEDULED',
      options: FIXTURE_STATUSES.map((s) => ({ value: s, label: s })),
    },
    { name: 'home_score', label: 'Home score', type: 'number', min: 0, max: 99, hint: 'Required when status = FINISHED' },
    { name: 'away_score', label: 'Away score', type: 'number', min: 0, max: 99 },
  ];

  const fixtureInitial =
    fixtureOpen && fixtureOpen !== 'new'
      ? { ...fixtureOpen, scheduled_at: toLocalInput(fixtureOpen.scheduled_at) }
      : undefined;

  const saveFixture = async (payload: Record<string, unknown>) => {
    // The fixture never changes league — it belongs to the one selected above.
    const leagueOf = fixtureOpen && fixtureOpen !== 'new' ? fixtureOpen.league_id : leagueId;
    const body = { ...payload, league_id: leagueOf };
    const ok = await form.run(async () => {
      if (fixtureOpen && fixtureOpen !== 'new') await api.patch(`/matches/${fixtureOpen.id}`, body);
      else await api.post('/matches', body);
    });
    if (ok) setFixtureOpen(null);
  };

  const confirmDeleteFixture = async () => {
    if (!removing) return;
    const ok = await del.run(() => api.delete(`/matches/${removing.id}`));
    if (ok) setRemoving(null);
  };

  return (
    <main>
      <div className="eyebrow">FIXTURES</div>
      <h1>Matches</h1>
      <p className="muted">Every fixture, result and venue for the selected competition.</p>

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

        <label className="field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : s}
              </option>
            ))}
          </select>
        </label>

        <div className="spacer" />
        <span className="chip chip-muted">
          {rows.length} / {all.length} matches
        </span>
        <Transfer
          entity="matches"
          base="fixtures"
          columns={FIXTURE_COLS}
          rows={rows}
          noun="fixture"
        />
        {admin && (
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              form.reset();
              setFixtureOpen('new');
            }}
          >
            <Plus size={14} /> New fixture
          </button>
        )}
      </div>

      <div className="cards cards-4">
        {[
          ['Matches', all.length],
          ['Played', finished.length],
          ['Goals', goals],
          ['Avg / Match', finished.length ? (goals / finished.length).toFixed(2) : '–'],
        ].map(([label, value]: any) => (
          <div className="card" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Fixtures</h2>
          <span className="muted">Newest first</span>
        </div>

        <p className="hint">
          <b>Match simulator</b> — open any fixture, type a final score and save.
          The backend recomputes W/D/L, GF, GA, GD, points, ranking, player
          statistics and the dashboard automatically. Changed your mind? Press{' '}
          <b>Undo</b> on the same row to step the fixture back to its previous
          result (or to <i>SCHEDULED</i> if it was never played). <b>Cancel</b>{' '}
          only closes the form — it never sends anything to the server.{' '}
          {!admin && (
            <>
              <b>You are signed in as a read-only member</b> — these buttons
              stay disabled until an ADMIN account signs in.
            </>
          )}
        </p>

        {feedback && (
          <div className={`sim-banner ${feedback.kind}`} role="status">
            <div>
              <b>{feedback.title}</b>
              {feedback.detail && <small>{feedback.detail}</small>}
            </div>
            <button type="button" onClick={closeEditor} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="muted">No matches match the current filter.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>HOME</th>
                    <th>SCORE</th>
                    <th>AWAY</th>
                    <th>VENUE</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => (
                    <Fragment key={m.id}>
                      <tr>
                        <td>
                          {fmtDate(m.scheduled_at)}
                          <small className="sub">{fmtTime(m.scheduled_at)}</small>
                        </td>
                        <td className="team">
                          <span className="crest">{shortOf(m.home_team_id)}</span>
                          {nameOf(m.home_team_id)}
                        </td>
                        <td className="score">
                          {m.home_score != null && m.status === 'FINISHED' ? (
                            <b>
                              {m.home_score} : {m.away_score}
                            </b>
                          ) : (
                            <span className="vs">vs</span>
                          )}
                        </td>
                        <td className="team">
                          <span className="crest">{shortOf(m.away_team_id)}</span>
                          {nameOf(m.away_team_id)}
                        </td>
                        <td>{m.venue || '–'}</td>
                        <td>
                          <span className={`badge badge-${m.status}`}>{m.status}</span>
                        </td>
                        <td>
                          {editing === m.id ? (
                            <span className="sim-editing">editing…</span>
                          ) : (
                            <div className="row-actions">
                              <button
                                className="btn-ghost"
                                onClick={() => openEditor(m)}
                                disabled={!admin}
                                title={admin ? undefined : 'Read-only account — ADMIN required'}
                              >
                                {m.status === 'FINISHED' ? 'Edit result' : 'Simulate'}
                              </button>
                              {m.can_revert && (
                                <button
                                  className="btn-warn"
                                  onClick={() => void revert(m)}
                                  disabled={pending || !admin}
                                  title={
                                    admin
                                      ? 'Undo the last saved simulation for this fixture'
                                      : 'Read-only account — ADMIN required'
                                  }
                                >
                                  Undo
                                </button>
                              )}
                              {admin && (
                                <>
                                  <button
                                    className="icon-btn"
                                    title="Reschedule / change venue, status or score line"
                                    onClick={() => {
                                      form.reset();
                                      setFixtureOpen(m);
                                    }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    className="icon-btn danger"
                                    disabled={m.status === 'FINISHED'}
                                    title={
                                      m.status === 'FINISHED'
                                        ? 'Finished fixtures cannot be deleted — set it back to SCHEDULED first'
                                        : `Delete ${nameOf(m.home_team_id)} vs ${nameOf(m.away_team_id)}`
                                    }
                                    onClick={() => {
                                      del.reset();
                                      setRemoving(m);
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {editing === m.id && (
                        <tr className="edit-row">
                          <td colSpan={7}>
                            <form
                              className="sim-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void submit(m);
                              }}
                            >
                              <span className="sim-title">
                                {m.status === 'FINISHED'
                                  ? 'Re-simulate final result'
                                  : 'Enter final result'}
                              </span>

                              <span className="sim-team">{nameOf(m.home_team_id)}</span>
                              <input
                                className="sim-input"
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={99}
                                autoFocus
                                value={homeScore}
                                onChange={(e) => setHomeScore(e.target.value)}
                                aria-label="Home score"
                              />
                              <span className="sim-dash">:</span>
                              <input
                                className="sim-input"
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={99}
                                value={awayScore}
                                onChange={(e) => setAwayScore(e.target.value)}
                                aria-label="Away score"
                              />
                              <span className="sim-team right">{nameOf(m.away_team_id)}</span>

                              <button className="btn-primary" type="submit" disabled={pending}>
                                {pending ? 'Saving…' : 'Save result'}
                              </button>
                              <button
                                className="btn-ghost"
                                type="button"
                                onClick={closeEditor}
                                disabled={pending}
                              >
                                Cancel
                              </button>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

      {fixtureOpen && (
        <CrudForm
          key={fixtureOpen === 'new' ? 'new' : fixtureOpen.id}
          title={fixtureOpen === 'new' ? 'New fixture' : 'Edit fixture'}
          subtitle="FIXTURE"
          fields={fixtureFields}
          initial={fixtureInitial}
          submitLabel={fixtureOpen === 'new' ? 'Create fixture' : 'Save changes'}
          busy={form.busy}
          error={form.error}
          onSubmit={saveFixture}
          onClose={() => {
            form.reset();
            setFixtureOpen(null);
          }}
        />
      )}

      {removing && (
        <Confirm
          title={`${nameOf(removing.home_team_id)} vs ${nameOf(removing.away_team_id)}`}
          subtitle="FIXTURE"
          message="Remove this fixture from the schedule?"
          facts={[
            `${fmtDate(removing.scheduled_at)} · ${fmtTime(removing.scheduled_at)}`,
            removing.venue ? `Venue: ${removing.venue}` : 'No venue set',
            'Any player statistics recorded for it are deleted as well',
          ]}
          busy={del.busy}
          error={del.error}
          onConfirm={confirmDeleteFixture}
          onClose={() => {
            del.reset();
            setRemoving(null);
          }}
        />
      )}
    </main>
  );
}
