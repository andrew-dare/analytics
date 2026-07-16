import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { MemoryRouterProps } from 'react-router-dom';
import Login from './Login';
import { useAuth } from '../lib/AuthContext';

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  const value = {
    user: null,
    isAuthenticated: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
  vi.mocked(useAuth).mockReturnValue(value);
  return value;
}

function renderLogin(initialEntries: MemoryRouterProps['initialEntries'] = ['/login']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route path="/somewhere" element={<p>somewhere page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Login', () => {
  it('redirects to /dashboard when already authenticated with no "from" state', () => {
    mockAuth({ isAuthenticated: true });

    renderLogin();

    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });

  it('redirects to the "from" location when already authenticated', () => {
    mockAuth({ isAuthenticated: true });

    renderLogin([{ pathname: '/login', state: { from: { pathname: '/somewhere' } } }]);

    expect(screen.getByText('somewhere page')).toBeInTheDocument();
  });

  it('renders the sign-in form by default', () => {
    mockAuth();

    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('welcome back, special guest.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('toggles to register mode and back', async () => {
    mockAuth();
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.getByText('you are invited.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
  });

  it('shows an error and does not call signIn when register passwords mismatch', async () => {
    const auth = mockAuth();
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.type(screen.getByLabelText('Confirm password'), 'password2');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('clears a previous error when toggling mode', async () => {
    mockAuth();
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.type(screen.getByLabelText('Confirm password'), 'password2');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
  });

  it('shows a loading state and navigates to /dashboard on successful sign-in', async () => {
    let resolveSignIn!: () => void;
    const signIn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    mockAuth({ signIn });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    expect(signIn).toHaveBeenCalledWith('a@b.com', 'password1');

    resolveSignIn();
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });

  it('navigates to the "from" location on successful sign-in', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    mockAuth({ signIn });
    const user = userEvent.setup();
    renderLogin([{ pathname: '/login', state: { from: { pathname: '/somewhere' } } }]);

    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('somewhere page')).toBeInTheDocument();
  });

  it('shows the thrown Error message and resets loading on failed sign-in', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('invalid credentials'));
    mockAuth({ signIn });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('invalid credentials')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('shows a fallback error message when a non-Error is thrown', async () => {
    const signIn = vi.fn().mockRejectedValue('nope');
    mockAuth({ signIn });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });
});
