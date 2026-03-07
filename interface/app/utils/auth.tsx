"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  getUserIdCookie, 
  getAuthTokenCookie, 
  setUserIdCookie, 
  setAuthTokenCookie, 
  clearAuthCookies,
  clearAllCookies, 
  generateUuidV4
} from '../utils/cookies';
import { ENV } from '../config/env';
import LoadingSpinner from '../components/LoadingSpinner';

interface User {
  id: string;
  username: string;
  email: string;
  settings?: Record<string, any>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  checkAuth: () => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Always start with null values to ensure server and client render match
  // This prevents hydration errors - we'll hydrate from localStorage in useEffect
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const [hasInitialized, setHasInitialized] = useState(false);

  const clearClientAuthState = useCallback(() => {
    setUser(null);
    setToken(null);
    clearAllCookies(); // Clear all cookies on logout
    try {
      if (typeof window !== 'undefined') {
        // Ensure a full client reset on logout so persisted user data does not leak between sessions.
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
    } catch (error) {
      console.error('Error clearing auth state from storage:', error);
    }
  }, []);

  // Hydrate auth state from cookies, then validate with backend.
  // We intentionally avoid trusting localStorage for auth-critical data.
  useEffect(() => {
    if (hasInitialized) return;
    
    // Check cookies for auth state
    const userId = getUserIdCookie();
    const authToken = getAuthTokenCookie();

    // If no cookies, we're not authenticated - middleware will redirect
    if (!userId || !authToken) {
      clearClientAuthState();
      setIsLoading(false);
      setHasInitialized(true);
      return;
    }

    // Fetch and validate user data from backend.
    fetch(`${ENV.BACKEND_URL}/auth/validate`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Token validation failed with status ${response.status}`);
        }
        const data = await response.json();
        if (!data?.valid || !data?.user) {
          throw new Error('Invalid validation response');
        }

        const normalizedUser: User = {
          id: String(data.user.id),
          username: data.user.username,
          email: data.user.email,
          settings: data.user.settings || {},
        };

        setUser(normalizedUser);
        setToken(authToken);
      })
      .catch((error) => {
        console.error('Error fetching user data:', error);
        // Clear state if validation fails - middleware will redirect
        clearClientAuthState();
      })
      .finally(() => {
        setIsLoading(false);
        setHasInitialized(true);
      });
  }, [hasInitialized, clearClientAuthState]);

  // Note: Route protection is handled by middleware.ts for faster server-side redirects.
  // We don't need client-side redirects here as they delay URL updates and cause flickering.

  const login = (userData: User, authToken: string) => {
    const normalizedUser: User = {
      id: String(userData.id),
      username: userData.username,
      email: userData.email,
      settings: userData.settings || {},
    };

    setUser(normalizedUser);
    setToken(authToken);

    setUserIdCookie(generateUuidV4());
    setAuthTokenCookie(authToken);
  };

  const logout = () => {
    clearClientAuthState();
    router.push('/landing');
  };

  const checkAuth = () => {
    return !!user && !!token;
  };

  const refreshUser = useCallback(async () => {
    const authToken = getAuthTokenCookie();
    if (!authToken) return;

    try {
      const response = await fetch(`${ENV.BACKEND_URL}/auth/validate`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.valid && data?.user) {
          const normalizedUser: User = {
            id: String(data.user.id),
            username: data.user.username,
            email: data.user.email,
            settings: data.user.settings || {},
          };
          setUser(normalizedUser);
        }
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
    checkAuth,
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Higher-order component for protecting routes
 */
export function withAuth<T extends object>(WrappedComponent: React.ComponentType<T>) {
  return function AuthenticatedComponent(props: T) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        // If not authenticated, redirect to landing
        // Note: Middleware also handles this, but this provides a fallback for client-side navigation
        router.push('/landing');
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="xl" color="white" className="mx-auto mb-4" />
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return null; // Will redirect via useEffect
    }

    return <WrappedComponent {...props} />;
  };
}

/**
 * Hook for route protection logic
 */
export function useRouteProtection() {
  const { isAuthenticated, isLoading } = useAuth();
  
  return { isAuthenticated, isLoading };
}
