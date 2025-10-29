"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Loader2 } from 'lucide-react';
import { useAnimatedText } from '../hooks/useAnimatedText';

export type AssistantType = 'user' | 'assistant' | 'tool' | 'suggestions';

export interface AssistantItem {
  id?: string;
  message?: string;
  text?: string;
  type?: AssistantType;
  status?: 'pending' | 'done';
  diff?: {
    additions?: number;
    deletions?: number;
  };
  suggestions?: string[];
}

interface AssistantTerminalPaneProps {
  items?: AssistantItem[];
  className?: string;
  title?: string;
  onClearMessages?: () => void;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onSubmit?: (message: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
  awaitingResponse?: boolean;
  summaryGenerated?: boolean;
  isEditorLoading?: boolean;
}

const AnimatedTerminalText: React.FC<{ text?: string; animate?: boolean }> = ({ text = '', animate = true }) => {
  const duration = Math.min(1.4, Math.max(0.4, text.length * 0.02));
  const animatedText = useAnimatedText(text, { duration });

  if (!animate) {
    return <>{text}</>;
  }

  if (!text) {
    return null;
  }

  return <>{animatedText}</>;
};

const AssistantTerminalPane: React.FC<AssistantTerminalPaneProps> = ({
  items,
  className = '',
  title = 'AI Assistant',
  onClearMessages,
  inputValue: controlledInputValue,
  onInputChange,
  onSubmit,
  onSuggestionClick,
  awaitingResponse = false,
  summaryGenerated = false,
  isEditorLoading = false,
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localInputValue, setLocalInputValue] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(32);
  
  // Use controlled value if provided, otherwise use local state
  const inputValue = controlledInputValue !== undefined ? controlledInputValue : localInputValue;
  const setInputValue = onInputChange || setLocalInputValue;

  const handleSuggestionClickInternal = useCallback((suggestion: string) => {
    if (!suggestion) return;
    
    // Populate the textarea with the suggestion
    setInputValue(suggestion);
    
    // Focus the textarea and move cursor to the end
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const length = suggestion.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }, 0);
    
    // NOTE: We do NOT call onSuggestionClick here because it would trigger submission.
    // The suggestion should only populate the textarea, allowing user to edit before submitting.
  }, [setInputValue]);

  const renderedItems = useMemo(() => {
    if (!items || !items.length) {
      return { messages: [], suggestions: [] };
    }

    const processed = items.map((item) => {
      const key = item.id ?? `${item.type}-${item.message ?? Math.random()}`;
      const text = String(item.message ?? item.text ?? '');
      const type = (item.type ?? 'assistant') as AssistantType;
      return { ...item, id: key, text, type };
    });

    // Separate messages from suggestions
    const messages = processed.filter(item => item.type !== 'suggestions');
    // Only keep the latest/most recent suggestions (last one in the array)
    const allSuggestions = processed.filter(item => item.type === 'suggestions');
    const suggestions = allSuggestions.length > 0 ? [allSuggestions[allSuggestions.length - 1]] : [];
    
    return { messages, suggestions };
  }, [items]);

  const lastMessage = renderedItems.messages.length > 0 ? renderedItems.messages[renderedItems.messages.length - 1] : null;

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    if (!messagesEndRef.current) return;

    const container = messagesContainerRef.current;
    // Auto scroll with a small delay to ensure layout is updated
    const timeout = setTimeout(() => {
      try {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch (error) {
        container.scrollTop = container.scrollHeight;
      }
    }, 40);

    return () => clearTimeout(timeout);
  }, [renderedItems.messages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const maxHeight = 160;
    const minHeight = 32;

    const hasContent = inputValue.trim().length > 0;

    if (!hasContent) {
      textarea.style.height = `${minHeight}px`;
      if (minHeight !== textareaHeight) {
        setTextareaHeight(minHeight);
      }
      return;
    }

    // Get computed styles to calculate true single-line height
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 4;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 4;
    const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;
    
    // Calculate expected single-line height
    const expectedSingleLineHeight = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;
    
    // Measure actual content height
    textarea.style.height = '0px';
    const contentHeight = textarea.scrollHeight;
    
    // Only expand if content actually exceeds single line (with small buffer for rounding)
    const threshold = expectedSingleLineHeight + 2;
    let newHeight = contentHeight > threshold 
      ? Math.min(contentHeight, maxHeight)
      : minHeight;

    textarea.style.height = `${newHeight}px`;

    if (newHeight !== textareaHeight) {
      setTextareaHeight(newHeight);
    }

    if (textarea.scrollHeight <= textarea.clientHeight) {
      textarea.scrollTop = 0;
    }
  }, [inputValue, textareaHeight]);

  // Scroll container down when textarea expands
  useEffect(() => {
    if (!messagesContainerRef.current) return;
    const timeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 16);
    return () => clearTimeout(timeout);
  }, [textareaHeight]);

  return (
    <div className={`w-full h-full flex flex-col ${className}`} aria-label={title}>
      {/* Messages area grows to fill available space */}
      <div
        ref={messagesContainerRef}
        className="w-full bg-[#0a0a0a] border border-gray-800 rounded-md overflow-y-auto flex-1 min-h-0"
      >
        <div className="px-3 py-3 space-y-2">
          {renderedItems.messages.map((item) => {
            if (item.type === 'user') {
              return (
                <div
                  key={item.id}
                  className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-gray-100 whitespace-pre-wrap"
                >
                  {item.text}
                </div>
              );
            }

            if (item.type === 'tool') {
              const isDone = item.status === 'done';
              const additions = item.diff?.additions ?? 0;
              const deletions = item.diff?.deletions ?? 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/60 rounded-md px-3 py-2 text-[12px] text-gray-200"
                >
                  {isDone ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Loader2 size={14} className="text-blue-400 animate-spin" />
                  )}
                  <span className="font-medium text-gray-100"><AnimatedTerminalText text={item.text} /></span>
                  {isDone && (additions !== 0 || deletions !== 0) && (
                    <span className="ml-auto flex items-center gap-2 text-[11px]">
                      <span className="text-emerald-400">+{additions}</span>
                      <span className="text-rose-400">-{deletions}</span>
                    </span>
                  )}
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className="text-[12px] text-gray-300 whitespace-pre-wrap"
              >
                <AnimatedTerminalText text={item.text} animate={item.type === 'assistant'} />
              </div>
            );
          })}
          {awaitingResponse && !summaryGenerated && (!isEditorLoading || (lastMessage?.type !== 'tool' || lastMessage?.status === 'done')) && (
            <div className="flex items-center gap-0 text-[10px] text-gray-500 py-1">
              <span className="dot-bounce">•</span>
              <span className="dot-bounce">•</span>
              <span className="dot-bounce">•</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      {/* Suggestions area - sizes with its content */}
      <div
        className="w-full bg-[#0a0a0a] border-t border-gray-800 flex justify-center px-3 py-3 flex-none"
      >
        <div className="w-full flex flex-col items-center justify-end gap-2 max-h-60 overflow-y-auto animate-fade-in">
          {renderedItems.suggestions.map((item) => {
            const suggestions = item.suggestions ?? [];
            if (suggestions.length === 0) return null;
            
            return (
              <div
                key={item.id}
                className="w-full text-[12px] text-gray-200"
              >
                <div className="flex flex-wrap gap-2 justify-center transition-all duration-300">
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={`${item.id}-suggestion-${idx}`}
                      onClick={() => handleSuggestionClickInternal(suggestion)}
                      className="px-3 py-1 text-xs rounded-md bg-blue-600/10 border border-blue-500/40 text-blue-300 hover:bg-blue-600/20 transition-all duration-200 hover:-translate-y-0.5"
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Toolbar outside the iframe, inside the assistant terminal */}
      <div className="flex flex-col gap-2 p-2 bg-gray-800/50 border-t border-gray-700/50">
        <div className="flex gap-2 items-center">
          <Bot size={16} className="flex-shrink-0 text-gray-400" />
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (onSubmit && inputValue.trim()) {
                  onSubmit(inputValue);
                  setInputValue('');
                }
              }
            }}
            placeholder="Type your next instruction..."
            className="flex-1 text-sm rounded px-2 py-1 text-white placeholder-gray-400 focus:outline-none resize-none overflow-y-auto"
            style={{ 
              background: 'rgba(59, 130, 246, 0.1)', 
              border: '1px solid #374151',
              minHeight: '32px',
              maxHeight: '160px',
              height: `${textareaHeight}px`
            }}
          />
          <button 
            className="px-2 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors relative group flex-shrink-0 h-8"
            onClick={onClearMessages}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              Clear messages
            </div>
          </button>
          <button 
            className="px-2 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors relative group flex-shrink-0 h-8"
            onClick={() => {
              if (onSubmit && inputValue.trim()) {
                onSubmit(inputValue);
                setInputValue('');
              }
            }}
          >
            ➤
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              Send
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssistantTerminalPane;


