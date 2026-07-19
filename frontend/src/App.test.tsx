import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth, useUser } from '@clerk/react';
import { useSignIn, useSignUp } from '@clerk/react/legacy';
import App from './App';

// Real BrowserRouter (App.tsx wires it) exercising actual routing + the
// auth-gate composition end to end, unlike the page/component tests which
// mock our own useAuth for isolation. Clerk's own hooks are mocked here
// (App.tsx no longer hosts ClerkProvider — that lives in main.tsx — so
// there's no real provider ancestor in this render tree either way).

vi.mock('@clerk/react', () => ({
  useAuth: vi.fn(),
  useUser: vi.fn(),
}));

vi.mock('@clerk/react/legacy', () => ({
  useSignIn: vi.fn(),
  useSignUp: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { recentEvents: [] } }),
      } as Response),
    );
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(useUser).mockReturnValue({ user: null } as unknown as ReturnType<typeof useUser>);
    vi.mocked(useSignIn).mockReturnValue({
      isLoaded: true,
      signIn: { create: vi.fn() },
      setActive: vi.fn(),
    } as unknown as ReturnType<typeof useSignIn>);
    vi.mocked(useSignUp).mockReturnValue({
      isLoaded: true,
      signUp: { create: vi.fn(), prepareEmailAddressVerification: vi.fn() },
      setActive: vi.fn(),
    } as unknown as ReturnType<typeof useSignUp>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the marketing home page at "/"', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Bupis is coming to/);
  });

  it('navigates to the login page via the nav bar link', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: 'Log in' }));

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor away from /dashboard to /login', () => {
    window.history.pushState({}, '', '/dashboard');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
