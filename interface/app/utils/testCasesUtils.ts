/** Shared types and pure helpers for TestCasesPanel. */

export type RunState = "idle" | "running" | "done" | "error";
export type BatchCaseStatus = "idle" | "queued" | "running" | "passed" | "failed";

export interface ExecuteResult {
  success: boolean;
  output: string;
  error?: string;
  stderr?: string;
}

export interface BatchCaseResult {
  status: BatchCaseStatus;
  summary?: string;
  input?: unknown;
  expected?: unknown;
  actual?: unknown;
}

export interface FunctionSignature {
  name: string;
  args: string[];
}

export function flattenFiles(nodes: any[] = []): any[] {
  const out: any[] = [];
  const queue = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.type === "file") out.push(node);
    if (Array.isArray(node.children)) queue.unshift(...node.children);
  }
  return out;
}

export function parseFunctionSignatures(code: string): FunctionSignature[] {
  const signatures: FunctionSignature[] = [];
  const re = /def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    const argsRaw = m[2] || "";
    const args = argsRaw
      .split(",")
      .map((arg) => arg.trim())
      .filter(Boolean)
      .map((arg) => arg.replace(/=.*/, "").replace(/:.*/, "").replace(/^\*+/, "").trim())
      .filter((arg) => arg && arg !== "self");
    signatures.push({ name, args });
  }
  return signatures;
}

/** Parse string/object to value (JSON or raw string). Used for both custom inputs and test case input. */
export function parseLooseValue(value: unknown): any {
  if (value == null) return "";
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function normalizeForCompare(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value).trim();
  }
}

export function getPythonCodeFromFiles(files: any[]): string {
  const flat = flattenFiles(files);
  const solutionFile = flat.find((file: any) => String(file?.name || "").toLowerCase() === "solution.py");
  if (solutionFile) return String(solutionFile.content ?? "");
  const firstPython = flat.find((file: any) => String(file?.name || "").toLowerCase().endsWith(".py"));
  return firstPython ? String((firstPython as any).content ?? "") : "";
}

/** Get current Python code from editor ref (live) or fallback to files. */
export function getCurrentPythonCode(
  actualEditorRef: { current: any },
  currentFiles: any[]
): string {
  try {
    const liveContents = actualEditorRef.current?.getAllFileContents?.() as Record<string, string> | undefined;
    if (liveContents && typeof liveContents === "object") {
      const solutionEntry = Object.entries(liveContents).find(([name]) => name.toLowerCase() === "solution.py");
      if (solutionEntry) return String(solutionEntry[1] ?? "");
      const firstPython = Object.entries(liveContents).find(([name]) => name.toLowerCase().endsWith(".py"));
      if (firstPython) return String(firstPython[1] ?? "");
    }
  } catch {
    // fallback below
  }
  return getPythonCodeFromFiles(currentFiles);
}

/** Compare expected vs actual with numeric tolerance (similar to Python's math.isclose). */
export function outputsMatch(expected: unknown, actual: string): boolean {
  const expNorm = normalizeForCompare(expected);
  const actNorm = (actual ?? "").trim();
  if (expNorm === actNorm) return true;
  const expNum = Number(expNorm);
  const actNum = Number(actNorm);
  if (Number.isFinite(expNum) && Number.isFinite(actNum)) {
    const tol = 1e-9;
    return Math.abs(expNum - actNum) <= tol || (expNum !== 0 && Math.abs((expNum - actNum) / expNum) <= tol);
  }
  return false;
}

export function formatBatchValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
