import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'white' | 'blue';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

const colorClasses = {
  white: 'border-white',
  blue: 'border-blue-400',
};

export default function LoadingSpinner({ 
  size = 'md', 
  color = 'blue',
  className = '' 
}: LoadingSpinnerProps) {
  const sizeClass = sizeClasses[size];
  const colorClass = colorClasses[color];
  
  return (
    <div 
      className={`animate-spin rounded-full border-b-2 ${sizeClass} ${colorClass} ${className}`}
      aria-label="Loading"
      role="status"
    />
  );
}
