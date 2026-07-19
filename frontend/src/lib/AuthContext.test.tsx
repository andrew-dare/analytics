import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth as useClerkAuth, useUser } from '@clerk/react';
import { useAuth } from './AuthContext';

vi.mock('@clerk/react', () => ({
  useAuth: vi.fn(),
  useUser: vi.fn(),
}));

type ClerkAuthReturn = ReturnType<typeof useClerkAuth>;
type ClerkUserReturn = ReturnType<typeof useUser>;

describe('useAuth adapter', () => {
  it('is unauthenticated while Clerk is still loading', () => {
    vi.mocked(useClerkAuth).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
      signOut: vi.fn(),
    } as unknown as ClerkAuthReturn);
    vi.mocked(useUser).mockReturnValue({ user: null } as unknown as ClerkUserReturn);

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoaded).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('is unauthenticated once loaded if not signed in', () => {
    vi.mocked(useClerkAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      signOut: vi.fn(),
    } as unknown as ClerkAuthReturn);
    vi.mocked(useUser).mockReturnValue({ user: null } as unknown as ClerkUserReturn);

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('is authenticated once loaded and signed in, exposing the primary email', () => {
    vi.mocked(useClerkAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      signOut: vi.fn(),
    } as unknown as ClerkAuthReturn);
    vi.mocked(useUser).mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'andrew@dare.dev' } },
    } as unknown as ClerkUserReturn);

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({ email: 'andrew@dare.dev' });
  });

  it('has a null user when signed in but Clerk has no primary email yet', () => {
    vi.mocked(useClerkAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      signOut: vi.fn(),
    } as unknown as ClerkAuthReturn);
    vi.mocked(useUser).mockReturnValue({
      user: { primaryEmailAddress: null },
    } as unknown as ClerkUserReturn);

    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
  });

  it('signOut delegates to Clerk', async () => {
    const clerkSignOut = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useClerkAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      signOut: clerkSignOut,
    } as unknown as ClerkAuthReturn);
    vi.mocked(useUser).mockReturnValue({ user: null } as unknown as ClerkUserReturn);

    const { result } = renderHook(() => useAuth());
    await result.current.signOut();

    expect(clerkSignOut).toHaveBeenCalledOnce();
  });
});
