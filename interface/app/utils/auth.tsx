"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  getUserIdCookie, 
  getAuthTokenCookie, 
  setUserIdCookie, 
  setAuthTokenCookie, 
  clearAuthCookies, 
  generateUuidV4
} from '../utils/cookies';
import { ENV } from '../config/env';

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
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // Initialize loading state based on whether cookies exist (synchronous check)
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === 'undefined') return true; // SSR safety
    const userId = getUserIdCookie();
    const authToken = getAuthTokenCookie();
    // If no cookies exist, we can immediately set loading to false
    return !!(userId && authToken);
  });
  const router = useRouter();
  const pathname = usePathname();

  const clearClientAuthState = useCallback(() => {
    setUser(null);
    setToken(null);
    clearAuthCookies();
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
    } catch (error) {
      console.error('Error clearing auth state from storage:', error);
    }
  }, []);

  const checkAuthStatus = useCallback(async () => {
    // Check for cached login info synchronously first
    const userId = getUserIdCookie();
    const authToken = getAuthTokenCookie();

    // If no cached login info exists, immediately clear state and stop loading
    if (!userId || !authToken) {
      clearClientAuthState();
      setIsLoading(false);
      return;
    }

    // Only perform async validation if we have cached credentials
    setIsLoading(true);

    try {
      const response = await fetch(`${ENV.BACKEND_URL}/auth/validate`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Token validation failed with status ${response.status}`);
      }

      const data = await response.json();
      const validatedUser = data?.user;

      if (!data?.valid || !validatedUser) {
        throw new Error('Invalid validation response');
      }

      const normalizedUser: User = {
        id: String(validatedUser.id),
        username: validatedUser.username,
        email: validatedUser.email,
      };

      setUser(normalizedUser);
      setToken(authToken);

      try {
        localStorage.setItem('user', JSON.stringify(normalizedUser));
        localStorage.setItem('auth_token', authToken);
      } catch (error) {
        console.error('Error persisting auth state:', error);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      clearClientAuthState();
    } finally {
      setIsLoading(false);
    }
  }, [clearClientAuthState]);

  // Check authentication status on mount and when pathname changes
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus, pathname]);

  // Handle route protection logic
  useEffect(() => {
    if (!isLoading) {
      const hasAuth = !!(user && token);
      if (!hasAuth && pathname !== '/landing') {
        router.replace('/landing');
      } else if (hasAuth && pathname === '/landing') {
        router.replace('/browse');
      }
    }
  }, [user, token, isLoading, pathname, router]);

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
    const pathname = usePathname();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        // If not authenticated, redirect to landing
        router.push('/landing');
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
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
