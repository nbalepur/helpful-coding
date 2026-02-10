"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getUserSettingsCookie, updateUserSetting } from '../utils/cookies';

interface IframeThemeContextType {
  isLightMode: boolean;
  toggleLightMode: () => void;
}

const IframeThemeContext = createContext<IframeThemeContextType | undefined>(undefined);

export function IframeThemeProvider({ children }: { children: ReactNode }) {
  const [isLightMode, setIsLightMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const settings = getUserSettingsCookie();
    setIsLightMode(settings.iframeLightMode);
  }, []);

  const toggleLightMode = () => {
    const newValue = !isLightMode;
    setIsLightMode(newValue);
    updateUserSetting('iframeLightMode', newValue);
  };

  // Always provide the context, even before mounting (uses default false for SSR)
  return (
    <IframeThemeContext.Provider value={{ isLightMode, toggleLightMode }}>
      {children}
    </IframeThemeContext.Provider>
  );
}

export function useIframeTheme() {
  const context = useContext(IframeThemeContext);
  if (context === undefined) {
    throw new Error('useIframeTheme must be used within an IframeThemeProvider');
  }
  return context;
}
