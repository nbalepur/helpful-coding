"use client";

import React, { useState, useEffect, useRef } from "react";

export type TimerAlertTone = "warning" | "critical";

export interface WarningCheckpoint {
  key: string;
  thresholdSeconds: number;
  message: string;
  tone: TimerAlertTone;
  dismissible: boolean;
}

interface TaskTimerProps {
  isTimedTaskSelected: boolean;
  hasTimedTaskStarted: boolean;
  taskTimerDurationSeconds: number;
  /** When parent gets timer state from API (or task change), pass remaining seconds so we sync. */
  initialRemainingSeconds: number | null;
  isPaused: boolean;
  warningCheckpoints: WarningCheckpoint[];
  onWarning: (key: string, message: string, tone: TimerAlertTone, options: { dismissible: boolean; autoDismissMs: number }) => void;
  onExpired: () => void;
  /** Ref to track which warning keys we've already fired (parent owns it). */
  warningKeysShownRef: React.MutableRefObject<Set<string>>;
  /** Ref to avoid showing expired modal multiple times (parent owns it). */
  expiredModalShownRef: React.MutableRefObject<boolean>;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Isolates timer state and countdown so only this component re-renders every second.
 * Parent (vibe page) no longer has timeLeftSeconds, so the rest of the page (e.g. assistant pane) does not re-render on tick.
 */
export function TaskTimer({
  isTimedTaskSelected,
  hasTimedTaskStarted,
  taskTimerDurationSeconds,
  initialRemainingSeconds,
  isPaused,
  warningCheckpoints,
  onWarning,
  onExpired,
  warningKeysShownRef,
  expiredModalShownRef,
}: TaskTimerProps) {
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(() =>
    initialRemainingSeconds != null ? initialRemainingSeconds : taskTimerDurationSeconds
  );
  const syncedInitialRef = useRef<number | null>(null);

  // Sync from parent when initial remaining seconds is set (e.g. from API).
  useEffect(() => {
    if (initialRemainingSeconds == null) return;
    if (syncedInitialRef.current === initialRemainingSeconds) return;
    syncedInitialRef.current = initialRemainingSeconds;
    setTimeLeftSeconds(Math.max(0, Math.min(taskTimerDurationSeconds, initialRemainingSeconds)));
  }, [initialRemainingSeconds, taskTimerDurationSeconds]);

  // Countdown interval: only this component re-renders every second.
  useEffect(() => {
    if (!isTimedTaskSelected || !hasTimedTaskStarted) return;

    const intervalId = window.setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (isPaused) return prev;
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isTimedTaskSelected, hasTimedTaskStarted, isPaused]);

  // Fire warnings and expired when crossing thresholds.
  useEffect(() => {
    if (!isTimedTaskSelected) return;

    warningCheckpoints.forEach(({ key, thresholdSeconds, message, tone, dismissible }) => {
      if (
        thresholdSeconds <= 0 ||
        thresholdSeconds > taskTimerDurationSeconds ||
        warningKeysShownRef.current.has(key)
      ) {
        return;
      }
      if (timeLeftSeconds <= thresholdSeconds && timeLeftSeconds > 0) {
        warningKeysShownRef.current.add(key);
        onWarning(key, message, tone, {
          dismissible,
          autoDismissMs: tone === "critical" ? 15000 : 9000,
        });
      }
    });

    if (timeLeftSeconds <= 0 && !isPaused && !expiredModalShownRef.current) {
      expiredModalShownRef.current = true;
      onExpired();
    }
  }, [
    isTimedTaskSelected,
    taskTimerDurationSeconds,
    timeLeftSeconds,
    warningCheckpoints,
    onWarning,
    onExpired,
    isPaused,
    warningKeysShownRef,
    expiredModalShownRef,
  ]);

  if (!isTimedTaskSelected) return null;

  const timedTaskLimitMinutes = Math.max(1, Math.floor(taskTimerDurationSeconds / 60));
  const formattedTimeLeft = formatTime(timeLeftSeconds);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all ${
        !hasTimedTaskStarted
          ? "border border-blue-300/60 bg-blue-900/30 text-blue-100"
          : timeLeftSeconds <= 3 * 60
            ? "border border-red-300/70 bg-red-900/50 text-red-100"
            : timeLeftSeconds <= Math.floor(taskTimerDurationSeconds * 0.25)
              ? "border border-amber-300/70 bg-amber-900/40 text-amber-100"
              : "border border-gray-700/60 bg-gray-800/40 text-gray-300"
      }`}
    >
      {hasTimedTaskStarted ? `⏳ Time Left: ${formattedTimeLeft}` : `⏳ Starts on click: ${timedTaskLimitMinutes} min`}
    </span>
  );
}
