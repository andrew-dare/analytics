import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
// @clerk/react's bare export uses the newer signals-based reactive API;
// useSignIn/useSignUp's classic { isLoaded, signIn, setActive } shape (the
// one every custom-flow example assumes) lives under /legacy.
import { useSignIn, useSignUp } from '@clerk/react/legacy';
import { useAuth } from '../lib/AuthContext';

// Custom Clerk UI (not the prebuilt <SignIn/>/<SignUp/> components) so the
// poster-styled form survives. Unlike the old localStorage stub, Clerk's
// flows are multi-step state machines rather than a single
// signIn(email, password) call:
//   sign in:  signIn.create() -> status 'complete' -> setActive()
//   sign up:  signUp.create() -> 'missing_requirements' (email verification
//             is on by default) -> prepareEmailAddressVerification() -> a
//             code-entry step -> attemptEmailAddressVerification() ->
//             'complete' -> setActive()

type Mode = 'login' | 'register' | 'verify';

function clerkErrorMessage(err: unknown, fallback: string): string {
  const clerkError = err as { errors?: { message: string }[] };
  return clerkError.errors?.[0]?.message ?? fallback;
}

export default function Login() {
  const { isAuthenticated, isLoaded } = useAuth();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isLoaded) return null;
  if (isAuthenticated) {
    return <Navigate to={from ?? '/dashboard'} replace />;
  }

  const handleModeToggle = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setConfirmPassword('');
  };

  // Shared by all three flows below: once Clerk hands back a session id,
  // activating it and landing on the destination page is identical
  // regardless of which flow produced it. Clerk types createdSessionId as
  // nullable even on a 'complete' result; treat that combination (in
  // practice, never observed) as an error rather than asserting it away.
  const completeAuth = async (
    setActive: (params: { session: string }) => Promise<void>,
    sessionId: string | null,
  ) => {
    if (!sessionId) {
      setError('Something went wrong');
      setLoading(false);
      return;
    }
    await setActive({ session: sessionId });
    navigate(from ?? '/dashboard', { replace: true });
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!signInLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status !== 'complete') {
        setError('Additional verification required.');
        setLoading(false);
        return;
      }
      await completeAuth(setActiveSignIn, result.createdSessionId);
    } catch (err: unknown) {
      setError(clerkErrorMessage(err, 'Something went wrong'));
      setLoading(false);
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded) return;
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await signUp.create({ emailAddress: email, password });
      if (result.status === 'complete') {
        await completeAuth(setActiveSignUp, result.createdSessionId);
        return;
      }
      // Default Clerk instances require email verification before a
      // session can be created.
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setMode('verify');
      setLoading(false);
    } catch (err: unknown) {
      setError(clerkErrorMessage(err, 'Something went wrong'));
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status !== 'complete') {
        setError('Invalid code, try again.');
        setLoading(false);
        return;
      }
      await completeAuth(setActiveSignUp, result.createdSessionId);
    } catch (err: unknown) {
      setError(clerkErrorMessage(err, 'Something went wrong'));
      setLoading(false);
    }
  };

  if (mode === 'verify') {
    return (
      <div className="login-page">
        <div className="login-card">
          <Link to="/" className="wordmark">
            Bupis
          </Link>
          <h1>Check your email</h1>
          <p className="login-sub">enter the code we just sent you.</p>

          <form onSubmit={handleVerify}>
            <label className="form-field">
              <span>Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
              />
            </label>

            {error && <p className="login-error">{error}</p>}

            <button
              className="btn btn--solid"
              type="submit"
              disabled={loading}
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? 'Please wait…' : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="wordmark">
          Bupis
        </Link>
        <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        <p className="login-sub">
          {mode === 'login' ? 'welcome back, special guest.' : 'you are invited.'}
        </p>

        <form onSubmit={mode === 'login' ? handleSignIn : handleSignUp}>
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
