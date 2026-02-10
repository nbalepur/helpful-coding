"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BatchCaseResult,
  type ExecuteResult,
  type RunState,
  formatBatchValue,
  getCurrentPythonCode,
  getPythonCodeFromFiles,
  outputsMatch,
  parseFunctionSignatures,
  parseLooseValue,
} from "@/app/utils/testCasesUtils";

const MIN_TOP_PX = 120;
const MIN_BOTTOM_PX = 160;

/** One test case result for run_all log metadata (matches UI: input, expected, actual). */
export type TestRunCaseResult = {
  input: unknown;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

/** Metadata for test-run code log. Passed to onAfterRunTests when a run finishes. */
export type TestRunLogMetadata =
  | {
      runType: "custom";
      success: boolean;
      hasErrorOutput?: boolean;
      /** Custom input that was run */
      input: unknown;
      /** What was shown in the terminal (output or error message) */
      output: string;
    }
  | {
      runType: "run_all";
      total: number;
      passed: number;
      allPassed: boolean;
      /** Per-case results: input, expected, actual, passed (like the UI) */
      results: TestRunCaseResult[];
    };

export interface UseTestCasesPanelProps {
  currentFiles: any[];
  actualEditorRef: React.RefObject<any>;
  testCases?: Array<Record<string, any>> | null;
  entryPoint?: string | null;
  initialFiles?: any[] | null;
  /** Called when batch test results change. allPassed is true when all test cases passed. */
  onAllTestsPassedChange?: (allPassed: boolean) => void;
  /** Called after a test run finishes (custom input or run all). Use to save/log code with run metadata. */
  onAfterRunTests?: (metadata: TestRunLogMetadata) => void;
}

export function useTestCasesPanel({
  currentFiles,
  actualEditorRef,
  testCases,
  entryPoint,
  initialFiles,
  onAllTestsPassedChange,
  onAfterRunTests,
}: UseTestCasesPanelProps) {
  const [runState, setRunState] = useState<RunState>("idle");
  const [output, setOutput] = useState("");
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [batchRunState, setBatchRunState] = useState<RunState>("idle");
  const [batchSummary, setBatchSummary] = useState("");
  const [batchResults, setBatchResults] = useState<BatchCaseResult[]>([]);
  const [expandedBatchRows, setExpandedBatchRows] = useState<Record<number, boolean>>({});
  const [topPanelHeightPx, setTopPanelHeightPx] = useState(200);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const hasSetInitialSplitRef = useRef(false);

  const initialPythonCode = useMemo(() => {
    if (initialFiles?.length) return getPythonCodeFromFiles(initialFiles);
    return "";
  }, [initialFiles]);

  const currentPythonCode = useMemo(() => {
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
  }, [actualEditorRef, currentFiles]);

  const signatures = useMemo(
    () => parseFunctionSignatures(initialPythonCode || currentPythonCode),
    [initialPythonCode, currentPythonCode]
  );

  const selectedSignature = useMemo(() => {
    if (entryPoint) {
      const byEntry = signatures.find((sig) => sig.name === entryPoint);
      if (byEntry) return byEntry;
    }
    const solutionSig = signatures.find((sig) => sig.name === "solution");
    return solutionSig || signatures[0] || null;
  }, [signatures, entryPoint]);

  useEffect(() => {
    const next: Record<string, string> = {};
    const firstTestInput = testCases?.[0]?.input;
    const selectedArgs = selectedSignature?.args || [];
    if (selectedArgs.length === 0) {
      setInputValues({});
      return;
    }
    if (selectedArgs.length === 1) {
      const key = selectedArgs[0];
      const v = firstTestInput;
      if (typeof v === "string") next[key] = v;
      else if (v != null) {
        try {
          next[key] = JSON.stringify(v);
        } catch {
          next[key] = String(v);
        }
      } else next[key] = "";
    } else {
      selectedArgs.forEach((arg) => {
        const v = firstTestInput && typeof firstTestInput === "object" ? (firstTestInput as any)[arg] : "";
        if (v == null) next[arg] = "";
        else if (typeof v === "string") next[arg] = v;
        else {
          try {
            next[arg] = JSON.stringify(v);
          } catch {
            next[arg] = String(v);
          }
        }
      });
    }
    setInputValues(next);
  }, [selectedSignature, testCases]);

  useEffect(() => {
    const count = Array.isArray(testCases) ? testCases.length : 0;
    setBatchResults(Array.from({ length: count }, () => ({ status: "idle" as const })));
    setBatchRunState("idle");
    setBatchSummary("");
    setExpandedBatchRows({});
    onAllTestsPassedChange?.(false);
  }, [testCases, onAllTestsPassedChange]);

  const buildInputPayload = () => {
    const args = selectedSignature?.args || [];
    if (args.length === 1) return parseLooseValue(inputValues[args[0]] ?? "");
    if (args.length > 1) {
      return args.reduce<Record<string, any>>((acc, arg) => {
        acc[arg] = parseLooseValue(inputValues[arg] ?? "");
        return acc;
      }, {});
    }
    return "";
  };

  const executeFunction = async (inputPayload: any): Promise<ExecuteResult> => {
    const codeToRun = getCurrentPythonCode(actualEditorRef, currentFiles);
    try {
      const res = await fetch("/api/execute-function", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pythonCode: codeToRun,
          functionName: entryPoint ?? selectedSignature?.name ?? "solution",
          input: inputPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return {
          success: false,
          output: "",
          error: String(data?.error || data?.stderr || data?.stdout || "Execution failed."),
        };
      }
      const stdout = String(data?.stdout || "").trim();
      const stderr = String(data?.stderr || "").trim();
      return {
        success: true,
        output: stdout || stderr || "(no output)",
        stderr: stderr || undefined,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Execution failed.",
      };
    }
  };

  const handleRun = async () => {
    const inputPayload = buildInputPayload();
    const codeToRun = getCurrentPythonCode(actualEditorRef, currentFiles);
    if (!codeToRun.trim()) {
      const msg = "No Python code found to execute.";
      setRunState("error");
      setOutput(msg);
      onAfterRunTests?.({ runType: "custom", success: false, input: inputPayload, output: msg });
      return;
    }
    setRunState("running");
    setOutput("");
    const result = await executeFunction(inputPayload);
    if (!result.success) {
      const msg = result.error || "Execution failed.";
      setRunState("error");
      setOutput(msg);
      onAfterRunTests?.({ runType: "custom", success: false, input: inputPayload, output: msg });
      return;
    }
    const hasErrorOutput =
      (result.stderr?.trim().length ?? 0) > 0 ||
      /Traceback \(most recent call last\)|Error:|Exception:/.test(result.output);
    if (hasErrorOutput) {
      const msg = (result.stderr || result.output).trim();
      setRunState("error");
      setOutput(msg);
      onAfterRunTests?.({ runType: "custom", success: false, hasErrorOutput: true, input: inputPayload, output: msg });
      return;
    }
    setRunState("done");
    setOutput(result.output);
    onAfterRunTests?.({ runType: "custom", success: true, input: inputPayload, output: result.output });
  };

  const handleRunAllTestCases = async () => {
    const codeToRun = getCurrentPythonCode(actualEditorRef, currentFiles);
    if (!codeToRun.trim()) {
      setBatchRunState("error");
      setBatchSummary("No Python code found to execute.");
      onAfterRunTests?.({ runType: "run_all", total: 0, passed: 0, allPassed: false, results: [] });
      return;
    }
    if (!Array.isArray(testCases) || testCases.length === 0) {
      setBatchRunState("error");
      setBatchSummary("No Test Cases available for this task.");
      onAfterRunTests?.({ runType: "run_all", total: 0, passed: 0, allPassed: false, results: [] });
      return;
    }
    setBatchRunState("running");
    setBatchSummary("Running...");
    setBatchResults(Array.from({ length: testCases.length }, () => ({ status: "queued" as const })));
    let passedCount = 0;
    const runAllResults: Array<{ input: unknown; expected: unknown; actual: unknown; passed: boolean }> = [];

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const inputVal = parseLooseValue(tc.input ?? tc.metadata?.input ?? "");
      const expected = tc.output ?? tc.expected ?? tc.metadata?.expected ?? "";

      setBatchResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "running" } : r)));
      const result = await executeFunction(inputVal);

      if (!result.success) {
        const actual = result.error || "Execution failed.";
        runAllResults.push({ input: inputVal, expected, actual, passed: false });
        setBatchResults((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  status: "failed",
                  summary: actual,
                  input: inputVal,
                  expected,
                  actual,
                }
              : item
          )
        );
        setBatchSummary("Running...");
        continue;
      }

      const actualOutput = (result.output ?? "").trim();
      const passed = outputsMatch(expected, actualOutput);
      if (passed) passedCount += 1;
      runAllResults.push({ input: inputVal, expected, actual: actualOutput, passed });
      setBatchResults((prev) =>
        prev.map((item, idx) =>
          idx === i
            ? {
                status: passed ? "passed" : "failed",
                summary: passed ? "Passed" : "Failed",
                input: inputVal,
                expected,
                actual: actualOutput,
              }
            : item
        )
      );
      setBatchSummary(`Running... ${passedCount}/${testCases.length} passed`);
    }

    const allPassed = passedCount === testCases.length;
    setBatchRunState(allPassed ? "done" : "error");
    setBatchSummary(
      allPassed ? `All ${testCases.length} Test Cases passed.` : `${passedCount}/${testCases.length} Test Cases passed.`
    );
    onAllTestsPassedChange?.(allPassed);
    onAfterRunTests?.({ runType: "run_all", total: testCases.length, passed: passedCount, allPassed, results: runAllResults });
  };

  const runButtonLabel = runState === "running" ? "Running..." : "Run";
  const batchRunning = batchRunState === "running";
  const totalBatchCases = Array.isArray(testCases) ? testCases.length : 0;

  useEffect(() => {
    const container = splitContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      if (rect.height <= 0) return;
      const maxTopPx = Math.max(MIN_TOP_PX, rect.height - MIN_BOTTOM_PX - 1);
      if (!hasSetInitialSplitRef.current) {
        const third = Math.round(rect.height * (1 / 3));
        setTopPanelHeightPx(Math.min(Math.max(third, MIN_TOP_PX), maxTopPx));
        hasSetInitialSplitRef.current = true;
      } else {
        setTopPanelHeightPx((prev) => Math.min(Math.max(prev, MIN_TOP_PX), maxTopPx));
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!isResizingPanels) return;
    const updateSplitFromClientY = (clientY: number) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.height <= 0) return;
      const maxTopPx = Math.max(MIN_TOP_PX, rect.height - MIN_BOTTOM_PX - 1);
      const nextTopPx = Math.min(Math.max(clientY - rect.top, MIN_TOP_PX), maxTopPx);
      setTopPanelHeightPx(nextTopPx);
    };
    const handlePointerMove = (e: PointerEvent) => updateSplitFromClientY(e.clientY);
    const handlePointerUp = () => {
      setIsResizingPanels(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingPanels]);

  return {
    // Top panel (custom run)
    runState,
    output,
    inputValues,
    setInputValues,
    selectedSignature,
    runButtonLabel,
    handleRun,
    batchRunning,
    // Split layout
    topPanelHeightPx,
    splitContainerRef,
    isResizingPanels,
    setIsResizingPanels,
    // Batch run
    testCases,
    batchRunState,
    batchSummary,
    batchResults,
    totalBatchCases,
    handleRunAllTestCases,
    expandedBatchRows,
    setExpandedBatchRows,
    formatBatchValue,
  };
}
