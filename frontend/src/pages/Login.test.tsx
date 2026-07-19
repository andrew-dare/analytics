import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { MemoryRouterProps } from 'react-router-dom';
import Login from './Login';
import { useAuth } from '../lib/AuthContext';
import { useSignIn, useSignUp } from '@clerk/react/legacy';

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@clerk/react/legacy', () => ({
  useSignIn: vi.fn(),
  useSignUp: vi.fn(),
}));

// Mutable objects (not a fixed mockReturnValue) so a test can flip e.g.
// signUpMock.isLoaded mid-flow and have the *next* render pick it up —
// necessary to reach and test the verify step's own isLoaded guard, which
// can only be reached after an earlier render already used isLoaded: true.
let signInMock: {
  isLoaded: boolean;
  signIn: { create: ReturnType<typeof vi.fn> };
  setActive: ReturnType<typeof vi.fn>;
};
let signUpMock: {
  isLoaded: boolean;
  signUp: {
    create: ReturnType<typeof vi.fn>;
    prepareEmailAddressVerification: ReturnType<typeof vi.fn>;
    attemptEmailAddressVerification: ReturnType<typeof vi.fn>;
  };
  setActive: ReturnType<typeof vi.fn>;
};

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoaded: true,
    signOut: vi.fn(),
    ...overrides,
  });
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

async function fillAndSubmitSignIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'a@b.com');
  await user.type(screen.getByLabelText('Password'), 'password1');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

async function fillAndSubmitRegister(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Register' }));
  await user.type(screen.getByLabelText('Email'), 'a@b.com');
  await user.type(screen.getByLabelText('Password'), 'password1');
  await user.type(screen.getByLabelText('Confirm password'), 'password1');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('Login', () => {
  beforeEach(() => {
    mockAuth();
    signInMock = {
      isLoaded: true,
      signIn: { create: vi.fn() },
      setActive: vi.fn().mockResolvedValue(undefined),
    };
    signUpMock = {
      isLoaded: true,
      signUp: {
        create: vi.fn(),
        prepareEmailAddressVerification: vi.fn().mockResolvedValue(undefined),
        attemptEmailAddressVerification: vi.fn(),
      },
      setActive: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(useSignIn).mockImplementation(() => signInMock as unknown as ReturnType<typeof useSignIn>);
    vi.mocked(useSignUp).mockImplementation(() => signUpMock as unknown as ReturnType<typeof useSignUp>);
  });

  it('renders nothing while our own auth adapter is still loading', () => {
    mockAuth({ isLoaded: false });

    const { container } = renderLogin();

    expect(container).toBeEmptyDOMElement();
  });

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
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('welcome back, special guest.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('toggles to register mode and back', async () => {
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

  it('shows an error and does not call signUp.create when register passwords mismatch', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.type(screen.getByLabelText('Confirm password'), 'password2');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(signUpMock.signUp.create).not.toHaveBeenCalled();
  });

  it('clears a previous error when toggling mode', async () => {
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

  // --- sign in ---------------------------------------------------------

  it('does nothing on submit when the sign-in resource is not yet loaded', async () => {
    signInMock.isLoaded = false;
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmitSignIn(user);

    expect(signInMock.signIn.create).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows a loading state, calls signIn.create, and navigates to /dashboard on success', async () => {
    let resolveCreate!: (value: { status: string; createdSessionId: string | null }) => void;
    signInMock.signIn.create.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    expect(signInMock.signIn.create).toHaveBeenCalledWith({
      identifier: 'a@b.com',
      password: 'password1',
    });

    resolveCreate({ status: 'complete', createdSessionId: 'sess_1' });

    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    expect(signInMock.setActive).toHaveBeenCalledWith({ session: 'sess_1' });
  });

  it('navigates to the "from" location on successful sign-in', async () => {
    signInMock.signIn.create.mockResolvedValue({ status: 'complete', createdSessionId: 'sess_1' });
    const user = userEvent.setup();
    renderLogin([{ pathname: '/login', state: { from: { pathname: '/somewhere' } } }]);

    await fillAndSubmitSignIn(user);

    expect(await screen.findByText('somewhere page')).toBeInTheDocument();
  });

  it('shows an error when sign-in status is not complete (e.g. needs a second factor)', async () => {
    signInMock.signIn.create.mockResolvedValue({ status: 'needs_second_factor', createdSessionId: null });
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmitSignIn(user);

    expect(await screen.findByText('Additional verification required.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('shows a fallback error if Clerk reports complete with no session id', async () => {
    signInMock.signIn.create.mockResolvedValue({ status: 'complete', createdSessionId: null });
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmitSignIn(user);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(signInMock.setActive).not.toHaveBeenCalled();
  });

  it('shows the Clerk error message on a rejected sign-in', async () => {
    signInMock.signIn.create.mockRejectedValue({ errors: [{ message: 'invalid credentials' }] });
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmitSignIn(user);

    expect(await screen.findByText('invalid credentials')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('shows a fallback message when a non-Clerk-shaped error is thrown', async () => {
    signInMock.signIn.create.mockRejectedValue('nope');
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmitSignIn(user);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  // --- sign up -----------------------------------------------------------

  it('does nothing on submit when the sign-up resource is not yet loaded', async () => {
    signUpMock.isLoaded = false;
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.type(screen.getByLabelText('Confirm password'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(signUpMock.signUp.create).not.toHaveBeenCalled();
  });

  it('activates the session directly if sign-up completes without verification', async () => {
    signUpMock.signUp.create.mockResolvedValue({ status: 'complete', createdSessionId: 'sess_2' });
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmitRegister(user);

    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    expect(signUpMock.setActive).toHaveBeenCalledWith({ session: 'sess_2' });
  });

  it('moves to the verification step when sign-up requires email verification', async () => {
    signUpMock.signUp.create.mockResolvedValue({ status: 'missing_requirements', createdSessionId: null });
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmitRegister(user);

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('enter the code we just sent you.')).toBeInTheDocument();
    expect(signUpMock.signUp.prepareEmailAddressVerification).toHaveBeenCalledWith({
      strategy: 'email_code',
    });
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
  });

  it('shows the Clerk error message on a rejected sign-up', async () => {
    signUpMock.signUp.create.mockRejectedValue({ errors: [{ message: 'email already taken' }] });
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmitRegister(user);

    expect(await screen.findByText('email already taken')).toBeInTheDocument();
  });

  // --- verify --------------------------------------------------------------

  async function reachVerifyStep(user: ReturnType<typeof userEvent.setup>) {
    signUpMock.signUp.create.mockResolvedValue({ status: 'missing_requirements', createdSessionId: null });
    renderLogin();
    await fillAndSubmitRegister(user);
    await screen.findByRole('heading', { name: 'Check your email' });
  }

  it('does nothing on submit when the sign-up resource becomes unloaded before verifying', async () => {
    const user = userEvent.setup();
    await reachVerifyStep(user);

    signUpMock.isLoaded = false;
    // Trigger a re-render so the verify form's closure picks up the change.
    await user.type(screen.getByLabelText('Verification code'), '1');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(signUpMock.signUp.attemptEmailAddressVerification).not.toHaveBeenCalled();
  });

  it('activates the session and navigates once the code is verified', async () => {
    const user = userEvent.setup();
    await reachVerifyStep(user);
    signUpMock.signUp.attemptEmailAddressVerification.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_3',
    });

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(signUpMock.signUp.attemptEmailAddressVerification).toHaveBeenCalledWith({
      code: '123456',
    });
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    expect(signUpMock.setActive).toHaveBeenCalledWith({ session: 'sess_3' });
  });

  it('shows an error for an invalid verification code', async () => {
    const user = userEvent.setup();
    await reachVerifyStep(user);
    signUpMock.signUp.attemptEmailAddressVerification.mockResolvedValue({
      status: 'expired',
      createdSessionId: null,
    });

    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Invalid code, try again.')).toBeInTheDocument();
  });

  it('shows the Clerk error message when verification itself throws', async () => {
    const user = userEvent.setup();
    await reachVerifyStep(user);
    signUpMock.signUp.attemptEmailAddressVerification.mockRejectedValue({
      errors: [{ message: 'code expired' }],
    });

    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('code expired')).toBeInTheDocument();
  });
});
