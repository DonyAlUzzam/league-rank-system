import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, LogIn, Mail } from 'lucide-react';
import { api, errMsg } from '../api';
import { saveSession, type SessionUser } from '../auth';

/** Seeded accounts — clicking one just fills the form. */
const DEMO = [
  { label: 'Admin', email: 'admin@league.local', password: 'Admin123!', note: 'boleh menyimulasikan & mengubah data' },
  { label: 'User', email: 'user@league.local', password: 'User123!', note: 'hanya boleh melihat' },
] as const;

export default function Login() {
  const [email, setEmail] = useState<string>(DEMO[0].email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/auth/login', { email, password });
      const d = r.data?.data ?? {};
      saveSession(d.access_token, d.user as SessionUser);
      window.location.hash = 'dashboard';
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="logo">LR</div>
          <div>
            <b>LeagueRank</b>
            <small>SPORTS MANAGEMENT</small>
          </div>
        </div>

        <div className="eyebrow">SIGN IN</div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="muted">
          Every endpoint of the API needs a token — sign in to load the league.
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <div className="auth-field">
            <Mail size={16} />
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@league.local"
            />
          </div>

          <label htmlFor="password">Password</label>
          <div className="auth-field">
            <Lock size={16} />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn-primary auth-submit" type="submit" disabled={busy}>
            <LogIn size={15} />
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-demo">
          <span>
            <KeyRound size={13} /> Demo accounts
          </span>
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              className="auth-demo-btn"
              onClick={() => {
                setEmail(d.email);
                setPassword(d.password);
                setError('');
              }}
            >
              <b>{d.label}</b>
              <small>{d.email} · {d.note}</small>
            </button>
          ))}
        </div>
      </div>

      <p className="auth-foot">
        JWT · 1 day expiry · role ADMIN controls simulate, revert and every write
      </p>
    </div>
  );
}
