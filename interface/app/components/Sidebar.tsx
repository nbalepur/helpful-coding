"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  User
} from "lucide-react";
import { useAuth } from "../utils/auth";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  // theme: 'native' | 'light' | 'dark';
  // onThemeChange: (theme: 'native' | 'light' | 'dark') => void;
  isAssistantVisible: boolean;
  onAssistantVisibleChange: (visible: boolean) => void;
}

export default function Sidebar({ 
  isOpen, 
  onToggle, 
  activeTab, 
  onTabChange, 
  // theme, 
  // onThemeChange,
  isAssistantVisible,
  onAssistantVisibleChange
}: SidebarProps) {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  const navigationItems = [
    { id: 'tasks', icon: Grid3X3, label: 'Tasks' },
    { id: 'skill-check', icon: Brain, label: 'Skill Check' },
    { id: 'leaderboard', icon: Trophy, label: 'Leaderboard' },
    { id: 'about', icon: Info, label: 'About' },
  ] as const;

  // Feedback removed; About moved into navigation

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

  const getSidebarShortcutLabel = () => 'Open Sidebar (Tab)';

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
          <div className={`py-4 border-b border-gray-800 ${isOpen ? 'px-4' : 'px-2'}`}>
            {isOpen ? (
              <div className="w-full flex items-center justify-between space-x-3 px-3 h-10 py-0 rounded-lg bg-gray-900">
                <div className="flex items-center space-x-3 flex-1">
                  <img 
                    src="/toast.png" 
                    alt="Toast" 
                    className="w-8 h-8 object-contain"
                  />
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
                    <img 
                      src="/toast.png" 
                      alt="Toast" 
                      className="w-full h-full object-contain transition-opacity duration-200 group-hover:opacity-0"
                    />
                    <Menu 
                      size={16} 
                      className="absolute inset-0 m-auto opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    />
                  </div>
                </button>
              </Tooltip>
            )}
          </div>

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
                    'leaderboard': '/leaderboard',
                    'skill-check': '/skill-check',
                    'about': '/about',
                  };
                  const route = routeMap[item.id] || '/browse';
                  
                  return (
                    <Tooltip key={item.id} text={item.label}>
                      <a
                        href={route}
                        onClick={(e) => {
                          // Allow default behavior for command/ctrl clicks (open in new tab)
                          if (e.metaKey || e.ctrlKey) {
                            return;
                          }
                          // Prevent default and navigate programmatically for normal clicks
                          e.preventDefault();
                          window.location.href = route;
                        }}
                        className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center px-1'} h-10 py-0 rounded-lg transition-colors cursor-pointer ${
                          activeTab === item.id
                            ? 'bg-gray-800 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-900/50'
                        }`}
                      >
                        <item.icon size={16} />
                        <span className={`transition-all duration-300 ${
                          isOpen ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden'
                        }`}>
                          {item.label}
                        </span>
                      </a>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className={`border-t border-gray-800 ${isOpen ? 'p-2' : 'p-1'}`}>
            {/* Theme Selector */}
            {/* <div className="mb-4">
              <div className={`border-t border-gray-800 mb-4 ${isOpen ? 'mx-[-8px]' : 'mx-[-4px]'}`}></div>
              <h3 className={`text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-2 transition-all duration-300 ${
                isOpen ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden'
              }`}>
                Theme
              </h3>
              <div className={`flex ${isOpen ? 'space-x-1' : 'flex-col space-y-1'}`}>
                {themeOptions.map((option) => (
                  <Tooltip key={option.id} text={option.label} always={isOpen} placement={isOpen ? 'bottom' : 'right'}>
                    <button
                      onClick={() => onThemeChange(option.id as 'native' | 'light' | 'dark')}
                      className={`${isOpen ? 'p-2' : 'w-full flex justify-center p-2'} rounded-lg transition-colors ${
                        theme === option.id
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-900/50'
                      }`}
                      aria-pressed={theme === option.id}
                    >
                      <option.icon size={16} />
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div> */}


            {/* User Profile / Logout */}
            <div>
              <div className="pt-4 mb-2">
                <div className={`flex items-center w-full ${isOpen ? 'justify-start' : 'justify-center'}`}>
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-white" />
                </div>
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