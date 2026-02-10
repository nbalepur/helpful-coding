'use client';

import React from 'react';
import UserInstructionsContent from './UserInstructionsContent';

interface InstructionsModalProps {
  open: boolean;
  onDismiss: () => void;
}

export default function InstructionsModal({ open, onDismiss }: InstructionsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructions-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onDismiss}
        aria-hidden="true"
      />
      {/* Modal */}
      <div
        className="relative flex flex-col w-full max-w-5xl h-[85vh] shadow-xl border border-gray-700 overflow-hidden"
        style={{ backgroundColor: '#1f2937' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between flex-shrink-0 px-6 py-4 border-b border-gray-600">
          <h2 id="instructions-modal-title" className="text-xl font-semibold text-white">
            Instructions: Welcome to VibeJam!
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded"
            aria-label="Close"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <UserInstructionsContent
            isLightMode={false}
            showToc={true}
            youtubeInstructionsVideoId="eJ2dppIxG60"
            className="flex-1 min-h-0"
          />
        </div>

        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-600 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="px-5 py-2.5 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
