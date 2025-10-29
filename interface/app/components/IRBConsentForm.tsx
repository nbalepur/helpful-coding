'use client';

import { useState, useEffect } from 'react';
import { irbConsentContent } from '../data/irbContent';

interface IRBConsentFormProps {
  onAgree: () => void;
  onCancel: () => void;
}

export default function IRBConsentForm({ onAgree, onCancel }: IRBConsentFormProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [markdownContent, setMarkdownContent] = useState('');

  useEffect(() => {
    // Use the imported content directly
    setMarkdownContent(irbConsentContent);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
    setHasScrolledToBottom(isAtBottom);
  };

  // Simple markdown to HTML converter for basic formatting
  const parseMarkdown = (text: string) => {
    return text
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-white mb-4">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-blue-400 mb-3 mt-6">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold text-blue-300 mb-2 mt-4">$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-white">$1</strong>')
      .replace(/^- (.*$)/gim, '<li class="ml-4 mb-1 text-gray-300">$1</li>')
      .replace(/(<li.*<\/li>)/gims, '<ul class="list-disc list-inside mb-4">$1</ul>')
      .replace(/^(?!<[h|u|l])(.*$)/gim, '<p class="mb-3 text-gray-300">$1</p>')
      .replace(/\n\n/gim, '');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl my-8">
        {/* Back Button */}
        <button
          onClick={onCancel}
          className="mb-6 flex items-center text-white hover:text-blue-400 transition-all duration-200 hover:-translate-y-0.5 bg-transparent hover:bg-transparent"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </button>

        {/* Main Content Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 shadow-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-xl text-white mb-0" style={{textAlign: 'center'}}>Please agree to the consent form before proceeding</h2>
          </div>

          {/* Scrollable Content - Improved dark theme styling */}
          <div 
            className="max-h-96 overflow-y-auto mb-8 pr-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 bg-gray-900 rounded-md p-6 border border-gray-700"
            onScroll={handleScroll}
          >
            <div 
              className="text-gray-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(markdownContent) }}
            />
          </div>

          {/* Scroll Indicator - Always present but invisible when scrolled */}
          <div className={`text-center mb-6 transition-opacity duration-300 ${hasScrolledToBottom ? 'opacity-0' : 'opacity-100'}`}>
            <p className="text-gray-400 text-sm">Please scroll down to read the full consent form before proceeding</p>
            <div className="mt-3">
              <svg className="w-6 h-6 text-gray-400 mx-auto animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>

          {/* Current Date */}
          <div className="text-center mb-4">
            <p className="text-white-400 text-sm">
              Today's Date:{" "}{new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onCancel}
              className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-md transition-colors duration-200"
            >
              Take me Back
            </button>
            <button
              onClick={onAgree}
              disabled={!hasScrolledToBottom}
              className={`px-8 py-3 font-medium rounded-md transition-all duration-200 ${
                hasScrolledToBottom
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:-translate-y-0.5'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              I Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
