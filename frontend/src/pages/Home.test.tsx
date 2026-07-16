import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import { useAuth } from '../lib/AuthContext';

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

describe('Home', () => {
  it('shows a "Get started" CTA linking to /login when signed out', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    const { container } = renderHome();
    const ctaRow = within(container.querySelector('.home-cta-row')!);

    expect(ctaRow.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/login');
  });

  it('shows an "Open dashboard" CTA linking to /dashboard when signed in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@b.com' },
      isAuthenticated: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    const { container } = renderHome();
    const ctaRow = within(container.querySelector('.home-cta-row')!);

    expect(ctaRow.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('renders the headline, feature grid, and footer copy', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    renderHome();

    expect(screen.getByText('Fire & forget')).toBeInTheDocument();
    expect(screen.getByText('Replayable')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText(/WELCOME/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore the API' })).toHaveAttribute(
      'href',
      'http://localhost:4000/graphql',
    );
  });
});
