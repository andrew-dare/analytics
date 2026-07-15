import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import NavBar from '../components/NavBar';

// Form structure ported from debt-tracker's LoginForm (login/register mode
// toggle, inline error, loading state). Google OAuth + OTP flows from that
// project can be added once this backend has real auth.

export default function Login() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={from ?? '/dashboard'} replace />;
  }

  const handleModeToggle = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setConfirmPassword('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      navigate(from ?? '/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <NavBar />
      <div className="login-card">
        <Link to="/" className="wordmark">
          Pulse
        </Link>
        <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        <p className="login-sub">
          {mode === 'login' ? 'welcome back, special guest.' : 'you are invited.'}
        </p>

        <form onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              placeholder={mode === 'register' ? 'at least 8 characters' : ''}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </label>
          {mode === 'register' && (
            <label className="form-field">
              <span>Confirm password</span>
              <input
                type="password"
                placeholder="re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>
          )}

          {error && <p className="login-error">{error}</p>}

          <button
            className="btn btn--solid"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="login-toggle">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className="btn btn--bare" onClick={handleModeToggle}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
