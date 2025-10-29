"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  getUserIdCookie, 
  getAuthTokenCookie, 
  setUserIdCookie, 
  setAuthTokenCookie, 
  clearAuthCookies, 
  isUserAuthenticated 
} from '../utils/cookies';

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
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Check authentication status on mount and when pathname changes
  useEffect(() => {
    checkAuthStatus();
  }, [pathname]);

  // Handle route protection logic
  useEffect(() => {
    if (!isLoading) {
      const hasAuth = !!(user && token);
      if (!hasAuth && pathname !== '/landing') {
        // Not authenticated and not on landing page - redirect immediately
        router.replace('/landing');
      } else if (hasAuth && pathname === '/landing') {
        // Authenticated but on landing page - redirect to browse
        router.replace('/browse');
      }
    }
  }, [user, token, isLoading, pathname, router]);

  const checkAuthStatus = () => {
    setIsLoading(true);
    
    try {
      const userId = getUserIdCookie();
      const authToken = getAuthTokenCookie();
      
      if (userId && authToken) {
        // Try to get user data from localStorage as fallback
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            setUser(userData);
            setToken(authToken);
          } catch (error) {
            console.error('Error parsing stored user data:', error);
            clearAuthCookies();
            localStorage.removeItem('user');
            localStorage.removeItem('auth_token');
          }
        } else {
          // If no user data in localStorage but cookies exist, clear everything
          clearAuthCookies();
        }
      } else {
        // No valid authentication
        setUser(null);
        setToken(null);
        clearAuthCookies();
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      clearAuthCookies();
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
    } finally {
      setIsLoading(false);
    }
  };

  const login = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    
    // Store in cookies
    setUserIdCookie(userData.id);
    setAuthTokenCookie(authToken);
    
    // Also store in localStorage for backward compatibility
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('auth_token', authToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    
    // Clear cookies and localStorage
    clearAuthCookies();
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    
    // Redirect to landing page
    router.push('/landing');
  };

  const checkAuth = () => {
    return isUserAuthenticated();
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
