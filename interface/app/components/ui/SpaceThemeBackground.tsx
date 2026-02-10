"use client";

import { useMemo } from "react";

interface SpaceThemeBackgroundProps {
  /** When true, animated dots are hidden (e.g. on /vibe page) */
  hideAnimatedDots?: boolean;
}

export default function SpaceThemeBackground({ hideAnimatedDots = false }: SpaceThemeBackgroundProps) {
  const stars = useMemo(() => {
    const colors = ["#3b82f6", "#8b5cf6", "#ec4899"];
    const largeStars = Array.from({ length: 20 }, () => ({
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 4 + 2,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.6 + 0.4,
    }));
    const mediumStars = Array.from({ length: 40 }, () => ({
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 2 + 1,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.5 + 0.3,
    }));
    const smallDots = Array.from({ length: 100 }, () => ({
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 1.5 + 0.5,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.4 + 0.2,
    }));
    const animatedColors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];
    const animatedDots = Array.from({ length: 12 }, () => ({
      color: animatedColors[Math.floor(Math.random() * animatedColors.length)],
      size: Math.random() * 8 + 4,
      top: Math.random() * 100,
      duration: Math.random() * 30 + 40,
      delay: Math.random() * 5,
      direction: Math.random() > 0.5 ? "left-to-right" : "right-to-left" as const,
      opacity: Math.random() * 0.6 + 0.4,
    }));
    return { largeStars, mediumStars, smallDots, animatedDots };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {stars.largeStars.map((star, i) => (
        <div
          key={`star-${i}`}
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
      {stars.mediumStars.map((star, i) => (
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
      {stars.smallDots.map((dot, i) => (
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
      {!hideAnimatedDots &&
        stars.animatedDots.map((dot, i) => (
          <div
            key={`animated-dot-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              top: `${dot.top}%`,
              left: dot.direction === "left-to-right" ? "-20px" : "calc(100% + 20px)",
              backgroundColor: dot.color,
              opacity: dot.opacity,
              boxShadow: `0 0 ${dot.size * 1.5}px ${dot.color}, 0 0 ${dot.size * 3}px ${dot.color}`,
              animation: `moveAcross${dot.direction === "left-to-right" ? "Right" : "Left"} ${dot.duration}s linear ${dot.delay}s infinite`,
            }}
          />
        ))}
    </div>
  );
}
