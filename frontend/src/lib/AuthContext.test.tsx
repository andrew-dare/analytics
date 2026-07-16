import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';

function Probe() {
  const { user, isAuthenticated, signIn, signOut } = useAuth();
  return (
    <div>
      <p data-testid="authed">{String(isAuthenticated)}</p>
      <p data-testid="email">{user?.email ?? 'none'}</p>
      <button onClick={() => void signIn('a@b.com', 'pw')}>sign in</button>
      <button onClick={signOut}>sign out</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts unauthenticated when nothing is stored', () => {
    renderProbe();
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(screen.getByTestId('email')).toHaveTextContent('none');
  });

  it('restores a previously stored session on mount', () => {
    localStorage.setItem(
      'bupis.auth',
      JSON.stringify({ token: 't1', user: { email: 'stored@example.com' } }),
    );

    renderProbe();

    expect(screen.getByTestId('authed')).toHaveTextContent('true');
    expect(screen.getByTestId('email')).toHaveTextContent('stored@example.com');
  });

  it('treats corrupted stored auth as unauthenticated', () => {
    localStorage.setItem('bupis.auth', '{not valid json');

    renderProbe();

    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('signIn persists a session and updates state', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByText('sign in'));

    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    expect(screen.getByTestId('email')).toHaveTextContent('a@b.com');

    const stored = JSON.parse(localStorage.getItem('bupis.auth')!);
    expect(stored.user).toEqual({ email: 'a@b.com' });
    expect(typeof stored.token).toBe('string');
  });

  it('signOut clears the session', async () => {
    localStorage.setItem(
      'bupis.auth',
      JSON.stringify({ token: 't1', user: { email: 'stored@example.com' } }),
    );
    const user = userEvent.setup();
    renderProbe();
    expect(screen.getByTestId('authed')).toHaveTextContent('true');

    await user.click(screen.getByText('sign out'));

    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(localStorage.getItem('bupis.auth')).toBeNull();
  });

  it('throws when useAuth is called outside an AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>');
    consoleError.mockRestore();
  });
});
