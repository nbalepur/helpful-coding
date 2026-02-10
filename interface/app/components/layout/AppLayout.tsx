"use client";

import { ReactNode, useState, createContext, useContext, useMemo, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import InstructionsModal from "../ui/InstructionsModal";
import { getUserSettingsCookie, updateUserSetting } from "../../utils/cookies";

interface SidebarContextType {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  isAssistantVisible: boolean;
  setIsAssistantVisible: (visible: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within AppLayout");
  }
  return context;
}

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAssistantVisible, setIsAssistantVisible] = useState(true);
  // First-time instructions: show modal when user has not dismissed it (stored in cookie)
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  useEffect(() => {
    const settings = getUserSettingsCookie();
    if (!settings.instructionsSeen) {
      setShowInstructionsModal(true);
    }
  }, []);
  const handleDismissInstructions = useCallback(() => {
    updateUserSetting('instructionsSeen', true);
    setShowInstructionsModal(false);
  }, []);

  // Preload toast.png to prevent reloads when Sidebar remounts
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/toast.png';
    document.head.appendChild(link);
    
    // Also preload as regular image to warm browser cache
    const img = new Image();
    img.src = '/toast.png';
    
    return () => {
      // Cleanup on unmount
      if (document.head.contains(link)) {
        document.head.removeChild(link);
      }
    };
  }, []);

  // Don't show sidebar on landing page
  const isLandingPage = pathname === '/landing';

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  // Global keyboard handler for Tab key to toggle sidebar (disabled on landing page)
  useEffect(() => {
    if (isLandingPage) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = (event.key || '').toLowerCase();
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable;

      // Only handle Tab when user isn't typing (prevents interfering with focus navigation in forms)
      if (!isTyping && key === 'tab') {
        event.preventDefault();
        event.stopPropagation();
        try { (event as any).stopImmediatePropagation?.(); } catch(_) {}
        toggleSidebar();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [toggleSidebar, isLandingPage]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      isSidebarOpen,
      setIsSidebarOpen,
      toggleSidebar,
      isAssistantVisible,
      setIsAssistantVisible,
    }),
    [isSidebarOpen, toggleSidebar, isAssistantVisible]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      {!isLandingPage && (
        <Sidebar
          isOpen={isSidebarOpen}
          onToggle={toggleSidebar}
          pathname={pathname}
          isAssistantVisible={isAssistantVisible}
          onAssistantVisibleChange={setIsAssistantVisible}
        />
      )}
      {children}
      {/* First-time instructions popup (dismissible anytime via "Got It"; state in cookie) */}
      {!isLandingPage && (
        <InstructionsModal
          open={showInstructionsModal}
          onDismiss={handleDismissInstructions}
        />
      )}
    </SidebarContext.Provider>
  );
}
