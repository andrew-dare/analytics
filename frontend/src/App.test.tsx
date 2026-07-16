import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Uses the real AuthProvider + BrowserRouter (App.tsx wires both), unlike
// the page/component tests which mock useAuth for isolation. This exercises
// the actual routing + auth-gate composition end to end.

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { recentEvents: [] } }),
    } as Response));
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
