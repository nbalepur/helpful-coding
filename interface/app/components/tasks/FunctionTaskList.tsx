"use client";

import React from "react";
import {
  CheckCircle,
  Circle,
  Lock,
  FlaskConical,
  Pencil,
  Bug,
  Play,
} from "lucide-react";
import { isTutorialTask } from "../../utils/tutorial";
import {
  DEBUG_FUNCTION_LABEL,
  FUNCTION_TUTORIAL_LABEL,
  WRITE_FUNCTION_LABEL,
} from "../../utils/taskLabels";

export interface FunctionTask {
  id: string;
  name: string;
  title?: string;
  label?: string;
  description?: string;
  status?: string;
}

interface FunctionTaskListProps {
  tasks: FunctionTask[];
  onGetStarted: (taskId: string) => void;
  lockedTaskIds?: Set<string>;
  activeTaskId?: string | null;
  isLockingEnabled?: boolean;
  isTutorialNotCompleted?: boolean;
}

const tooltipClass =
  "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none border border-gray-300 z-[1000]";

function getStatusIcon(
  status: string,
  isLocked: boolean,
  isTutorialNotCompleted: boolean
) {
  if (isLocked) {
    const tooltipText = isTutorialNotCompleted
      ? "Complete the tutorial first"
      : "Locked";
    return (
      <div className="relative flex items-center shrink-0">
        <Lock className="peer h-4 w-4 text-gray-500 cursor-help" />
        <div className={tooltipClass}>{tooltipText}</div>
      </div>
    );
  }
  switch (status) {
    case "completed":
      return (
        <div className="relative flex items-center shrink-0">
          <CheckCircle className="peer h-4 w-4 text-green-500 cursor-help hover:text-green-400" />
          <div className={tooltipClass}>Completed</div>
        </div>
      );
    case "in-progress":
      return (
        <div className="relative flex items-center shrink-0">
          <span className="peer relative inline-flex h-4 w-4 items-center justify-center cursor-help">
            <Circle className="h-4 w-4 text-yellow-500 shrink-0" strokeWidth={1.5} />
            <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-yellow-500" />
          </span>
          <div className={tooltipClass}>In progress</div>
        </div>
      );
    default:
      return (
        <div className="relative flex items-center shrink-0">
          <Circle className="peer h-4 w-4 text-gray-500 cursor-help hover:text-gray-400" />
          <div className={tooltipClass}>Not started</div>
        </div>
      );
  }
}

function getLabelIcon(label: string | undefined) {
  if (!label) return null;
  if (label === FUNCTION_TUTORIAL_LABEL) {
    return (
      <div className="relative flex items-center shrink-0">
        <FlaskConical className="peer h-4 w-4 text-green-400 cursor-help hover:text-green-300" strokeWidth={2} />
        <div className={tooltipClass}>Tutorial</div>
      </div>
    );
  }
  if (label === WRITE_FUNCTION_LABEL) {
    return (
      <div className="relative flex items-center shrink-0">
        <Pencil className="peer h-4 w-4 text-blue-400 cursor-help hover:text-blue-300" />
        <div className={tooltipClass}>Write function</div>
      </div>
    );
  }
  if (label === DEBUG_FUNCTION_LABEL) {
    return (
      <div className="relative flex items-center shrink-0">
        <Bug className="peer h-4 w-4 text-yellow-400 cursor-help hover:text-yellow-300" />
        <div className={tooltipClass}>Debug function</div>
      </div>
    );
  }
  return null;
}

export default function FunctionTaskList({
  tasks,
  onGetStarted,
  lockedTaskIds = new Set(),
  activeTaskId = null,
  isLockingEnabled = false,
  isTutorialNotCompleted = false,
}: FunctionTaskListProps) {
  return (
    <div className="w-full flex flex-col gap-1 py-4">
      {tasks.map((task) => {
        const isTutorial = isTutorialTask(task);
        const isLocked = isLockingEnabled && !isTutorial && lockedTaskIds.has(task.id);
        const isDisabled = isLocked;
        const title = task.title ?? task.name;

        return (
          <button
            key={task.id}
            type="button"
            onClick={() => !isDisabled && onGetStarted(task.id)}
            disabled={isDisabled}
            className={`
              w-full flex items-center justify-between gap-4 px-4 py-3
              text-left rounded border transition-colors duration-150
              ${isDisabled
                ? "border-gray-700/50 bg-gray-800/40 cursor-not-allowed opacity-60"
                : "border-gray-700 bg-gray-800/60 hover:border-gray-600 hover:bg-gray-800 text-white cursor-pointer"
              }
            `}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {getLabelIcon(task.label)}
              {getStatusIcon(
                task.status ?? "not-started",
                isLocked,
                isTutorialNotCompleted
              )}
              <span className={`text-sm font-medium truncate ${isDisabled ? "text-gray-500" : ""}`}>
                {title}
              </span>
            </div>
            {!isDisabled && (
              <div className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGetStarted(task.id);
                  }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-md transition-all duration-200 shrink-0 ${isTutorial ? "bg-green-600 hover:bg-green-700 hover:scale-105" : "bg-blue-600 hover:bg-blue-700 hover:scale-105"}`}
                >
                  <Play className="h-3 w-3" />
                  <span>
                    {isTutorial
                      ? "Open Tutorial"
                      : task.status === "completed"
                        ? "Edit Submission"
                        : task.status === "in-progress"
                          ? "Continue Vibing"
                          : "Get Started"}
                  </span>
                </button>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
