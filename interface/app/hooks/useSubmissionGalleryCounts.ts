"use client";

import { useState, useEffect, useMemo } from "react";
import { ENV } from "../config/env";

type TaskRef = { id: string; name: string };

/**
 * For internal reviewers: loads distinct submitter counts per task for gallery labels.
 * Returns undefined when not a reviewer (caller omits counts on TaskCardGrid).
 */
export function useSubmissionGalleryCounts(
  isInternalReviewer: boolean,
  filteredTasks: TaskRef[]
): Record<string, number | null> | undefined {
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  const fetchKey = useMemo(() => {
    if (!isInternalReviewer) return "";
    return filteredTasks
      .filter((t) => t.id !== "playground")
      .map((t) => `${t.id}\0${t.name}`)
      .sort()
      .join("|");
  }, [isInternalReviewer, filteredTasks]);

  useEffect(() => {
    if (!fetchKey) {
      setCounts({});
      return;
    }

    const tasks = filteredTasks.filter((t) => t.id !== "playground");
    let cancelled = false;

    const initial: Record<string, number | null> = {};
    for (const t of tasks) {
      initial[t.id] = null;
    }
    setCounts(initial);

    void (async () => {
      try {
        const taskNames = tasks.map((task) => task.name).filter(Boolean);
        const query = new URLSearchParams();
        for (const taskName of taskNames) {
          query.append("taskIds", taskName);
        }

        const res = await fetch(`${ENV.BACKEND_URL}/api/submissions/gallery-counts?${query.toString()}`);
        const data = await res.json().catch(() => ({}));
        const byTaskId = (data && typeof data.byTaskId === "object" ? data.byTaskId : {}) as Record<
          string,
          unknown
        >;

        if (!cancelled) {
          const next: Record<string, number> = {};
          for (const task of tasks) {
            const count = byTaskId[task.name];
            next[task.id] = typeof count === "number" ? count : 0;
          }
          setCounts(next);
        }
      } catch {
        if (!cancelled) {
          const fallback: Record<string, number> = {};
          for (const task of tasks) {
            fallback[task.id] = 0;
          }
          setCounts(fallback);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchKey, filteredTasks]);

  if (!isInternalReviewer) {
    return undefined;
  }
  return counts;
}
