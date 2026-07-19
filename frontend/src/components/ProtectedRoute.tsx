import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import type { ReactNode } from 'react';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoaded } = useAuth();
  const location = useLocation();

  // Clerk hydrates the session asynchronously (e.g. from a cookie) — render
  // nothing rather than redirecting an already-signed-in user to /login
  // during that brief window.
  if (!isLoaded) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
