import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavBar from './NavBar';
import { useAuth } from '../lib/AuthContext';

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('NavBar', () => {
  it('shows Log in / Get started when signed out', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('shows Dashboard when signed in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@b.com' },
      isAuthenticated: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get started' })).not.toBeInTheDocument();
  });

  it('renders the brand link and marketing nav links', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Bupis/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute('href', '#features');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      'http://localhost:4000/graphql',
    );
  });
});
