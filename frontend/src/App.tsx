import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Trophy,
  Users,
  CalendarDays,
  BarChart3,
  Shield,
  Search,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useHashRoute, type Route } from './router';
import { clearSession, initials, useSession } from './auth';
import { queryClient } from './api';
import Dashboard from './pages/Dashboard';
import Leagues from './pages/Leagues';
import Teams from './pages/Teams';
import Players from './pages/Players';
import Matches from './pages/Matches';
import Standings from './pages/Standings';
import Profile from './pages/Profile';
import Login from './pages/Login';
import TeamDetail from './pages/TeamDetail';

const NAV: Array<[string, Route, typeof Shield]> = [
  ['Dashboard', 'dashboard', LayoutDashboard],
  ['Leagues', 'leagues', Trophy],
  ['Teams', 'teams', Shield],
  ['Players', 'players', Users],
  ['Matches', 'matches', CalendarDays],
  ['Standings', 'standings', BarChart3],
];

function Placeholder({ title }: { title: string }) {
  return (
    <main>
      <div className="eyebrow">NOT FOUND</div>
      <h1>{title}</h1>
      <p className="muted">That section does not exist yet.</p>
      <div className="panel empty-state">
        Pick a section from the sidebar — Dashboard, Leagues, Teams, Players,
        Matches, Standings or Profile.
      </div>
    </main>
  );
}

export default function App() {
  const [route, param] = useHashRoute();
  const [query, setQuery] = useState('');
  const session = useSession();

  // Opening a detail page drops you at the top of it; the search box only
  // makes sense per section, so it resets when the section itself changes.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route, param]);

  useEffect(() => {
    document.title = `LeagueRank — ${route.charAt(0).toUpperCase()}${route.slice(1)}`;
    setQuery('');
  }, [route]);

  // No token → the API would reject every call anyway, so show the login wall.
  if (!session.token || !session.user) return <Login />;

  const user = session.user;

  const page = () => {
    switch (route) {
      case 'leagues':
        return <Leagues query={query} />;
      case 'teams':
        // `#teams/<id>` is the club page; plain `#teams` is the list.
        return param ? <TeamDetail id={param} /> : <Teams query={query} />;
      case 'players':
        return <Players query={query} />;
      case 'matches':
        return <Matches query={query} />;
      case 'standings':
        return <Standings query={query} />;
      case 'profile':
        return <Profile />;
      case 'dashboard':
        return <Dashboard />;
      default:
        return <Placeholder title="Not found" />;
    }
  };

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="logo">LR</div>
          <div>
            <b>LeagueRank</b>
            <small>SPORTS MANAGEMENT</small>
          </div>
        </div>

        <nav>
          {NAV.map(([label, target, Icon]) => (
            <a key={label} href={`#${target}`} className={route === target ? 'active' : ''}>
              <Icon size={18} />
              {label}
            </a>
          ))}
        </nav>

        <div className="side-foot">
          2026 Season
          <br />
          <span>System online</span>
        </div>
      </aside>

      <div className="content">
        <header>
          <div className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams, players, matches…"
            />
          </div>
          <div className="profile">
            <a
              className={`profile-id${route === 'profile' ? ' active' : ''}`}
              href="#profile"
              title={`${user.email} — open profile`}
            >
              <div className="avatar">{initials(user.email)}</div>
              <div>
                <b>{user.email.split('@')[0]}</b>
                <small>{user.role === 'ADMIN' ? 'Administrator' : 'Member'}</small>
              </div>
              <ChevronRight size={15} className="profile-chev" />
            </a>
            <button
              className="btn-ghost logout"
              type="button"
              title="Sign out"
              onClick={() => {
                clearSession();
                queryClient.clear();
              }}
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </header>

        {page()}
      </div>
    </div>
  );
}
