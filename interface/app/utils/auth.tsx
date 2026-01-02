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
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  checkAuth: () => boolean;
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
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
    } catch (error) {
      console.error('Error clearing auth state from storage:', error);
    }
  }, []);

  // Hydrate auth state from localStorage first (fast path), then validate with backend
  useEffect(() => {
    if (hasInitialized) return;
    
    // First, try to load from localStorage (fast path for client-side navigation)
    let parsedUser: User | null = null;
    let storedToken: string | null = null;
    
    if (typeof window !== 'undefined') {
      try {
        const storedUserStr = localStorage.getItem('user');
        storedToken = localStorage.getItem('auth_token');
        
        if (storedUserStr && storedToken) {
          try {
            parsedUser = JSON.parse(storedUserStr);
          } catch (error) {
            // Invalid JSON in localStorage, clear it
            localStorage.removeItem('user');
            localStorage.removeItem('auth_token');
            storedToken = null;
          }
        }
      } catch (error) {
        // localStorage access failed, continue to cookie check
      }
    }
    
    // Check cookies for auth state
    const userId = getUserIdCookie();
    const authToken = getAuthTokenCookie();

    // If no cookies, we're not authenticated - middleware will redirect
    if (!userId || !authToken) {
      // If we loaded from storage but have no cookies, clear storage (session expired)
      if (parsedUser || storedToken) {
        clearClientAuthState();
      }
      setIsLoading(false);
      setHasInitialized(true);
      return;
    }

    // If we loaded from localStorage and have cookies, use localStorage values
    // Backend validation happens on API calls, so we trust localStorage for fast navigation
    if (parsedUser && storedToken) {
      setUser(parsedUser);
      setToken(storedToken);
      setIsLoading(false);
      setHasInitialized(true);
      return;
    }

    // Fetch user data if we have cookies but no localStorage (first load or cleared storage)
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
        };

        setUser(normalizedUser);
        setToken(authToken);

        try {
          localStorage.setItem('user', JSON.stringify(normalizedUser));
          localStorage.setItem('auth_token', authToken);
        } catch (error) {
          console.error('Error persisting auth state:', error);
        }
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
    };

    setUser(normalizedUser);
    setToken(authToken);

    setUserIdCookie(generateUuidV4());
    setAuthTokenCookie(authToken);

    try {
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('auth_token', authToken);
    } catch (error) {
      console.error('Error persisting auth state:', error);
    }
  };

  const logout = () => {
    clearClientAuthState();
    router.push('/landing');
  };

  const checkAuth = () => {
    return !!user && !!token;
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
    checkAuth
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
