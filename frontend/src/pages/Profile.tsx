import { useEffect, useState, type FormEvent } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  KeyRound,
  LogOut,
  Lock,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, errMsg, queryClient, useApi } from '../api';
import { clearSession, initials, useSession } from '../auth';
import { PageError, PageLoading } from './Dashboard';

type Me = {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  created_at?: string;
  token_expires_at?: string | null;
};

/** What each role is allowed to do — mirrors the guards on the API. */
const PERMISSIONS: Record<Me['role'], Array<{ allowed: boolean; text: string }>> = {
  ADMIN: [
    { allowed: true, text: 'Read every page: dashboard, leagues, teams, players, matches, standings, statistics' },
    { allowed: true, text: 'Simulate a fixture result (recomputes standings, stats, dashboard)' },
    { allowed: true, text: 'Undo the last simulation for a fixture' },
    { allowed: true, text: 'Create, edit and delete leagues, teams, players and matches' },
    { allowed: true, text: 'Change this account password' },
  ],
  USER: [
    { allowed: true, text: 'Read every page: dashboard, leagues, teams, players, matches, standings, statistics' },
    { allowed: true, text: 'Change this account password' },
    { allowed: false, text: 'Simulate a fixture result' },
    { allowed: false, text: 'Undo the last simulation' },
    { allowed: false, text: 'Create, edit or delete leagues, teams, players and matches' },
  ],
};

/** "2d 4h 11m left" — or "expired". */
function humanLeft(ms: number) {
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${min}m left`;
  return `${min}m left`;
}

export default function Profile() {
  const session = useSession();
  const me = useApi<Me>('/auth/me');

  // Ticks every 30s so the token countdown stays honest without re-fetching.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [copied, setCopied] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState('');
  const [busy, setBusy] = useState(false);

  if (me.isLoading) return <PageLoading label="Loading profile…" />;
  if (me.isError) return <PageError error={me.error} />;

  const user = me.data ?? session.user;
  if (!user) return <PageError error={new Error('No session')} />;

  const role = (user.role ?? 'USER') as Me['role'];
  const expires = me.data?.token_expires_at ? +new Date(me.data.token_expires_at) : 0;
  const joined = me.data?.created_at ? new Date(me.data.created_at) : null;

  const copy = async (value: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(tag);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      /* clipboard blocked — nothing to report */
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwOk('');
    if (next !== confirm) {
      setPwError('New password and confirmation do not match.');
      return;
    }
    if (next.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.patch('/auth/me', { current_password: current, new_password: next });
      setPwOk('Password updated — the current session stays valid.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setPwError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <div className="eyebrow">ACCOUNT</div>
      <h1>Profile</h1>
      <p className="muted">
        The identity behind the bearer token currently attached to every API call.
      </p>

      <div className="pf-grid">
        {/* ---------------- identity ---------------- */}
        <section className="panel pf-id">
          <div className="pf-avatar">{initials(user.email)}</div>
          <div className="pf-id-main">
            <div className="pf-name">
              {user.email.split('@')[0]}
              <span className={`pf-role ${role}`}>{role}</span>
            </div>
            <div className="pf-email">
              <Mail size={14} /> {user.email}
            </div>

            <dl className="pf-meta">
              <div>
                <dt>
                  <CalendarDays size={13} /> Member since
                </dt>
                <dd>
                  {joined
                    ? joined.toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={13} /> Token expires
                </dt>
                <dd className={expires && expires < now ? 'pf-expired' : ''}>
                  {expires
                    ? `${humanLeft(expires - now)} · ${new Date(expires).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : '—'}
                </dd>
              </div>
            </dl>

            <div className="pf-idrow">
              <code>{user.id}</code>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void copy(user.id, 'id')}
                title="Copy user id"
              >
                {copied === 'id' ? <Check size={13} /> : <Copy size={13} />}
                {copied === 'id' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </section>

        {/* ---------------- permissions ---------------- */}
        <section className="panel">
          <div className="panel-head">
            <h2>
              <BadgeCheck size={16} /> Permissions
            </h2>
            <span className={`pf-role ${role}`}>{role}</span>
          </div>
          <ul className="pf-perms">
            {PERMISSIONS[role].map((p) => (
              <li key={p.text} className={p.allowed ? 'yes' : 'no'}>
                {p.allowed ? <Check size={14} /> : <X size={14} />}
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
          <p className="hint">
            Enforced by <code>RolesGuard</code> on the server — a non-admin gets{' '}
            <b>403</b> even if the button is visible.
          </p>
        </section>

        {/* ---------------- security ---------------- */}
        <section className="panel">
          <div className="panel-head">
            <h2>
              <KeyRound size={16} /> Security
            </h2>
          </div>

          <form className="pf-form" onSubmit={changePassword}>
            <label htmlFor="cur">Current password</label>
            <div className="auth-field">
              <Lock size={15} />
              <input
                id="cur"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>

            <label htmlFor="new">New password</label>
            <div className="auth-field">
              <Lock size={15} />
              <input
                id="new"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>

            <label htmlFor="cfm">Repeat new password</label>
            <div className="auth-field">
              <Lock size={15} />
              <input
                id="cfm"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {pwError && <div className="auth-error">{pwError}</div>}
            {pwOk && <div className="pf-ok">{pwOk}</div>}

            <button className="btn-primary pf-save" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </section>

        {/* ---------------- session ---------------- */}
        <section className="panel">
          <div className="panel-head">
            <h2>
              <ShieldCheck size={16} /> Session
            </h2>
          </div>
          <dl className="pf-session">
            <div>
              <dt>Signed in as</dt>
              <dd>{session.user?.email ?? user.email}</dd>
            </div>
            <div>
              <dt>Auth scheme</dt>
              <dd>Bearer JWT · HS256</dd>
            </div>
            <div>
              <dt>Token storage</dt>
              <dd>localStorage (<code>lr_token</code>)</dd>
            </div>
            <div>
              <dt>On expiry</dt>
              <dd>first 401 clears the session and returns to login</dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn-warn pf-logout"
            onClick={() => {
              clearSession();
              queryClient.clear();
            }}
          >
            <LogOut size={14} />
            Sign out of this account
          </button>
        </section>
      </div>
    </main>
  );
}
