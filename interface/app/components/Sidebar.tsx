"use client";
import { useState, useEffect, memo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Menu,
  X,
  Grid3X3,
  Trophy,
  Brain,
  Info,
  // Monitor,
  // Sun,
  // Moon,
  Command,
  Zap,
  Coffee,
  Smile,
  User,
  FlaskConical,
  MessageSquare,
  BarChart3
} from "lucide-react";
import { useAuth } from "../utils/auth";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
  // theme: 'native' | 'light' | 'dark';
  // onThemeChange: (theme: 'native' | 'light' | 'dark') => void;
  isAssistantVisible: boolean;
  onAssistantVisibleChange: (visible: boolean) => void;
}

// Store image source in a constant to ensure it never changes
const TOAST_IMAGE_SRC = "/toast.png";

// Memoized toast icon component to prevent unnecessary re-renders
// Using a regular img tag with proper attributes to prevent reloads on navigation
const ToastIcon = memo(({ className }: { className?: string }) => (
  <img 
    src={TOAST_IMAGE_SRC}
    alt="Toast" 
    className={className || "w-8 h-8 object-contain"}
    loading="eager"
    decoding="async"
  />
), (prevProps, nextProps) => {
  // Only re-render if className actually changes
  return prevProps.className === nextProps.className;
});
ToastIcon.displayName = 'ToastIcon';

// Memoized sidebar header to prevent re-renders when pathname changes
const SidebarHeader = memo(({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) => {
  const getSidebarShortcutLabel = () => 'Open Sidebar (Tab)';
  
  const Tooltip = ({ children, text, always = false, placement = 'right' }: { children: React.ReactNode; text: string; always?: boolean; placement?: 'right' | 'bottom' }) => (
    <div className="relative group">
      {children}
      {(always || !isOpen) && (
        <div className={`absolute ${placement === 'right' ? 'left-full ml-2 top-1/2 -translate-y-1/2' : 'top-full mt-2 left-1/2 -translate-x-1/2'} px-2 py-1 bg-white text-black text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300`}>
          {text}
        </div>
      )}
    </div>
  );

  return (
    <div className={`py-4 border-b border-gray-800 ${isOpen ? 'px-4' : 'px-2'}`}>
      {isOpen ? (
        <div className="w-full flex items-center justify-between space-x-3 px-3 h-10 py-0 rounded-lg bg-gray-900">
          <div className="flex items-center space-x-3 flex-1">
            <ToastIcon />
            <span className="text-white font-semibold">Vibe Jam</span>
          </div>
          <Tooltip text={getSidebarShortcutLabel()}>
            <button
              onClick={onToggle}
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-800 transition-colors"
            >
              <X size={16} />
            </button>
          </Tooltip>
        </div>
      ) : (
        <Tooltip text={getSidebarShortcutLabel()}>
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center px-1 h-10 py-0 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors relative"
          >
            <div className="relative w-8 h-8 flex items-center justify-center group">
              <ToastIcon className="w-full h-full object-contain transition-opacity duration-200 group-hover:opacity-0" />
              <Menu 
                size={16} 
                className="absolute inset-0 m-auto opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
            </div>
          </button>
        </Tooltip>
      )}
    </div>
  );
});
SidebarHeader.displayName = 'SidebarHeader';

// Helper function to derive active tab from pathname and search params
function getActiveTabFromPathname(pathname: string, searchParams?: URLSearchParams | null): string {
  if (pathname === '/leaderboard' || pathname === '/leaderboard/') return 'leaderboard';
  if (pathname === '/skill-check' || pathname === '/skill-check/') return 'skill-check';
  if (pathname === '/stats' || pathname === '/stats/') return 'stats';
  if (pathname === '/about' || pathname === '/about/') return 'about';
  
  // Check if we're on the playground (task=playground query param on /vibe)
  if (pathname === '/vibe' && searchParams && searchParams.get('task') === 'playground') {
    return 'playground';
  }
  
  // /browse is the tasks listing page
  if (pathname === '/browse' || pathname === '/browse/') return 'tasks';
  
  return 'tasks'; // Default for /, etc.
}

export default function Sidebar({ 
  isOpen, 
  onToggle, 
  pathname, 
  // theme, 
  // onThemeChange,
  isAssistantVisible,
  onAssistantVisibleChange
}: SidebarProps) {
  const searchParams = useSearchParams();
  // Derive activeTab from pathname and search params
  const activeTab = getActiveTabFromPathname(pathname, searchParams);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prefetch primary routes immediately to speed up first navigation
  // Note: Prefetching works best in production. In development, Next.js may not prefetch effectively.
  // Also, routes with query params may not prefetch properly - prefetch the base path instead
  useEffect(() => {
    const routesToPrefetch = [
      '/browse',  // Tasks listing page
      '/leaderboard', 
      '/skill-check',
      '/stats',
      '/about'
    ];
    const prefetchRoutes = () => {
      routesToPrefetch.forEach((route) => {
        try {
          router.prefetch(route);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Prefetch] Failed to prefetch:', route, err);
          }
        }
      });
    };
    
    // Prefetch immediately when component mounts
    prefetchRoutes();
    
    // Also prefetch on idle as backup (browsers throttle immediate prefetch)
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      requestIdleCallback(prefetchRoutes, { timeout: 2000 });
    }
  }, [router]);

  const navigationItems = [
    { id: 'tasks', icon: Grid3X3, label: 'All Tasks' },
    { id: 'playground', icon: FlaskConical, label: 'Playground', tooltip: 'Playground (Tutorial)' },
    { id: 'skill-check', icon: Brain, label: 'Skill Check' },
    { id: 'stats', icon: BarChart3, label: 'Stats' },
    { id: 'leaderboard', icon: Trophy, label: 'Leaderboard' },
    { id: 'about', icon: Info, label: 'Instructions' },
    { id: 'feedback', icon: MessageSquare, label: 'Feedback', isExternal: true, externalUrl: 'https://forms.gle/9zr5VcfzcPC4Mp5x8' },
  ] as const;

  // const themeOptions = [
  //   { id: 'native', icon: Monitor, label: 'Native' },
  //   { id: 'light', icon: Sun, label: 'Light' },
  //   { id: 'dark', icon: Moon, label: 'Dark' },
  // ] as const;


  const ChillLogo = () => (
    <div className="relative w-8 h-8">
      {/* Coffee cup base */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-4 bg-gradient-to-t from-amber-600 to-amber-500 rounded-b-lg"></div>
      {/* Coffee cup handle */}
      <div className="absolute right-0 top-1 w-2 h-2 border-2 border-amber-600 rounded-full"></div>
      {/* Steam lines */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 flex space-x-0.5">
        <div className="w-0.5 h-2 bg-blue-300 rounded-full animate-pulse"></div>
        <div className="w-0.5 h-2 bg-blue-300 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
        <div className="w-0.5 h-2 bg-blue-300 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
      </div>
      {/* Chill face */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2">
        <Smile size={12} className="text-amber-200" />
      </div>
    </div>
  );

  const Tooltip = ({ children, text, always = false, placement = 'right' }: { children: React.ReactNode; text: string; always?: boolean; placement?: 'right' | 'bottom' }) => (
    <div className="relative group">
      {children}
      {(always || !isOpen) && (
        <div className={`absolute ${placement === 'right' ? 'left-full ml-2 top-1/2 -translate-y-1/2' : 'top-full mt-2 left-1/2 -translate-x-1/2'} px-2 py-1 bg-white text-black text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300`}>
          {text}
        </div>
      )}
    </div>
  );

  // Prevent flicker by not rendering until mounted
  if (!mounted) {
    return (
      <div className="fixed top-0 left-0 h-full w-12 bg-gray-950 border-r border-gray-800 z-40" />
    );
  }

  return (
    <>
      {/* Sidebar */}
      <div className={`fixed top-0 left-0 h-full bg-gray-950 border-r border-gray-800 transition-all duration-300 ease-in-out z-40 ${
        isOpen ? 'w-60' : 'w-12'
      }`}>
        <div className="flex flex-col h-full">
          {/* Top Toggle Button */}
          <SidebarHeader isOpen={isOpen} onToggle={onToggle} />

          {/* Navigation */}
          <div className="flex-1 pt-2 pb-6">
            <div className={`${isOpen ? 'px-2' : 'px-1'}`}>
              <h2 className={`text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 px-2 transition-all duration-300 ${
                isOpen ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden'
              }`}>
                Navigation
              </h2>
              <div className="space-y-1">
                {navigationItems.map((item) => {
                  const routeMap: Record<string, string> = {
                    'tasks': '/browse',
                    'playground': '/vibe?task=playground',
                    'leaderboard': '/leaderboard',
                    'skill-check': '/skill-check',
                    'stats': '/stats',
                    'about': '/about',
                  };
                  const isExternal = (item as any).isExternal;
                  const externalUrl = (item as any).externalUrl;
                  const route = isExternal ? externalUrl : (routeMap[item.id] || '/vibe');
                  
                  const commonClasses = `w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center px-1'} h-10 py-0 rounded-lg transition-colors cursor-pointer ${
                    activeTab === item.id
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-900/20'
                  }`;

                  return (
                    <Tooltip key={item.id} text={(item as any).tooltip || item.label}>
                      {isExternal ? (
                        <a
                          href={route}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={commonClasses}
                        >
                          <item.icon size={16} />
                          <span className={`transition-all duration-300 ${
                            isOpen ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden'
                          }`}>
                            {item.label}
                          </span>
                        </a>
                      ) : (
                        <Link
                          href={route}
                          className={commonClasses}
                        >
                          <item.icon size={16} />
                          <span className={`transition-all duration-300 ${
                            isOpen ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden'
                          }`}>
                            {item.label}
                          </span>
                        </Link>
                      )}
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className={`border-t border-gray-800 ${isOpen ? 'p-2' : 'p-1'}`}>
            {/* User Profile / Logout */}
            <div>
              <div className="pt-4 mb-2">
                <div className={`flex items-center w-full ${isOpen ? 'justify-start' : 'justify-center'}`}>
                <button
                  onClick={onToggle}
                  className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none"
                  aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                  <User size={16} className="text-white" />
                </button>
                <div className={`${isOpen ? 'ml-3' : 'ml-0'} transition-all duration-300 leading-tight overflow-hidden ${
                  isOpen ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'
                }`}>
                  <h1 className="text-sm font-semibold text-white">{user?.username || 'User'}</h1>
                  <button
                    type="button"
                    onClick={() => { logout(); }}
                    className="text-xs text-gray-300 hover:text-blue-400 bg-transparent hover:bg-transparent focus:bg-transparent active:bg-transparent p-0 m-0 border-0 focus:outline-none cursor-pointer"
                  >
                    Log out
                  </button>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}