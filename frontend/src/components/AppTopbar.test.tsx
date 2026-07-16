import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AppTopbar from './AppTopbar';
import { useAuth } from '../lib/AuthContext';

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function setup(search = '') {
  const onSearchChange = vi.fn();
  render(
    <MemoryRouter>
      <AppTopbar search={search} onSearchChange={onSearchChange} />
    </MemoryRouter>,
  );
  return { onSearchChange };
}

describe('AppTopbar', () => {
  it("shows the user's initial in the avatar", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'andrew@dare.dev' },
      isAuthenticated: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    setup();

    expect(screen.getByTitle('andrew@dare.dev')).toHaveTextContent('A');
  });

  it('falls back to "?" when there is no user', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    setup();

    expect(screen.getByRole('searchbox').parentElement?.parentElement).toBeTruthy();
    const avatar = document.querySelector('.app-avatar');
    expect(avatar).toHaveTextContent('?');
  });

  it('calls onSearchChange as the user types', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@b.com' },
      isAuthenticated: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    const user = userEvent.setup();
    const { onSearchChange } = setup('');

    await user.type(screen.getByPlaceholderText('Search events…'), 'ch');

    expect(onSearchChange).toHaveBeenNthCalledWith(1, 'c');
    expect(onSearchChange).toHaveBeenNthCalledWith(2, 'h');
  });

  it('renders notification/settings buttons and the brand link', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@b.com' },
      isAuthenticated: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    setup();

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bupis/ })).toHaveAttribute('href', '/');
  });
});
