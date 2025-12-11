"use client";
import React, { useState } from 'react';
import { 
  CheckCircle, 
  Circle, 
  Star,
  ChevronDown,
  ChevronUp,
  Play,
  Clock,
  Tag,
  ArrowLeft
} from 'lucide-react';
import TaskInstructionNew from './TaskInstructionNew';

interface Task {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  appType: string;
  estimatedTime: string;
  tags: string[];
  preview: string;
  status: string;
  saved: boolean;
  videoDemo?: string;
  requirements?: string[];
}

interface MinimalTaskListProps {
  tasks: Task[];
  onSaveToggle: (taskId: string, e: React.MouseEvent) => void;
  onGetStarted: (taskId: string) => void;
  expandedTask: string | null;
  onTaskExpand: (taskId: string) => void;
  onGoBack?: () => void;
  hasStartedTask?: boolean;
  disableHover?: boolean;
}

const MinimalTaskList: React.FC<MinimalTaskListProps> = ({ 
  tasks, 
  onSaveToggle, 
  onGetStarted,
  expandedTask,
  onTaskExpand,
  onGoBack,
  hasStartedTask = false,
  disableHover = false
}) => {

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <div className="relative">
            <CheckCircle className={`peer h-5 w-5 text-green-500 transition-colors cursor-help ${!disableHover ? 'hover:text-green-400' : ''}`} />
            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300 ${!disableHover ? 'peer-hover:opacity-100' : ''}`}>
              Completed
            </div>
          </div>
        );
      case "in-progress":
        return (
          <div className="relative">
            <div className={`peer h-5 w-5 relative transition-transform cursor-help ${!disableHover ? 'hover:scale-110' : ''}`}>
              <Circle className="h-5 w-5 text-yellow-500" strokeWidth={1.5} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse"></div>
              </div>
            </div>
            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300 ${!disableHover ? 'peer-hover:opacity-100' : ''}`}>
              In Progress
            </div>
          </div>
        );
      default:
        return (
          <div className="relative">
            <Circle className={`peer h-5 w-5 text-gray-500 transition-colors cursor-help ${!disableHover ? 'hover:text-gray-400' : ''}`} />
            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300 ${!disableHover ? 'peer-hover:opacity-100' : ''}`}>
              Not Started
            </div>
          </div>
        );
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "text-green-400";
      case "Intermediate":
        return "text-yellow-400";
      case "Advanced":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getSaveIcon = (saved: boolean) => {
    return (
      <div className="relative">
        {saved ? (
          <Star className={`peer h-4 w-4 text-yellow-400 fill-current transition-colors cursor-help ${!disableHover ? 'hover:text-yellow-300' : ''}`} />
        ) : (
          <Star className={`peer h-4 w-4 text-gray-500 transition-colors cursor-help ${!disableHover ? 'hover:text-gray-400' : ''}`} />
        )}
        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300 ${!disableHover ? 'peer-hover:opacity-100' : ''}`}>
          {saved ? "Remove from saved" : "Save task"}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2 w-full min-w-0">
      {tasks.map((task) => {
        const isExpanded = hasStartedTask ? true : expandedTask === task.id;
        
        return (
          <div key={task.id} className={`bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50 transition-all duration-300 w-full min-w-0 ${!disableHover ? 'hover:border-gray-600/50' : ''}`}>
            {/* Header - Fixed when expanded */}
            <div 
              className={`py-2 px-2 cursor-pointer group transition-all mt-0 duration-300 ${
                isExpanded ? 'sticky top-0 z-10 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700/50 rounded-t-lg' : ''
              } ${!disableHover ? 'hover:bg-gray-700/30' : ''}`}
              onClick={() => { if (!hasStartedTask) onTaskExpand(task.id); }}
            >
              <div className="flex items-center space-x-3 min-w-0">
                {/* Status Icon - always show */}
                <div className="flex-shrink-0">
                  {getStatusIcon(task.status)}
                </div>

                {/* Task Name */}
                <div className="flex-1 min-w-0 overflow-hidden rounded">
                  <h3 className={`text-base font-medium text-white truncate ${hasStartedTask ? '' : 'transition-colors duration-300'} ${!disableHover ? 'group-hover:text-blue-400' : ''}`}>
                    {task.name}
                  </h3>
                </div>

                {/* Action Buttons - only show when expanded and not started */}
                {isExpanded && !hasStartedTask && (
                  <div className="flex-shrink-0 flex items-center space-x-1.5">
                    {/* Go Back Button */}
                    {onGoBack && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onGoBack(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`px-2.5 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-md transition-all duration-300 flex items-center space-x-1.5 ${!disableHover ? 'hover:bg-gray-700 hover:scale-105' : ''}`}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Go Back</span>
                      </button>
                    )}
                    
                    {/* Get Started Button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onGetStarted(task.id); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`px-2.5 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md transition-all duration-300 flex items-center space-x-1.5 ${!disableHover ? 'hover:bg-blue-700 hover:scale-105' : ''}`}
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Get Started</span>
                    </button>
                  </div>
                )}

                {/* Difficulty - only show when not expanded */}
                {!isExpanded && (
                  <div className="flex-shrink-0">
                    <span className={`text-sm font-medium ${getDifficultyColor(task.difficulty)}`}>
                      {task.difficulty === "Beginner" ? "Easy" : task.difficulty === "Intermediate" ? "Med" : "Hard"}
                    </span>
                  </div>
                )}

                {/* Save Button - only show when not expanded */}
                {!isExpanded && (
                  <div className="flex-shrink-0">
                    <button
                      onClick={(e) => onSaveToggle(task.id, e)}
                      className={`p-1 rounded transition-all duration-300 ${!disableHover ? 'hover:bg-gray-700/50' : ''}`}
                    >
                      {getSaveIcon(task.saved)}
                    </button>
                  </div>
                )}

                {/* Expand Button - only show when not expanded; move to far right */}
                {!isExpanded && (
                  <div className="flex-shrink-0">
                    <div className={`p-1 rounded transition-all duration-300 ${!disableHover ? 'hover:bg-gray-700/50' : ''}`}>
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable Body Content */}
            <div className={`transition-all duration-500 ease-in-out scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500 ${
              isExpanded ? 'max-h-[400px] opacity-100 overflow-y-auto' : 'max-h-0 opacity-0 overflow-hidden'
            }`}>
              <div className="px-3 pb-3 border-t border-gray-700/50 bg-gray-800/30 w-full min-w-0">
                <div className="pt-3">
                  {/* Task Instructions (HTML-aware, compact) */}
                  <TaskInstructionNew
                    taskDescription={task.description}
                    showHeader={false}
                    compact={true}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MinimalTaskList;
