import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// Logged-out / marketing chrome: a persistent full-width header — brand,
// centered links, auth actions on the right. The logged-in product area
// uses a completely different pattern (see Sidebar.tsx), matching how most
// SaaS products separate their marketing site nav from their app shell.

export default function NavBar() {
  const { isAuthenticated } = useAuth();

  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand">
        <span className="topbar-logo" aria-hidden="true" />
        <span>Bupis</span>
      </Link>

      <nav className="topbar-links">
        <a href="#features">Product</a>
        <a href="http://localhost:4000/graphql" target="_blank" rel="noreferrer">
          Docs
        </a>
      </nav>

      <div className="topbar-actions">
        {isAuthenticated ? (
          <Link to="/dashboard" className="btn btn--solid btn--sm">
            Dashboard
          </Link>
        ) : (
          <>
            <Link to="/login" className="btn btn--sm">
              Log in
            </Link>
            <Link to="/login" className="btn btn--solid btn--sm">
              Get started
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
