import {
  FUNCTION_TUTORIAL_LABEL,
  WEB_TUTORIAL_LABEL,
  isTutorialTaskLabel,
} from "./taskLabels";

/**
 * Tutorial task detection. Tutorial is identified by label "web_tutorial" or "function_tutorial" (from data)
 * or id "tutorial" (legacy / synthetic).
 */
export function isTutorialTask(
  task: { id?: string; label?: string; name?: string } | null | undefined
): boolean {
  if (!task) return false;
  return isTutorialTaskLabel(task.label);
}

/** Return the tutorial task id from a list (for URL / selectedTask). Prefers web_tutorial. */
export function getTutorialTaskId(
  tasks: Array<{ id: string; label?: string }>
): string | null {
  const web = tasks.find((t) => t.label === WEB_TUTORIAL_LABEL);
  if (web) return web.id;
  const fn = tasks.find((t) => t.label === FUNCTION_TUTORIAL_LABEL);
  return fn?.id ?? null;
}

/** True if taskId refers to the tutorial (by id or by resolving task in list). */
export function isTutorialTaskId(
  taskId: string | null,
  tasks: Array<{ id: string; label?: string }>
): boolean {
  if (!taskId) return false;
  return isTutorialTask(tasks.find((t) => t.id === taskId));
}
