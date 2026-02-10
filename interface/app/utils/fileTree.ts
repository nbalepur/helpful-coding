/**
 * Shared utilities for file tree nodes and language keys (used by vibe page and CodeAndSubmissionsPane).
 */

export function cloneFileNodes(nodes: any[] | undefined): any[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map(node => ({
    ...node,
    children: Array.isArray(node?.children) ? cloneFileNodes(node.children) : node?.children,
  }));
}

export function flattenFileNodes(nodes: any[] | undefined): any[] {
  if (!Array.isArray(nodes)) return [];
  const result: any[] = [];
  const stack = [...nodes];
  while (stack.length) {
    const current = stack.shift();
    if (!current) continue;
    result.push(current);
    if (Array.isArray(current.children) && current.children.length > 0) {
      stack.unshift(...current.children);
    }
  }
  return result;
}

export function determineLanguageKey(language?: string, name?: string): string | null {
  const lower = (name || language || "").toLowerCase();
  if (lower.endsWith(".html") || lower === "html") return "html";
  if (lower.endsWith(".css") || lower === "css") return "css";
  if (lower.endsWith(".js") || lower === "js") return "js";
  if (lower.endsWith(".py") || lower === "py" || lower === "python") return "py";
  return null;
}

export function defaultFileName(type: string): string {
  switch (type) {
    case "html": return "index.html";
    case "css": return "styles.css";
    case "js": return "script.js";
    default: return `${type}.txt`;
  }
}
