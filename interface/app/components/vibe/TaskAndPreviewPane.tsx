"use client";

import React, { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import TaskInstruction from "../tasks/TaskInstruction";
import PreviewTab, { PreviewTabRef } from "../preview/PreviewTab";
import ProjectDetailsTab from "./ProjectDetailsTab";
import TestCasesPanel from "../tasks/TestCasesPanel";
import LoadingSpinner from "../ui/LoadingSpinner";

export type LeftTabId = "task" | "preview" | "submissions" | "project-details";
export type RightTabId = "code" | "submissions";

function tooltipPositionFromEvent(e: React.MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const margin = 8;
  const left = Math.min(Math.max(rect.left + rect.width / 2, margin), vw - margin);
  const placeAbove = rect.top >= 40 || rect.top > vh - rect.bottom;
  const top = placeAbove ? rect.top : rect.bottom;
  return { left, top, placeAbove };
}

export interface TaskAndPreviewPaneProps {
  leftTab: LeftTabId;
  setLeftTab: (tab: LeftTabId) => void;
  rightTab: RightTabId;
  isSwapped: boolean;
  onGoBack: () => void;
  onSwap: () => void;
  isMac: boolean;
  /** Task tab: fallback description from page (non-tutorial); when isTutorialMode, left pane loads instructions itself */
  taskDescription: string;
  taskId: string;
  isTutorialMode: boolean;
  taskName: string | undefined;
  taskLabel?: string;
  taskExample?: unknown;
  taskTestCases?: Array<Record<string, any>>;
  entryPoint?: string | null;
  initialFiles?: any[] | null;
  /** Preview tab */
  currentFiles: any[];
  previewTabRef: React.RefObject<PreviewTabRef | null>;
  actualEditorRef: React.RefObject<any>;
  onPreviewRefresh: (source: string) => void;
  previewTaskName: string;
  /** Project details tab (when viewing a submission) */
  viewedSubmission: { title: string; description: string | null } | null;
  /** When true, show loading state in Test Cases tab (function tasks) */
  isLoadingFiles?: boolean;
  /** For function tasks: called when test results change. allPassed is true when all test cases have passed. */
  onFunctionTaskTestResultsChange?: (allPassed: boolean) => void;
}

const tabButtonClass =
  "text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 after:content-[\"\"] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400";
const tabActiveClass = "text-blue-400 after:opacity-100";
const tabInactiveClass =
  "text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200";

export default function TaskAndPreviewPane({
  leftTab,
  setLeftTab,
  rightTab,
  isSwapped,
  onGoBack,
  onSwap,
  isMac,
  taskDescription,
  taskId,
  isTutorialMode,
  taskName,
  taskLabel,
  taskExample,
  taskTestCases,
  entryPoint,
  initialFiles,
  currentFiles,
  previewTabRef,
  actualEditorRef,
  onPreviewRefresh,
  previewTaskName,
  viewedSubmission,
  isLoadingFiles = false,
  onFunctionTaskTestResultsChange,
}: TaskAndPreviewPaneProps) {
  const isFunctionTask = taskLabel === "write_function" || taskLabel === "debug_function" || taskLabel === "function_tutorial";
  const [tooltip, setTooltip] = useState({ visible: false, text: "", left: 0, top: 0, placeAbove: true });
  /** Instruction content from parent (same as normal tasks; tutorial uses task description from API). */
  const [instructionContent, setInstructionContent] = useState(taskDescription);

  useEffect(() => {
    setInstructionContent(taskDescription);
  }, [taskDescription]);

  const showTooltip = useCallback((e: React.MouseEvent, text: string) => {
    const { left, top, placeAbove } = tooltipPositionFromEvent(e);
    setTooltip({ visible: true, text, left, top, placeAbove });
  }, []);
  const hideTooltip = useCallback(() => setTooltip((t) => ({ ...t, visible: false })), []);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Tab bar */}
      <div className="mt-0 px-0 py-1 bg-transparent">
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex items-center space-x-6 overflow-x-auto whitespace-nowrap min-w-0"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <button
              className={`${tabButtonClass} ${leftTab === "task" ? tabActiveClass : tabInactiveClass}`}
              onClick={() => setLeftTab("task")}
            >
              Task
              <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                {isMac ? "⌘+[" : "Ctrl+["}
              </span>
            </button>
            {rightTab !== "submissions" && (
              <button
                className={`${tabButtonClass} ${leftTab === "preview" ? tabActiveClass : tabInactiveClass}`}
                onClick={() => setLeftTab("preview")}
              >
                {isFunctionTask ? "Test Cases" : "My Preview"}
                <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                  {isMac ? "⌘+]" : "Ctrl+]"}
                </span>
              </button>
            )}
            {rightTab === "submissions" && viewedSubmission && (
              <button
                className={`${tabButtonClass} ${leftTab === "project-details" ? tabActiveClass : tabInactiveClass}`}
                onClick={() => setLeftTab("project-details")}
              >
                Project Details
                <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                  {isMac ? "⌘+]" : "Ctrl+]"}
                </span>
              </button>
            )}
          </div>
          <div
            className={`flex items-center ${isSwapped ? "flex-row-reverse space-x-reverse" : ""} space-x-2 ml-auto`}
          >
            <button
              onClick={onGoBack}
              className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-700/50 hover:bg-gray-600/50 transition-colors text-gray-300 hover:text-white"
              onMouseEnter={(e) => showTooltip(e, "Back to tasks")}
              onMouseLeave={hideTooltip}
              onMouseMove={(e) => showTooltip(e, "Back to tasks")}
            >
              <ArrowLeft size={14} />
            </button>
            <button
              onClick={onSwap}
              className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-700/50 hover:bg-gray-600/50 transition-colors text-gray-300 hover:text-white"
              onMouseEnter={(e) => showTooltip(e, "Swap panes")}
              onMouseLeave={hideTooltip}
              onMouseMove={(e) => showTooltip(e, "Swap panes")}
            >
              <ArrowLeftRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {rightTab === "submissions" && leftTab === "project-details" && viewedSubmission && (
          <ProjectDetailsTab
            title={viewedSubmission.title}
            description={viewedSubmission.description}
          />
        )}
        {leftTab === "task" && (
          <TaskInstruction
            taskDescription={instructionContent}
            taskName={taskName}
            taskLabel={taskLabel}
            example={taskExample as string | undefined}
            showHeader={false}
          />
        )}
        {leftTab === "preview" && (
          <div className="h-full">
            {isFunctionTask ? (
              isLoadingFiles ? (
                <div className="h-full flex items-center justify-center bg-gray-800/50 rounded border border-gray-700/50">
                  <div className="flex flex-col items-center gap-3">
                    <LoadingSpinner size="lg" color="blue" />
                    <p className="text-gray-400">Loading test cases...</p>
                  </div>
                </div>
              ) : (
                <TestCasesPanel
                  currentFiles={currentFiles}
                  actualEditorRef={actualEditorRef}
                  testCases={taskTestCases}
                  entryPoint={entryPoint}
                  initialFiles={initialFiles}
                  onAllTestsPassedChange={onFunctionTaskTestResultsChange}
                />
              )
            ) : (
              <PreviewTab
                ref={previewTabRef as React.Ref<PreviewTabRef>}
                files={currentFiles}
                className="h-full"
                taskName={previewTaskName}
                actualEditorRef={actualEditorRef}
                onRefresh={onPreviewRefresh}
              />
            )}
          </div>
        )}
      </div>
      {tooltip.visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: tooltip.left,
              top: tooltip.top,
              transform: tooltip.placeAbove
                ? "translate(-50%, -100%) translateY(-8px)"
                : "translate(-50%, 8px)",
              backgroundColor: "#ffffff",
              color: "#000000",
              fontSize: "12px",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
              zIndex: 100000,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {tooltip.text}
          </div>,
          document.body
        )}
    </div>
  );
}
