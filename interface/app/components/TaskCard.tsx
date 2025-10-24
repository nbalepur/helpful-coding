"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle, 
  Circle, 
  Clock, 
  Play, 
  ChevronDown, 
  ChevronUp,
  Bookmark,
  BookmarkCheck
} from 'lucide-react';
import TaskInstructionNew from './TaskInstructionNew';

interface TaskCardProps {
  task: {
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
    videoPreview?: string | null;
    requirements?: string[];
    videoDemo?: string;
  };
  onSaveToggle: (taskId: string, e: React.MouseEvent) => void;
  disableHover?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onSaveToggle, disableHover = false }) => {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTaskClick = () => {
    router.push(`/vibe/${task.id}`);
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <div className="relative">
            <CheckCircle className={`peer h-5 w-5 text-green-500 transition-colors cursor-help ${!disableHover ? 'hover:text-green-400' : ''}`} />
            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700 ${!disableHover ? 'peer-hover:opacity-100' : ''}`}>
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
            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700 ${!disableHover ? 'peer-hover:opacity-100' : ''}`}>
              In Progress
            </div>
          </div>
        );
      default:
        return (
          <div className="relative">
            <Circle className={`peer h-5 w-5 text-gray-500 transition-colors cursor-help ${!disableHover ? 'hover:text-gray-400' : ''}`} />
            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700 ${!disableHover ? 'peer-hover:opacity-100' : ''}`}>
              Not Started
            </div>
          </div>
        );
    }
  };

  const getDifficultyBadgeColors = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "bg-green-900/30 text-green-400 border-green-700/50";
      case "Intermediate":
        return "bg-yellow-900/30 text-yellow-400 border-yellow-700/50";
      case "Advanced":
        return "bg-red-900/30 text-red-400 border-red-700/50";
      default:
        return "bg-gray-900/30 text-gray-400 border-gray-700/50";
    }
  };

  const getSaveIcon = (saved: boolean) => {
    return saved ? (
      <BookmarkCheck className="h-4 w-4 text-blue-400" />
    ) : (
      <Bookmark className={`h-4 w-4 text-gray-400 ${!disableHover ? 'hover:text-blue-400' : ''}`} />
    );
  };

  return (
    <div className={`bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 transition-all duration-300 ease-out ${!disableHover ? 'hover:border-gray-600/50 hover:shadow-lg hover:shadow-black/20' : ''}`}>
      {/* Main Task Row */}
      <div 
        className={`p-4 cursor-pointer group transition-all duration-300 ease-out ${!disableHover ? 'hover:bg-gray-700/30' : ''}`}
        onClick={handleTaskClick}
      >
        <div className="flex items-center space-x-4">
          {/* Status Icon */}
          <div className="flex-shrink-0">
            {getStatusIcon(task.status)}
          </div>

          {/* Task Info */}
          <div className="flex-1 min-w-0">
            <h3 className={`text-lg font-medium text-white transition-colors duration-300 ${!disableHover ? 'group-hover:text-blue-400' : ''}`}>
              {task.name}
            </h3>
            <p className="text-sm text-gray-400 mt-1 line-clamp-2">
              {task.description}
            </p>
          </div>

          {/* Difficulty Badge */}
          <div className="flex-shrink-0">
            <span className={`px-3 py-1 text-xs font-medium rounded-lg border ${getDifficultyBadgeColors(task.difficulty)}`}>
              {task.difficulty === "Beginner" ? "Easy" : task.difficulty === "Intermediate" ? "Med." : "Hard"}
            </span>
          </div>

          {/* Time Estimate */}
          <div className="flex-shrink-0 flex items-center space-x-1 text-gray-400 text-sm">
            <Clock className="h-4 w-4" />
            <span>{task.estimatedTime}</span>
          </div>

          {/* Expand Button */}
          <div className="flex-shrink-0">
            <button
              onClick={handleExpandClick}
              className={`p-2 rounded-lg transition-all duration-300 ease-out ${!disableHover ? 'hover:bg-gray-700/50 group-hover:scale-110' : ''}`}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>

          {/* Save Button */}
          <div className="flex-shrink-0">
            <button
              onClick={(e) => onSaveToggle(task.id, e)}
              className={`p-2 rounded-lg transition-all duration-300 ease-out ${!disableHover ? 'hover:bg-gray-700/50 group-hover:scale-110' : ''}`}
            >
              {getSaveIcon(task.saved)}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-700/50 bg-gray-800/30">
          <div className="pt-4">
            <TaskInstructionNew
              taskDescription={task.description}
              requirements={task.requirements}
              videoDemo={task.videoDemo}
              showHeader={false}
              compact={true}
            />
            
            {/* Get Started Button */}
            <div className="pt-4 border-t border-gray-700/50 mt-4">
              <button
                onClick={handleTaskClick}
                className={`w-full bg-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 ease-out flex items-center justify-center space-x-2 ${!disableHover ? 'hover:bg-blue-700 hover:scale-105' : ''}`}
              >
                <Play className="h-4 w-4" />
                <span>Get Started</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCard;
