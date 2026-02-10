export const WEB_TUTORIAL_LABEL = "web_tutorial";
export const FUNCTION_TUTORIAL_LABEL = "function_tutorial";
export const WRITE_FUNCTION_LABEL = "write_function";
export const DEBUG_FUNCTION_LABEL = "debug_function";
export const REPLICATION_LABEL = "replication";
export const OPEN_ENDED_LABEL = "open-ended";

export const TUTORIAL_TASK_LABELS = [
  WEB_TUTORIAL_LABEL,
  FUNCTION_TUTORIAL_LABEL,
] as const;

export const WEBSITE_TASK_LABELS = [
  REPLICATION_LABEL,
  OPEN_ENDED_LABEL,
  WEB_TUTORIAL_LABEL,
] as const;

export const FUNCTION_TASK_LABELS = [
  WRITE_FUNCTION_LABEL,
  DEBUG_FUNCTION_LABEL,
  FUNCTION_TUTORIAL_LABEL,
] as const;

export const FUNCTION_CODING_TASK_LABELS = [
  WRITE_FUNCTION_LABEL,
  DEBUG_FUNCTION_LABEL,
] as const;

function hasLabel(labels: readonly string[], label?: string | null): boolean {
  return !!label && labels.includes(label);
}

export function isTutorialTaskLabel(label?: string | null): boolean {
  return hasLabel(TUTORIAL_TASK_LABELS, label);
}

export function isWebsiteTaskLabel(label?: string | null): boolean {
  return hasLabel(WEBSITE_TASK_LABELS, label);
}

export function isFunctionTaskLabel(label?: string | null): boolean {
  return hasLabel(FUNCTION_TASK_LABELS, label);
}

export function isFunctionCodingTaskLabel(label?: string | null): boolean {
  return hasLabel(FUNCTION_CODING_TASK_LABELS, label);
}
