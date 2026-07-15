import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// Logged-in product chrome: a persistent left sidebar (brand, nav, account)
// instead of the marketing site's top bar — the same split most SaaS
// products make between their public site and their app shell.

export default function Sidebar() {
  const { user, signOut } = useAuth();

  return (
    <aside className="sidebar">
      <div>
        <Link to="/" className="sidebar-brand">
          <span className="sidebar-logo" aria-hidden="true" />
          <span>Bupis</span>
        </Link>

        <p className="sidebar-kicker">Workspace</p>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className="sidebar-nav-item sidebar-nav-item--active">
            Dashboard
          </Link>
        </nav>
      </div>

      <div className="sidebar-footer">
        <p className="sidebar-user">{user?.email}</p>
        <button type="button" className="sidebar-signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
