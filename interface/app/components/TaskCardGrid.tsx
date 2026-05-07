"use client";
import React from 'react';
import { Play, CheckCircle, Circle, RotateCw, Lightbulb, FlaskConical, Lock, Clock3, List } from 'lucide-react';

interface Task {
  id: string;
  name: string;
  title: string;
  label?: string;
  category?: string;
  description: string;
  difficulty?: string;
  appType?: string;
  estimatedTime?: string;
  tags?: string[];
  status?: string;
  saved?: boolean;
}

interface TaskCardGridProps {
  tasks: Task[];
  onGetStarted: (taskId: string) => void;
  lockedTaskIds?: Set<string>;
  activeTaskId?: string | null;
  isLockingEnabled?: boolean;
  isPlaygroundNotCompleted?: boolean;
  showTaskTypeIcons?: boolean;
  showLockedTooltip?: boolean;
  requiredTaskNames?: Set<string>;
  requiredTaskNamesForTime?: Set<string>;
  timedTaskNames?: Set<string>;
  timedTaskLimitMinutesByName?: Record<string, number>;
  tutorialTaskNames?: Set<string>;
  noEditLockedTaskIds?: Set<string>;
  /** When set with onViewSubmissions, staff users get a second task action to open the gallery without doing the task. */
  isInternalReviewer?: boolean;
  onViewSubmissions?: (taskId: string) => void;
  /** Per task.id: distinct submitter count for gallery; null = loading (shows … in label). */
  submissionGalleryCounts?: Record<string, number | null>;
}

// Get status icon component
const getStatusIcon = (
  status: string,
  isLocked: boolean = false,
  isNoEditLock: boolean = false,
  isPlaygroundNotCompleted: boolean = false,
  showLockedTooltip: boolean = true
) => {
  if (isLocked) {
    if (!showLockedTooltip) {
      return <Lock className="h-4 w-4 text-gray-500" />;
    }

    const tooltipText = isNoEditLock
      ? "Edits to this project are not allowed"
      : isPlaygroundNotCompleted
      ? "Locked: Complete the tutorial first"
      : "Locked: Complete previous tasks first";
    
    return (
      <div className="relative" style={{ zIndex: 200000 }}>
        <Lock className="peer h-4 w-4 text-gray-500 transition-colors cursor-help" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-lg" style={{ zIndex: 200001 }}>
          {tooltipText}
        </div>
      </div>
    );
  }
  
  switch (status) {
    case "completed":
      return (
        <div className="relative" style={{ zIndex: 100 }}>
          <CheckCircle className="peer h-4 w-4 text-green-500 transition-colors cursor-help hover:text-green-400" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-lg" style={{ zIndex: 1000 }}>
            Completed
          </div>
        </div>
      );
    case "in-progress":
      return (
        <div className="relative" style={{ zIndex: 100 }}>
          <div className="peer h-4 w-4 relative transition-transform cursor-help hover:scale-110">
            <Circle className="h-4 w-4 text-yellow-500" strokeWidth={1.5} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-1.5 w-1.5 bg-yellow-500 rounded-full"></div>
            </div>
          </div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-lg" style={{ zIndex: 1000 }}>
            In Progress
          </div>
        </div>
      );
    case "not-started":
    default:
      return (
        <div className="relative" style={{ zIndex: 100 }}>
          <Circle className="peer h-4 w-4 text-gray-500 transition-colors cursor-help hover:text-gray-400" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-lg" style={{ zIndex: 1000 }}>
            Not Started
          </div>
        </div>
      );
  }
};

// Extract first paragraph from HTML description
const getFirstParagraph = (html: string): string => {
  if (typeof window === 'undefined') {
    // Server-side: simple regex approach to get first <p> tag content
    const match = html.match(/<p[^>]*>(.*?)<\/p>/i);
    if (match && match[1]) {
      return match[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }
    // Fallback: strip all HTML
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
  // Client-side: use DOM parser for better accuracy
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const firstP = tmp.querySelector('p');
  if (firstP) {
    return firstP.textContent || firstP.innerText || '';
  }
  return tmp.textContent || tmp.innerText || '';
};

const TaskCardGrid: React.FC<TaskCardGridProps> = ({
  tasks,
  onGetStarted,
  lockedTaskIds = new Set(),
  activeTaskId = null,
  isLockingEnabled = false,
  isPlaygroundNotCompleted = false,
  showTaskTypeIcons = true,
  showLockedTooltip = true,
  requiredTaskNames = new Set(),
  requiredTaskNamesForTime = new Set(),
  timedTaskNames = new Set(),
  timedTaskLimitMinutesByName = {},
  tutorialTaskNames = new Set(),
  noEditLockedTaskIds = new Set(),
  isInternalReviewer = false,
  onViewSubmissions,
  submissionGalleryCounts,
}) => {
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 py-4">
        {tasks.map((task) => {
          // Use playground.png for playground task, otherwise use task name
          const imagePath = task.id === 'playground' 
            ? `/task_images/playground.png` 
            : `/task_images/${task.name}.png`;
          const descriptionText = getFirstParagraph(task.description || '');
          const label = task.label || '';
          const isPlayground = task.id === 'playground';
          const isPlaygroundNotStarted = isPlayground && task.status !== 'completed' && task.status !== 'in-progress';
          const isLocked = isLockingEnabled && !isPlayground && lockedTaskIds.has(task.id);
          const isNoEditLock = isLockingEnabled && !isPlayground && noEditLockedTaskIds.has(task.id);
          const isActive = isLockingEnabled && !isPlayground && task.id === activeTaskId && !isLocked;
          const isDisabled = isLocked;
          const isRequiredTask = !isPlayground && requiredTaskNames.has(task.name);
          const isRequiredTaskForTime = !isPlayground && requiredTaskNamesForTime.has(task.name);
          const isTimedTask = !isPlayground && timedTaskNames.has(task.name);
          const isTutorialTask =
            isPlayground ||
            task.category === 'tutorial' ||
            tutorialTaskNames.has(task.name) ||
            /warm[_-]?up/i.test(task.name || '');
          const timedTaskLimitMinutes = timedTaskLimitMinutesByName[task.name];
          const taskTimeMinutes = isTutorialTask
            ? 5
            : isTimedTask && timedTaskLimitMinutes
            ? timedTaskLimitMinutes
            : null;
          const shouldShowTaskTime =
            !isLocked &&
            task.status !== 'completed' &&
            taskTimeMinutes !== null &&
            (isRequiredTaskForTime || isTutorialTask);
          const displayTitle = isRequiredTask && !task.title.endsWith(" (Required)")
            ? `${task.title} (Required)`
            : task.title;
          
          // Determine border and glow styles
          let borderColor = 'rgba(107, 114, 128, 0.5)';
          let boxShadow = '0 10px 25px rgba(15, 23, 42, 0.4)';
          
          if (isPlaygroundNotStarted) {
            borderColor = 'rgba(34, 197, 94, 0.6)';
            boxShadow = '0 10px 25px rgba(15, 23, 42, 0.4), 0 0 20px rgba(34, 197, 94, 0.3)';
          } else if (isActive) {
            // Active task: blue border and blue glow, always visible
            borderColor = 'rgba(59, 130, 246, 0.6)';
            boxShadow = '0 10px 25px rgba(15, 23, 42, 0.4), 0 0 20px rgba(59, 130, 246, 0.3)';
          }
          
          return (
            <div
              key={task.id}
              className={`group relative z-0 hover:z-[300000] rounded-none transition-all duration-150 ${isDisabled ? '' : 'hover:-translate-y-1 cursor-pointer'}`}
              style={{ 
                border: `1px solid ${borderColor}`,
                background: isDisabled ? 'rgba(17, 24, 39, 0.5)' : 'rgba(17, 24, 39, 0.85)',
                boxShadow: boxShadow,
                overflow: 'visible',
                opacity: isDisabled ? 0.5 : 1,
                filter: isDisabled ? 'grayscale(0.3)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (isDisabled) return;
                if (isPlaygroundNotStarted) {
                  e.currentTarget.style.border = '1px solid rgba(34, 197, 94, 0.8)';
                  e.currentTarget.style.boxShadow = '0 16px 35px rgba(34, 197, 94, 0.4), 0 0 25px rgba(34, 197, 94, 0.4)';
                } else if (isActive) {
                  // Active task: enhance glow on hover but keep border
                  e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.8)';
                  e.currentTarget.style.boxShadow = '0 16px 35px rgba(59, 130, 246, 0.4), 0 0 25px rgba(59, 130, 246, 0.4)';
                } else {
                  e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.6)';
                  e.currentTarget.style.boxShadow = '0 16px 35px rgba(59, 130, 246, 0.25)';
                }
              }}
              onMouseLeave={(e) => {
                if (isDisabled) return;
                if (isPlaygroundNotStarted) {
                  e.currentTarget.style.border = '1px solid rgba(34, 197, 94, 0.6)';
                  e.currentTarget.style.boxShadow = '0 10px 25px rgba(15, 23, 42, 0.4), 0 0 20px rgba(34, 197, 94, 0.3)';
                } else if (isActive) {
                  // Active task: return to persistent blue border and glow
                  e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.6)';
                  e.currentTarget.style.boxShadow = '0 10px 25px rgba(15, 23, 42, 0.4), 0 0 20px rgba(59, 130, 246, 0.3)';
                } else {
                  e.currentTarget.style.border = '1px solid rgba(107, 114, 128, 0.5)';
                  e.currentTarget.style.boxShadow = '0 10px 25px rgba(15, 23, 42, 0.4)';
                }
              }}
              onClick={() => {
                if (!isDisabled) {
                  onGetStarted(task.id);
                }
              }}
            >
              {/* Card Header with Title */}
              <div className="px-3 py-2.5 relative">
                {/* Label and Status Indicators - Top Right, center-aligned with title */}
                <div className="absolute top-2.5 right-3 flex items-center gap-2" style={{ zIndex: 100 }}>
                  {/* Label Icon */}
                  {isPlayground ? (
                    <div className="relative flex items-center">
                      <FlaskConical className="peer h-3.5 w-3.5 text-green-400 transition-colors cursor-help hover:text-green-300" strokeWidth={2} />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-lg" style={{ zIndex: 1000 }}>
                        Tutorial Task
                      </div>
                    </div>
                  ) : showTaskTypeIcons && label && (
                    <div className="relative flex items-center">
                      {label === 'replication' ? (
                        <>
                          <RotateCw className="peer h-3.5 w-3.5 text-yellow-400 transition-colors cursor-help hover:text-yellow-300" strokeWidth={2} />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-lg" style={{ zIndex: 1000 }}>
                            Replication Task
                          </div>
                        </>
                      ) : (
                        <>
                          <Lightbulb className="peer h-3.5 w-3.5 text-blue-400 transition-colors cursor-help hover:text-blue-300" strokeWidth={2} />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-lg" style={{ zIndex: 1000 }}>
                            Open-Ended Task
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {/* Status Indicator */}
                  {getStatusIcon(task.status || 'not-started', isLocked, isNoEditLock, isPlaygroundNotCompleted, showLockedTooltip)}
                </div>
                <h3 className={`text-sm font-semibold line-clamp-2 transition-colors duration-150 pr-12 ${isDisabled ? 'text-gray-500' : isPlayground ? 'text-white group-hover:text-white' : 'text-white group-hover:text-blue-400'}`} style={{ lineHeight: '1.35' }}>
                  {displayTitle}
                </h3>
                {shouldShowTaskTime && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                    <Clock3 className="h-3 w-3" />
                    <span>
                      {isTimedTask ? `${taskTimeMinutes} min limit` : `${taskTimeMinutes} min`}
                    </span>
                  </div>
                )}
              </div>

              {/* Image Container with Hover Overlay */}
              <div className="relative w-full overflow-hidden" style={{ background: '#111827', aspectRatio: '1 / 1' }}>
                <img
                  src={imagePath}
                  alt={task.title}
                  className={`w-full h-full object-cover transition-transform duration-300 ${isDisabled ? '' : 'group-hover:scale-105'}`}
                  style={{ opacity: isDisabled ? 0.5 : 1 }}
                  onError={(e) => {
                    // Fallback to a placeholder if image doesn't exist
                    (e.target as HTMLImageElement).src = '/toast.png';
                  }}
                />
                
                {/* Description Overlay on Hover - covers just the image */}
                {descriptionText && !isDisabled && (
                  <div 
                    className="absolute inset-0 text-gray-200 text-sm p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 overflow-y-auto overflow-x-hidden"
                    style={{ background: 'rgba(0, 0, 0, 0.90)' }}
                  >
                    <p className="text-center whitespace-pre-wrap break-words">
                      {descriptionText}
                    </p>
                  </div>
                )}
              </div>

              {/* Card Footer with Get Started Button */}
              <div className="px-3 py-2.5" style={{ background: 'rgba(15, 23, 42, 0.75)' }}>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isDisabled) {
                        onGetStarted(task.id);
                      }
                    }}
                    disabled={isDisabled}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-md transition-all duration-200 ${isDisabled ? 'bg-gray-600 cursor-not-allowed opacity-50' : isPlayground ? 'bg-green-600 hover:bg-green-700 hover:scale-105' : 'bg-blue-600 hover:bg-blue-700 hover:scale-105'}`}
                  >
                    <Play className="h-3 w-3" />
                    <span>
                      {isPlayground
                        ? 'Open Tutorial'
                        : task.status === 'completed' 
                        ? 'Edit Submission' 
                        : task.status === 'in-progress' 
                        ? 'Continue Vibing' 
                        : 'Get Started'}
                    </span>
                  </button>
                  {isInternalReviewer && onViewSubmissions && !isPlayground && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewSubmissions(task.id);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-gray-100 text-xs font-medium rounded-md transition-all duration-200 border border-slate-500/70 bg-slate-800/90 hover:bg-slate-700 hover:border-slate-400"
                      title={
                        typeof submissionGalleryCounts?.[task.id] === 'number'
                          ? `${submissionGalleryCounts[task.id]} distinct submitters in gallery`
                          : undefined
                      }
                    >
                      <List className="h-3 w-3" />
                      <span>
                        View Submissions
                        {submissionGalleryCounts &&
                          task.id in submissionGalleryCounts &&
                          (submissionGalleryCounts[task.id] === null ? (
                            <span className="text-slate-400"> (…)</span>
                          ) : (
                            <span>{` (${submissionGalleryCounts[task.id]})`}</span>
                          ))}
                      </span>
                    </button>
                  )}
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TaskCardGrid;

