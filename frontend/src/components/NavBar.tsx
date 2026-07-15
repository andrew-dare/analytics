import { Link } from 'react-router-dom';

// Floating public nav. A logged-in variant (user menu, dashboard links)
// is planned; for now the right side is just the login entry point.

export default function NavBar() {
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="navbar-logo" aria-hidden="true" />
        <span>Bupis</span>
      </Link>
      <Link to="/login" className="navbar-login">
        Log in
      </Link>
    </nav>
  );
}
