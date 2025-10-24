import React from 'react';

interface AIThinkingProps {
  className?: string;
}

const AIThinking: React.FC<AIThinkingProps> = ({ className = "" }) => {
  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <span className="text-xs text-gray-500 opacity-80">AI Thinking</span>
      <div className="flex space-x-0.5">
        <div className="w-0.5 h-0.5 bg-gray-500 rounded-full animate-thinking-1 opacity-60"></div>
        <div className="w-0.5 h-0.5 bg-gray-500 rounded-full animate-thinking-2 opacity-60"></div>
        <div className="w-0.5 h-0.5 bg-gray-500 rounded-full animate-thinking-3 opacity-60"></div>
      </div>
    </div>
  );
};

export default AIThinking;
