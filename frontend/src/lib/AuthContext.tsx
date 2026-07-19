import { useAuth as useClerkAuth, useUser } from '@clerk/react';

// Thin adapter over Clerk's hooks, preserving the shape the rest of the app
// already consumes (Sidebar, AppTopbar, NavBar, ProtectedRoute, Home,
// Dashboard) so those components don't need to know Clerk exists. Sign-in
// and sign-up themselves use Clerk's useSignIn/useSignUp directly in
// Login.tsx — Clerk's flows are multi-step state machines (email
// verification, MFA, ...), so they don't fit a single signIn(email,
// password) call the way the old localStorage stub did.

export interface AuthUser {
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoaded: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthContextValue {
  const { isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();

  const email = clerkUser?.primaryEmailAddress?.emailAddress;

  return {
    user: email ? { email } : null,
    isAuthenticated: isLoaded && isSignedIn === true,
    isLoaded,
    signOut: () => signOut(),
  };
}
