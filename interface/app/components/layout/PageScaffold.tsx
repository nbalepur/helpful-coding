"use client";

import { ReactNode, useMemo, useState, useEffect } from "react";
import LoadingSpinner from "../ui/LoadingSpinner";
import { useRouteProtection } from "../../context/auth";
import { useSidebar } from "./AppLayout";

interface PageScaffoldProps {
  children: ReactNode;
  showBackground?: boolean;
  sidebarInitiallyOpen?: boolean;
  fullWidth?: boolean;
  reducedPadding?: boolean;
  widerMaxWidth?: boolean;
}

type StarField = {
  largeStars: Array<{ size: number; left: number; top: number; opacity: number; color: string }>;
  mediumStars: Array<{ size: number; left: number; top: number; opacity: number; color: string }>;
  smallDots: Array<{ size: number; left: number; top: number; opacity: number; color: string }>;
};

// Generate background stars once and reuse across all pages for better performance
// Store in module scope so it persists across navigation
let cachedBackgroundStars: StarField | null = null;

function generateBackgroundStars(): StarField {
  // Return cached version if available
  if (cachedBackgroundStars) {
    return cachedBackgroundStars;
  }

  // Only generate on client side
  if (typeof window === 'undefined') {
    return {
      largeStars: [],
      mediumStars: [],
      smallDots: [],
    };
  }

  const colors = ['#3b82f6', '#8b5cf6', '#ec4899'];

  const makeStars = (count: number, sizeRange: [number, number], opacityRange: [number, number]) =>
    Array.from({ length: count }, () => ({
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * (sizeRange[1] - sizeRange[0]) + sizeRange[0],
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * (opacityRange[1] - opacityRange[0]) + opacityRange[0],
    }));

  cachedBackgroundStars = {
    largeStars: makeStars(20, [2, 6], [0.4, 1]),
    mediumStars: makeStars(40, [1, 3], [0.3, 0.8]),
    smallDots: makeStars(100, [0.5, 2], [0.2, 0.6]),
  };

  return cachedBackgroundStars;
}

export default function PageScaffold({
  children,
  showBackground = false,
  sidebarInitiallyOpen = false,
  fullWidth = false,
  reducedPadding = false,
  widerMaxWidth = false,
}: PageScaffoldProps) {
  const { isAuthenticated, isLoading } = useRouteProtection();
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
    // Set initial sidebar state if prop is provided
    if (sidebarInitiallyOpen) {
      setIsSidebarOpen(true);
    }
  }, [sidebarInitiallyOpen, setIsSidebarOpen]);

  // Use cached background stars - only generate once, reuse across all pages
  const backgroundStars = useMemo<StarField>(() => {
    if (!isMounted) {
      return {
        largeStars: [],
        mediumStars: [],
        smallDots: [],
      };
    }
    return generateBackgroundStars();
  }, [isMounted]);

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
    return null;
  }

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-gray-900 text-white relative">
      {showBackground && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {backgroundStars.largeStars.map((star, i) => (
            <div
              key={`large-${i}`}
              className="absolute rounded-full"
              style={{
                width: `${star.size}px`,
                height: `${star.size}px`,
                left: `${star.left}%`,
                top: `${star.top}%`,
                backgroundColor: star.color,
                opacity: star.opacity,
                boxShadow: `0 0 ${star.size * 2}px ${star.color}, 0 0 ${star.size * 4}px ${star.color}`,
              }}
            />
          ))}
          {backgroundStars.mediumStars.map((star, i) => (
            <div
              key={`medium-${i}`}
              className="absolute rounded-full"
              style={{
                width: `${star.size}px`,
                height: `${star.size}px`,
                left: `${star.left}%`,
                top: `${star.top}%`,
                backgroundColor: star.color,
                opacity: star.opacity,
                boxShadow: `0 0 ${star.size * 1.5}px ${star.color}`,
              }}
            />
          ))}
          {backgroundStars.smallDots.map((dot, i) => (
            <div
              key={`dot-${i}`}
              className="absolute rounded-full"
              style={{
                width: `${dot.size}px`,
                height: `${dot.size}px`,
                left: `${dot.left}%`,
                top: `${dot.top}%`,
                backgroundColor: dot.color,
                opacity: dot.opacity,
              }}
            />
          ))}
        </div>
      )}

      <div
        className={`relative z-10 h-full transition-[margin-left] duration-300 ${
          isSidebarOpen ? 'ml-60' : 'ml-12'
        }`}
      >
        <div className={`${fullWidth ? 'w-full' : widerMaxWidth ? 'max-w-[90%] mx-auto' : 'max-w-7xl mx-auto'} ${reducedPadding ? 'px-2 sm:px-4' : 'px-4 sm:px-8'} py-6 h-full flex flex-col`}>{children}</div>
      </div>
    </div>
  );
}
