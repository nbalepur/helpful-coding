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
      await Promise.all(
        tasks.map(async (task) => {
          try {
            const res = await fetch(
              `${ENV.BACKEND_URL}/api/submissions/gallery-count?taskId=${encodeURIComponent(task.name)}`
            );
            const data = await res.json().catch(() => ({}));
            const count = typeof data.count === "number" ? data.count : 0;
            if (!cancelled) {
              setCounts((prev) => ({ ...prev, [task.id]: count }));
            }
          } catch {
            if (!cancelled) {
              setCounts((prev) => ({ ...prev, [task.id]: 0 }));
            }
          }
        })
      );
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
