import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// Industry-standard nav that persists across auth states:
// - "marketing" (inline masthead — part of the page, not floating chrome):
//   right side adapts — "Log in" when signed out, "Dashboard" when signed in.
// - "app" (product chrome): brand on the left, user identity + sign out on
//   the right.
// The login page intentionally renders no nav at all.

interface NavBarProps {
  variant?: 'marketing' | 'app';
}

export default function NavBar({ variant = 'marketing' }: NavBarProps) {
  const { user, isAuthenticated, signOut } = useAuth();

  if (variant === 'app') {
    return (
      <header className="appnav">
        <Link to="/" className="wordmark">
          Bupis
        </Link>
        <div className="appnav-user">
          <span>{user?.email}</span>
          <button type="button" className="btn btn--bare" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
    );
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="navbar-logo" aria-hidden="true" />
        <span>Bupis</span>
      </Link>
      {isAuthenticated ? (
        <Link to="/dashboard" className="btn btn--sm">
          Dashboard
        </Link>
      ) : (
        <Link to="/login" className="btn btn--sm">
          Log in
        </Link>
      )}
    </nav>
  );
}
