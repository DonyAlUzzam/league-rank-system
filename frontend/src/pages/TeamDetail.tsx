import { useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { api, useApi, type League } from '../api';
import { isAdmin } from '../auth';
import { Confirm, CrudForm, useCrud, type FieldDef } from '../components/ui';
import { Pagination, usePagination } from '../components/Pagination';
import { POS_LABEL, type Position } from '../lib/positions';
import { PageError, PageLoading } from './Dashboard';

type Team = {
  id: string;
  league_id: string;
  name: string;
  short_name: string;
  logo_url?: string | null;
  city?: string | null;
  stadium?: string | null;
  founded_year?: number | null;
  history?: string | null;
  league: League;
};

/** A squad member plus what they have actually produced on the pitch. */
type SquadPlayer = {
  id: string;
  name: string;
  jersey_number: number;
  position: Position;
  nationality: string;
  date_of_birth?: string | null;
  apps: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
};

/** A fixture rewritten from this club's point of view. */
type Appearance = {
  id: string;
  opponent_id: string;
  opponent: string;
  home: boolean;
  gf: number;
  ga: number;
  result: 'W' | 'D' | 'L' | null;
  scheduled_at: string;
  status: string;
  venue?: string;
};

/**
 * `id: null` + `source: 'LEAGUE'` is a title the league table already settled —
 * there is no row behind it, so it is shown but cannot be edited.
 */
type Honour = {
  id: string | null;
  team_id: string;
  title: string;
  competition: string;
  season: string;
  won_at?: string | null;
  source: 'LEAGUE' | 'MANUAL';
  league_id?: string;
};

// `Record` is a TypeScript utility type — naming a local type after it would
// shadow it for the whole file.
type ClubRecord = {
  position: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  win_percentage: number;
};

type Overview = {
  team: Team;
  squad: SquadPlayer[];
  finished: Appearance[];
  upcoming: Appearance[];
  form: Array<'W' | 'D' | 'L'>;
  honours: Honour[];
  record: ClubRecord;
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const kickoff = (iso: string) => `${day(iso)} · ${time(iso)}`;

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

const ageOf = (dob?: string | null) => {
  if (!dob) return null;
  const b = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
};

export default function TeamDetail({ id }: { id: string }) {
  const ov = useApi<Overview>(`/teams/${id}/overview`);
  const admin = isAdmin();
  const profile = useCrud();
  const honoursCrud = useCrud();
  const [editing, setEditing] = useState(false);
  const [honourOpen, setHonourOpen] = useState<'new' | Honour | null>(null);
  const [removing, setRemoving] = useState<Honour | null>(null);

  // Declared up here, before any early return, so switching clubs never skips
  // a hook — the slices further down are plain values. `resetKey` sends the
  // reader back to page 1 when they open a different club.
  const histPg = usePagination(ov.data?.finished.length ?? 0, {
    pageSize: 10,
    resetKey: id,
  });
  const squadPg = usePagination(ov.data?.squad.length ?? 0, {
    pageSize: 10,
    resetKey: id,
  });

  if (ov.isLoading) return <PageLoading label="Loading club…" />;

  if (ov.isError) {
    const status = (ov.error as { response?: { status?: number } })?.response?.status;
    if (status === 404)
      return (
        <main>
          <div className="eyebrow">TEAM</div>
          <h1>Club not found</h1>
          <p className="muted">That club no longer exists, or the link is wrong.</p>
          <div className="panel empty-state">
            <a className="link" href="#teams">
              ← Back to all teams
            </a>
          </div>
        </main>
      );
    return <PageError error={ov.error} />;
  }

  const d = ov.data!;
  const t = d.team;
  const rec = d.record;
  const crest = (t.short_name || t.name.slice(0, 2)).slice(0, 3).toUpperCase();

  const historyRows = d.finished.slice(histPg.startIndex, histPg.endIndex);
  const squadRows = d.squad.slice(squadPg.startIndex, squadPg.endIndex);

  const cards: Array<[string, string | number, typeof Shield]> = [
    ['Position', `#${rec.position}`, Shield],
    ['Played', rec.played, CalendarDays],
    ['Won', rec.won, Trophy],
    ['Draw', rec.draw, Minus],
    ['Lost', rec.lost, X],
    ['Points', rec.points, BarChart3],
  ];

  const profileFields: FieldDef[] = [
    {
      name: 'league_id',
      label: 'League',
      type: 'select',
      required: true,
      readOnly: true,
      hint: 'A club cannot change league while it has fixtures — create it in the target league instead.',
      options: [{ value: t.league_id, label: `${t.league.name} · ${t.league.season}` }],
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
      hint: 'Leave blank if unknown.',
    },
    { name: 'logo_url', label: 'Logo URL', type: 'text', span: 2, placeholder: 'https://…' },
    {
      name: 'history',
      label: 'Club history',
      type: 'textarea',
      span: 2,
      placeholder: 'Founded in 1970 as…',
      hint: 'Shown in the Club History panel below. Leave blank to clear it.',
    },
  ];

  const honourFields: FieldDef[] = [
    { name: 'title', label: 'Award', type: 'text', required: true, placeholder: 'Champion' },
    {
      name: 'competition',
      label: 'Competition',
      type: 'text',
      required: true,
      defaultValue: t.league.name,
      placeholder: 'Indonesia Premier League',
    },
    {
      name: 'season',
      label: 'Season',
      type: 'text',
      required: true,
      defaultValue: t.league.season,
      placeholder: '2026',
    },
    { name: 'won_at', label: 'Won on', type: 'date' },
  ];

  const saveProfile = async (payload: Record<string, unknown>) => {
    const ok = await profile.run(() => api.patch(`/teams/${id}`, payload));
    if (ok) setEditing(false);
  };

  const saveHonour = async (payload: Record<string, unknown>) => {
    const ok = await honoursCrud.run(async () => {
      const body = { ...payload, team_id: id };
      if (honourOpen && honourOpen !== 'new') await api.patch(`/honours/${honourOpen.id}`, body);
      else await api.post('/honours', body);
    });
    if (ok) setHonourOpen(null);
  };

  const confirmDeleteHonour = async () => {
    if (!removing?.id) return;
    const ok = await honoursCrud.run(() => api.delete(`/honours/${removing.id}`));
    if (ok) setRemoving(null);
  };

  const honourKey = (h: Honour) => `${h.source}-${h.title}-${h.competition}-${h.season}`;

  return (
    <main>
      <a className="back-link" href="#teams">
        <ArrowLeft size={14} /> All teams
      </a>

      <div className="eyebrow">TEAM PROFILE</div>
      <h1>{t.name}</h1>
      <p className="muted">
        {t.city || 'City TBC'} · {t.stadium || 'Stadium TBC'} · {t.league.name} {t.league.season}
      </p>

      <div className="panel team-hero">
        <div className="hero-crest">{crest}</div>
        <div className="hero-id">
          <b>{t.name}</b>
          <small>{t.short_name}</small>
          <div className="hero-chips">
            <span className="chip">
              {t.league.name} · {t.league.season}
            </span>
            <span className="chip chip-muted">#{rec.position} in table</span>
            {t.founded_year && <span className="chip chip-muted">Est. {t.founded_year}</span>}
            {d.honours.length > 0 && (
              <span className="chip">
                <Trophy size={12} /> {d.honours.length} honour(s)
              </span>
            )}
          </div>
        </div>
        <div className="hero-actions">
          {admin && (
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                profile.reset();
                setEditing(true);
              }}
            >
              <Pencil size={14} /> Edit profile
            </button>
          )}
        </div>
      </div>

      <div className="cards">
        {cards.map(([label, value, Icon]) => (
          <div className="card" key={label}>
            <div className="icon">
              <Icon size={18} />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="form-strip">
        <span className="form-label">FORM</span>
        {d.form.length === 0 ? (
          <span className="muted">No finished matches yet.</span>
        ) : (
          <>
            {d.form.map((r, i) => (
              <span className={`form-dot ${r.toLowerCase()}`} key={i} title={r}>
                {r}
              </span>
            ))}
            <span className="form-note">oldest → newest</span>
          </>
        )}
        <span className="form-note">
          {rec.goals_for}–{rec.goals_against} goals · GD {signed(rec.goal_difference)} ·{' '}
          {rec.win_percentage}% wins
        </span>
      </div>

      <section className="grid">
        <div className="panel">
          <div className="panel-head">
            <h2>
              <CalendarDays size={16} /> Match history
            </h2>
            <span className="muted">{d.finished.length} played</span>
          </div>

          {d.finished.length === 0 ? (
            <p className="muted">No finished matches yet.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>RESULT</th>
                      <th>OPPONENT</th>
                      <th>SCORE</th>
                      <th>VENUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((m) => (
                      <tr key={m.id}>
                        <td>{day(m.scheduled_at)}</td>
                        <td>
                          <span className={`res res-${m.result}`}>{m.result}</span>
                        </td>
                        <td className="team">
                          <span className="side">{m.home ? 'H' : 'A'}</span> {m.opponent}
                        </td>
                        <td>
                          <b>
                            {m.gf}–{m.ga}
                          </b>
                        </td>
                        <td>{m.venue || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={histPg.page}
                totalPages={histPg.totalPages}
                from={histPg.from}
                to={histPg.to}
                total={d.finished.length}
                onPage={histPg.setPage}
                pageSize={histPg.pageSize}
                onPageSize={histPg.setPageSize}
              />
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>
              <MapPin size={16} /> Next fixtures
            </h2>
          </div>

          {d.upcoming.length === 0 && <p className="muted">Nothing scheduled.</p>}

          {d.upcoming.map((m) => (
            <div className="fixture" key={m.id}>
              <div className="fixture-date">{kickoff(m.scheduled_at)}</div>
              <div className="fixture-teams">
                <b>{m.home ? t.name : m.opponent}</b>
                <span className="vs-badge">VS</span>
                <b>{m.home ? m.opponent : t.name}</b>
              </div>
              <div className="fixture-venue">
                {m.venue || 'Venue TBC'} · {m.status}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-head">
            <h2>
              <Users size={16} /> Squad
            </h2>
            <span className="muted">{d.squad.length} player(s)</span>
          </div>

          {d.squad.length === 0 ? (
            <p className="muted">
              No players registered to this club yet — add them from the{' '}
              <a className="link" href="#players">
                Players
              </a>{' '}
              page.
            </p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>PLAYER</th>
                      <th>POS</th>
                      <th>NAT</th>
                      <th>AGE</th>
                      <th>APPS</th>
                      <th>G</th>
                      <th>A</th>
                      <th>YC</th>
                      <th>RC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {squadRows.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <b>{p.jersey_number}</b>
                        </td>
                        <td className="team">{p.name}</td>
                        <td>
                          <span className={`pos pos-${p.position}`}>{POS_LABEL[p.position]}</span>
                        </td>
                        <td>{p.nationality}</td>
                        <td>{ageOf(p.date_of_birth) ?? '–'}</td>
                        <td>{p.apps}</td>
                        <td>
                          <b>{p.goals}</b>
                        </td>
                        <td>{p.assists}</td>
                        <td>{p.yellow_cards}</td>
                        <td>{p.red_cards}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={squadPg.page}
                totalPages={squadPg.totalPages}
                from={squadPg.from}
                to={squadPg.to}
                total={d.squad.length}
                onPage={squadPg.setPage}
                pageSize={squadPg.pageSize}
                onPageSize={squadPg.setPageSize}
              />
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>
              <Trophy size={16} /> Honours
            </h2>
            {admin && (
              <button
                className="btn-primary btn-sm"
                onClick={() => {
                  honoursCrud.reset();
                  setHonourOpen('new');
                }}
              >
                <Plus size={14} /> Add
              </button>
            )}
          </div>

          {d.honours.length === 0 && (
            <p className="muted">No honours recorded for this club yet.</p>
          )}

          {d.honours.map((h) => (
            <div className="honor" key={honourKey(h)}>
              <span className={`honor-icon${h.source === 'LEAGUE' ? ' auto' : ''}`}>
                <Trophy size={14} />
              </span>
              <div className="honor-body">
                <b>{h.title}</b>
                <small>
                  {h.competition} · {h.season}
                  {h.won_at ? ` · ${day(h.won_at)}` : ''}
                </small>
              </div>
              {h.source === 'LEAGUE' ? (
                <span className="honor-auto" title="Derived from a finished league table — change the league status to remove it">
                  AUTO
                </span>
              ) : (
                admin && (
                  <div className="row-actions end">
                    <button
                      className="icon-btn"
                      title={`Edit ${h.title}`}
                      onClick={() => {
                        honoursCrud.reset();
                        setHonourOpen(h);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title={`Delete ${h.title}`}
                      onClick={() => setRemoving(h)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="panel">
        <div className="panel-head">
          <h2>Club history</h2>
          {admin && (
            <button
              className="btn-ghost"
              onClick={() => {
                profile.reset();
                setEditing(true);
              }}
            >
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
        <div className="club-history">
          <p>
            <b>Founded</b> {t.founded_year ?? 'unknown'}
            {t.city ? ` · ${t.city}` : ''}
            {t.stadium ? ` · ${t.stadium}` : ''}
          </p>
          {t.history ? (
            <p className="history-text">{t.history}</p>
          ) : (
            <p className="muted">
              No history written yet.
              {admin ? ' Use “Edit profile” to add one.' : ''}
            </p>
          )}
        </div>
      </div>

      {editing && (
        <CrudForm
          key={t.id}
          title={`Edit ${t.name}`}
          subtitle="TEAM PROFILE"
          fields={profileFields}
          initial={t}
          submitLabel="Save profile"
          busy={profile.busy}
          error={profile.error}
          onSubmit={saveProfile}
          onClose={() => {
            profile.reset();
            setEditing(false);
          }}
        />
      )}

      {honourOpen && (
        <CrudForm
          key={honourOpen === 'new' ? 'new-honour' : honourOpen.id ?? honourKey(honourOpen)}
          title={honourOpen === 'new' ? 'Add honour' : `Edit ${honourOpen.title}`}
          subtitle="HONOUR"
          fields={honourFields}
          initial={honourOpen === 'new' ? undefined : honourOpen}
          submitLabel={honourOpen === 'new' ? 'Add honour' : 'Save changes'}
          busy={honoursCrud.busy}
          error={honoursCrud.error}
          onSubmit={saveHonour}
          onClose={() => {
            honoursCrud.reset();
            setHonourOpen(null);
          }}
        />
      )}

      {removing && (
        <Confirm
          title={`Delete ${removing.title}?`}
          subtitle="HONOUR"
          message="This removes the award from the club's trophy cabinet. The matches themselves are untouched."
          facts={[`${removing.competition} · ${removing.season}`]}
          busy={honoursCrud.busy}
          error={honoursCrud.error}
          onConfirm={confirmDeleteHonour}
          onClose={() => {
            honoursCrud.reset();
            setRemoving(null);
          }}
        />
      )}
    </main>
  );
}
