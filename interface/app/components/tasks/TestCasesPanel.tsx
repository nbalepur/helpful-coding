"use client";

import React from "react";
import { Copy } from "lucide-react";
import type { BatchCaseResult } from "@/app/utils/testCasesUtils";
import { useTestCasesPanel, type TestRunLogMetadata } from "@/app/hooks/useTestCasesPanel";

interface TestCasesPanelProps {
  currentFiles: any[];
  actualEditorRef: React.RefObject<any>;
  testCases?: Array<Record<string, any>> | null;
  entryPoint?: string | null;
  initialFiles?: any[] | null;
  /** For function tasks: called when "Run All Test Cases" results change. allPassed is true when all cases passed. */
  onAllTestsPassedChange?: (allPassed: boolean) => void;
  /** Called after a test run finishes (custom input or run all). Use to save/log code with run metadata. */
  onAfterRunTests?: (metadata: TestRunLogMetadata) => void;
}

function BatchResultCard({
  name,
  result,
  isExpanded,
  onToggle,
  onCopyInput,
  formatValue,
}: {
  name: string;
  result: BatchCaseResult;
  isExpanded: boolean;
  onToggle: () => void;
  onCopyInput: () => void;
  formatValue: (v: unknown) => string;
}) {
  const statusClass =
    result.status === "passed"
      ? "border-emerald-600/70"
      : result.status === "failed"
        ? "border-red-600/70"
        : "border-gray-600/70";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      className={`w-full rounded-md border p-2 text-left cursor-pointer ${statusClass} bg-black hover:bg-[#0a0f1a]`}
    >
      <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium truncate text-gray-100">{name}</p>
          <div className="flex items-center shrink-0 gap-1.5">
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onCopyInput(); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onCopyInput(); } }}
              className="p-0.5 cursor-pointer text-gray-400 hover:text-gray-200"
              title="Copy input to custom inputs"
              aria-label="Copy input to custom inputs"
            >
              <Copy className="h-4 w-4" />
            </div>
            {result.status === "running" ? (
              <span className="h-4 w-4 rounded-full border-2 border-gray-500 border-t-blue-400 animate-spin" />
            ) : result.status === "passed" ? (
              <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 10.2l2.6 2.6L14 7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : result.status === "failed" ? (
              <svg className="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <span className="h-4 w-4 rounded-full border border-gray-500" />
            )}
          </div>
        </div>
      {isExpanded && (
        <div className="mt-2">
          {result.actual === undefined ? (
            <p className="text-[11px] text-gray-400">Not run yet</p>
          ) : (
            <div className="grid gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Input</p>
                <pre className="mt-1 text-[11px] whitespace-pre-wrap break-words text-gray-200">{formatValue(result.input)}</pre>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Expected Output</p>
                <pre className="mt-1 text-[11px] whitespace-pre-wrap break-words text-gray-200">{formatValue(result.expected)}</pre>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Your Output</p>
                <pre className="mt-1 text-[11px] whitespace-pre-wrap break-words text-gray-200">{formatValue(result.actual)}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const textareaClass = `${inputClass} resize-y`;

export default function TestCasesPanel({
  currentFiles,
  actualEditorRef,
  testCases,
  entryPoint,
  initialFiles,
  onAllTestsPassedChange,
  onAfterRunTests,
}: TestCasesPanelProps) {
  const {
    runState,
    output,
    inputValues,
    setInputValues,
    selectedSignature,
    runButtonLabel,
    handleRun,
    batchRunning,
    topPanelHeightPx,
    splitContainerRef,
    setIsResizingPanels,
    batchSummary,
    batchResults,
    totalBatchCases,
    handleRunAllTestCases,
    expandedBatchRows,
    setExpandedBatchRows,
    formatBatchValue,
  } = useTestCasesPanel({ currentFiles, actualEditorRef, testCases, entryPoint, initialFiles, onAllTestsPassedChange, onAfterRunTests });

  const args = selectedSignature?.args || ["input"];
  const outputClass =
    runState === "done" ? "text-white" : runState === "error" ? "text-red-400" : "text-gray-100";

  const handleCopyInput = (idx: number) => {
    const tc = testCases?.[idx];
    const rawInput = tc?.input ?? (tc as any)?.metadata?.input;
    const selectedArgs = selectedSignature?.args || [];
    if (selectedArgs.length === 0) return;
    const next: Record<string, string> = {};
    if (selectedArgs.length === 1) {
      const key = selectedArgs[0];
      if (typeof rawInput === "string") next[key] = rawInput;
      else if (rawInput != null) {
        try {
          next[key] = JSON.stringify(rawInput);
        } catch {
          next[key] = String(rawInput);
        }
      } else next[key] = "";
    } else {
      selectedArgs.forEach((arg) => {
        const v = rawInput && typeof rawInput === "object" ? (rawInput as Record<string, unknown>)[arg] : "";
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
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 w-full min-w-0 flex flex-col h-full overflow-hidden">
      <div ref={splitContainerRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Custom inputs + Run + output */}
        <div
          className="shrink-0 flex flex-col gap-2 min-h-0 overflow-hidden px-3 pt-3"
          style={{ height: topPanelHeightPx }}
        >
          <h3 className="text-sm font-semibold text-gray-200">Custom Inputs</h3>
          <div className="space-y-2">
            {args.map((argName) => (
              <div key={argName}>
                <label className="block text-xs text-gray-400 mb-1">{argName}:</label>
                {argName === "input_str" ? (
                  <textarea
                    value={inputValues[argName] ?? ""}
                    onChange={(e) => setInputValues((prev) => ({ ...prev, [argName]: e.target.value }))}
                    placeholder="Enter value"
                    rows={3}
                    className={textareaClass}
                  />
                ) : (
                  <input
                    value={inputValues[argName] ?? ""}
                    onChange={(e) => setInputValues((prev) => ({ ...prev, [argName]: e.target.value }))}
                    placeholder="Enter value"
                    className={inputClass}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={runState === "running" || batchRunning}
            className="w-full rounded-md border border-blue-500 bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {runButtonLabel}
          </button>
          <div className="flex-1 min-h-0 rounded-sm border border-gray-800 bg-black px-2 pt-2 pb-3 mb-3 overflow-auto">
            <pre className={`text-xs whitespace-pre-wrap break-words ${outputClass}`}>
              {output || "Run a custom input to see output here."}
            </pre>
          </div>
        </div>

        <div
          className="shrink-0 h-px w-full bg-gray-700/70 cursor-row-resize hover:bg-gray-500/80 transition-colors"
          role="separator"
          aria-label="Resize test case panes"
          aria-orientation="horizontal"
          onPointerDown={(e) => { e.preventDefault(); setIsResizingPanels(true); }}
        />

        {/* Run all test cases */}
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden bg-gray-900/70 px-3 pt-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-200">Run All Test Cases</h3>
            <button
              type="button"
              onClick={handleRunAllTestCases}
              disabled={batchRunning || runState === "running"}
              className="rounded-md border border-emerald-500 bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {batchRunning ? "Running..." : "Run Tests"}
            </button>
          </div>
          <div className="rounded-md border border-gray-700 bg-gray-900/70 p-2">
            <p className="text-[11px] text-gray-300">
              {batchSummary || `Ready to run ${totalBatchCases} Test Case${totalBatchCases === 1 ? "" : "s"}.`}
            </p>
          </div>
          <div className="flex-1 min-h-[140px] overflow-auto space-y-2 pr-1">
            {batchResults.length === 0 ? (
              <div className="rounded-md border border-gray-800 bg-gray-950 p-2 text-xs text-gray-400">
                No Test Cases found for this task.
              </div>
            ) : (
              batchResults.map((result, idx) => {
                const tc = testCases?.[idx];
                const name = String(tc?.name ?? tc?.title ?? `Test Case ${idx + 1}`);
                return (
                  <BatchResultCard
                    key={`${name}-${idx}`}
                    name={name}
                    result={result}
                    isExpanded={!!expandedBatchRows[idx]}
                    onToggle={() => setExpandedBatchRows((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                    onCopyInput={() => handleCopyInput(idx)}
                    formatValue={formatBatchValue}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
