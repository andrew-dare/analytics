import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../lib/AuthContext';

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <p>secret content</p>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@b.com' },
      isAuthenticated: true,
      isLoaded: true,
      signOut: vi.fn(),
    });

    renderAt('/protected');

    expect(screen.getByText('secret content')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoaded: true,
      signOut: vi.fn(),
    });

    renderAt('/protected');

    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it('renders nothing while Clerk is still loading, instead of redirecting', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoaded: false,
      signOut: vi.fn(),
    });

    renderAt('/protected');

    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });
});
