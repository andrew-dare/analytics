import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../lib/AuthContext';

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('Sidebar', () => {
  it('shows the signed-in user email and calls signOut on click', async () => {
    const signOut = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'andrew@dare.dev' },
      isAuthenticated: true,
      signIn: vi.fn(),
      signOut,
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText('andrew@dare.dev')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: /Bupis/ })).toHaveAttribute('href', '/');

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('renders without a user email when user is null', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
