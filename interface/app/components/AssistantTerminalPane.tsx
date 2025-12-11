"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, Loader2, Send as SendIcon, Hand, PanelBottom, PanelRight } from 'lucide-react';
import { useAnimatedText } from '../hooks/useAnimatedText';

export type AssistantType = 'user' | 'assistant' | 'tool' | 'suggestions' | 'system';

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
  fileName?: string; // optional: associated filename for tool messages
}

export interface AssistantTerminalPaneRef {
  focusInput: () => void;
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
  onHalt?: () => void;
  assistantPlacement?: 'bottom' | 'side';
  onAssistantPlacementChange?: (placement: 'bottom' | 'side') => void;
}

// Track which messages have been fully animated (persists across re-renders)
// Using a module-level Set instead of useRef since it's outside component scope
const animatedMessageIds = new Set<string>();

const AnimatedTerminalText: React.FC<{ 
  text?: string; 
  animate?: boolean; 
  messageId?: string;
  onAnimationComplete?: () => void;
}> = ({ 
  text = '', 
  animate = true,
  messageId,
  onAnimationComplete
}) => {
  const duration = Math.min(1.4, Math.max(0.4, text.length * 0.02));
  const animatedText = useAnimatedText(text, { duration });
  
  // Check if this message has already been animated
  const wasAlreadyAnimated = React.useMemo(() => {
    return messageId ? animatedMessageIds.has(messageId) : false;
  }, [messageId]);

  // Mark message as animated when animation completes
  React.useEffect(() => {
    if (messageId && text && !wasAlreadyAnimated && animatedText === text) {
      // Animation has completed, mark it
      animatedMessageIds.add(messageId);
      // Notify parent that animation completed
      onAnimationComplete?.();
    }
  }, [messageId, text, animatedText, wasAlreadyAnimated, onAnimationComplete]);

  if (!animate) {
    return <>{text}</>;
  }

  if (!text) {
    return null;
  }

  // If already animated before, show full text immediately
  if (wasAlreadyAnimated) {
    return <>{text}</>;
  }

  return <>{animatedText}</>;
};

const AssistantTerminalPane = forwardRef<AssistantTerminalPaneRef, AssistantTerminalPaneProps>(({
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
  onHalt,
  assistantPlacement,
  onAssistantPlacementChange,
}, ref) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const haltBtnRef = useRef<HTMLButtonElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);

  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const showTooltip = useCallback((el: HTMLElement | null, text: string, placement: 'top' | 'left' = 'top') => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (placement === 'left') {
      // Position tooltip to the left of the element, vertically centered, with extra offset
      setTooltip({ text, x: rect.left - 12, y: rect.top + rect.height / 2 });
    } else {
      // Position tooltip 14px above the element
      setTooltip({ text, x: rect.left + rect.width / 2, y: rect.top - 32 });
    }
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focusInput: () => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }));
  const [localInputValue, setLocalInputValue] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(32);
  // Track animation completions to trigger ellipses recalculation
  const [animationCompletionCounter, setAnimationCompletionCounter] = useState(0);
  
  // Callback when animation completes to update ellipses logic
  const handleAnimationComplete = useCallback(() => {
    setAnimationCompletionCounter(prev => prev + 1);
  }, []);
  
  // Use controlled value if provided, otherwise use local state
  const inputValue = controlledInputValue !== undefined ? controlledInputValue : localInputValue;
  const setInputValue = onInputChange || setLocalInputValue;

  // When awaiting response starts, clear and disable input (via disabled attr)
  useEffect(() => {
    if (awaitingResponse) {
      // Remove focus to avoid cursor while disabled
      try { textareaRef.current?.blur(); } catch {}
    }
  }, [awaitingResponse]);

  // Global keyboard shortcut: Halt with Cmd+Backspace while awaiting
  useEffect(() => {
    if (!awaitingResponse) return;
    const handler = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      if (e.metaKey && key === 'd') {
        e.preventDefault();
        onHalt?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [awaitingResponse, onHalt]);

  // Global keyboard shortcut: Clear messages with Cmd+Backspace (always)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      if (e.metaKey && key === 'backspace') {
        // Avoid interfering with text deletion when focused inside inputs if desired
        // Here we use a top-level Clear shortcut regardless of focus
        e.preventDefault();
        onClearMessages?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClearMessages]);

  const handleSuggestionClickInternal = useCallback((suggestion: string) => {
    if (!suggestion) return;
    if (awaitingResponse) return;
    
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
    
    onSuggestionClick?.(suggestion);
  }, [setInputValue, awaitingResponse, onSuggestionClick]);

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

  // Determine if ellipses should be shown
  const shouldShowEllipses = useMemo(() => {
    // Don't show if not awaiting response
    if (!awaitingResponse) return false;
    
    // Don't show if summary is generating
    if (summaryGenerated) return false;
    
    // Don't show if last message is a tool message that's still editing (spinning animation)
    if (lastMessage?.type === 'tool' && lastMessage?.status !== 'done') {
      return false;
    }
    
    // Don't show if last message text is still animating
    // A message is animating if it's an assistant/tool message with text that hasn't completed animation yet
    if (lastMessage?.id && lastMessage?.text && 
        (lastMessage.type === 'assistant' || (lastMessage.type === 'tool' && lastMessage.status === 'done'))) {
      const hasCompletedAnimation = animatedMessageIds.has(lastMessage.id);
      // If it hasn't completed animation, it's either animating now or will animate soon
      if (!hasCompletedAnimation) {
        return false;
      }
    }
    
    // Show ellipses otherwise
    return true;
  }, [awaitingResponse, summaryGenerated, lastMessage, animationCompletionCounter]);

  // Only reveal suggestions after the final summary has finished animating
  const shouldShowSuggestions = useMemo(() => {
    if (!summaryGenerated) return false;
    // Consider the most recent assistant message as the summary
    const lastAssistant = [...renderedItems.messages].reverse().find(m => m.type === 'assistant');
    if (!lastAssistant?.id) return false;
    return animatedMessageIds.has(lastAssistant.id);
  }, [summaryGenerated, renderedItems.messages, animationCompletionCounter]);

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
      {tooltip && typeof window !== 'undefined' && createPortal(
        <div style={{ 
          position: 'fixed', 
          top: tooltip.y, 
          left: tooltip.x, 
          transform: tooltip.x > window.innerWidth / 2 ? 'translateX(-100%) translateY(-50%)' : 'translateX(-8px) translateY(-50%)', 
          zIndex: 9999 
        }}>
          <div className="px-2 py-1 bg-white text-black text-xs rounded border border-gray-300 shadow-lg whitespace-nowrap relative">
            {tooltip.text}
          </div>
        </div>,
        document.body
      )}
      {/* Placement toggle button row - transparent, minimal space */}
      {assistantPlacement && onAssistantPlacementChange && (
        <div className="flex items-center justify-end px-1 py-1 flex-shrink-0 bg-black">
          <button
            onClick={() => onAssistantPlacementChange(assistantPlacement === 'bottom' ? 'side' : 'bottom')}
            className="px-2 py-1 text-xs rounded transition-colors relative group flex-shrink-0 h-7 w-7 flex items-center justify-center bg-gray-700/50 hover:bg-gray-600 text-gray-400 hover:text-gray-300"
            onMouseEnter={(e) => showTooltip(e.currentTarget, 'Toggle layout', 'left')}
            onMouseLeave={hideTooltip}
            type="button"
            aria-label="Toggle AI Pane"
          >
            {assistantPlacement === 'bottom' ? (
              <PanelRight size={14} />
            ) : (
              <PanelBottom size={14} />
            )}
          </button>
        </div>
      )}
      {/* Messages area grows to fill available space */}
      <div
        ref={messagesContainerRef}
        className="w-full bg-[#0a0a0a] overflow-y-auto flex-1 min-h-0"
      >
        <div className="px-3 py-0 space-y-2">
          {renderedItems.messages.map((item, index) => {
            // Check if this is a user message and if there was a previous user message
            const isUserMessage = item.type === 'user';
            const hasPreviousUserMessage = index > 0 && renderedItems.messages.slice(0, index).some(msg => msg.type === 'user');
            const showDivider = isUserMessage && hasPreviousUserMessage;
            
            if (item.type === 'user') {
              return (
                <React.Fragment key={item.id}>
                  {showDivider && <div className="border-t border-white/10 my-4"></div>}
                  <div className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-gray-100 whitespace-pre-wrap mt-3">
                    {item.text}
                  </div>
                </React.Fragment>
              );
            }

            if (item.type === 'system') {
              return (
                <div
                  key={item.id}
                  className="text-[11px] text-gray-500 italic whitespace-pre-wrap"
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
                  className="flex items-center gap-2 bg-slate-900/80 hover:bg-slate-800/70 transition-colors duration-200 border border-slate-700/60 rounded-md px-3 py-2 text-[13px] text-gray-200 cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => { try { if (item.fileName) window.dispatchEvent(new CustomEvent('editor-highlight-tab', { detail: { fileName: item.fileName } })); } catch {} }}
                  onMouseLeave={() => { try { window.dispatchEvent(new CustomEvent('editor-unhighlight-tab')); } catch {} }}
                  onClick={() => { try { if (item.fileName) window.dispatchEvent(new CustomEvent('editor-select-file', { detail: { fileName: item.fileName } })); } catch {} }}
                  onKeyDown={(e) => {
                    const key = (e.key || '').toLowerCase();
                    if (key === 'enter' || key === ' ') {
                      e.preventDefault();
                      try { if (item.fileName) window.dispatchEvent(new CustomEvent('editor-select-file', { detail: { fileName: item.fileName } })); } catch {}
                    }
                  }}
                >
                  {isDone ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Loader2 size={14} className="text-blue-400 animate-spin" />
                  )}
                  <span className="font-medium text-gray-100"><AnimatedTerminalText text={item.text} messageId={item.id} onAnimationComplete={handleAnimationComplete} /></span>
                  {isDone && (additions !== 0 || deletions !== 0) && (
                    <span className="ml-auto flex items-center gap-2 text-[11px]">
                      <span className="text-emerald-400">+{additions}</span>
                      <span className="text-rose-400">-{deletions}</span>
                    </span>
                  )}
                </div>
              );
            }

            const displayText = String(item.text || '');

            return (
              <div
                key={item.id}
                className="text-[13px] text-gray-300 whitespace-pre-wrap"
                style={{ lineHeight: item.type === 'assistant' ? '1.7em' : undefined }}
              >
                <AnimatedTerminalText text={displayText} animate={item.type === 'assistant'} messageId={item.id} onAnimationComplete={handleAnimationComplete} />
              </div>
            );
          })}
          {shouldShowEllipses && (
            <div className="flex items-center gap-0 text-[10px] text-gray-500 py-1">
              <span className="dot-bounce">•</span>
              <span className="dot-bounce">•</span>
              <span className="dot-bounce">•</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      {/* Suggestions area - sizes with its content; show only after summary animation completes */}
      {shouldShowSuggestions && (
        <div
          className="w-full bg-[#0a0a0a] flex justify-center px-3 py-3 flex-none"
        >
          <div className="w-full flex flex-col items-center justify-end gap-2">
            {renderedItems.suggestions.map((item) => {
              const suggestions = item.suggestions ?? [];
              if (suggestions.length === 0) return null;
              
              return (
                <div
                  key={item.id}
                  className="w-full text-[12px] text-gray-200 suggestion-animate"
                >
                  <div className="flex flex-wrap gap-3 justify-center pt-1 pb-1">
                    {suggestions.map((suggestion, idx) => (
                      <button
                        key={`${item.id}-suggestion-${idx}`}
                        onClick={() => handleSuggestionClickInternal(suggestion)}
                        className="px-3 py-1 text-xs rounded-md bg-blue-600/10 text-blue-300 hover:bg-blue-600/20 transition-all duration-200 hover:-translate-y-0.5"
                        style={{ border: '1px solid rgba(96, 165, 250, 0.4)', borderStyle: 'solid', borderWidth: '1px' }}
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
      )}
      {/* Toolbar outside the iframe, inside the assistant terminal */}
      <div className="flex flex-col gap-2 p-2 bg-gray-800/50">
        <div className="flex gap-2 items-center">
          <Bot size={16} className="flex-shrink-0 text-gray-400" />
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (awaitingResponse) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (onSubmit && inputValue.trim()) {
                  onSubmit(inputValue);
                }
              }
            }}
            placeholder="Ask anything... (⌘+I)"
            className="flex-1 text-sm rounded px-2 py-1 text-white placeholder-gray-400 focus:outline-none resize-none overflow-y-auto disabled:text-gray-400 disabled:bg-gray-800/60 disabled:border-gray-700 disabled:cursor-not-allowed"
            style={{ 
              background: 'rgba(59, 130, 246, 0.1)', 
              border: '1px solid #374151',
              minHeight: '32px',
              maxHeight: '160px',
              height: `${textareaHeight}px`
            }}
            disabled={awaitingResponse}
            onMouseEnter={() => { if (awaitingResponse) showTooltip(textareaRef.current, 'Agent running – input locked'); }}
            onMouseLeave={hideTooltip}
          />
          <button 
            ref={clearBtnRef}
            className="px-2 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors relative group flex-shrink-0 h-8"
            onClick={onClearMessages}
            onMouseEnter={() => showTooltip(clearBtnRef.current, 'Clear messages (⌘⌫)')}
            onMouseLeave={hideTooltip}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            {/* tooltip rendered via portal */}
          </button>
          {awaitingResponse ? (
            <button
              ref={haltBtnRef}
              className="px-2 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors relative group flex-shrink-0 h-8"
              onClick={() => { onHalt?.(); }}
              type="button"
              aria-label="Halt (Command+D)"
              onMouseEnter={() => showTooltip(haltBtnRef.current, 'Halt (⌘D)')}
              onMouseLeave={hideTooltip}
            >
              <Hand size={16} />
              {/* tooltip rendered via portal */}
            </button>
          ) : (
            <button 
              ref={sendBtnRef}
              className="px-2 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors relative group flex-shrink-0 h-8"
              onClick={() => {
                if (onSubmit && inputValue.trim()) {
                  onSubmit(inputValue);
                }
              }}
              type="button"
              onMouseEnter={() => showTooltip(sendBtnRef.current, 'Send (Enter)')}
              onMouseLeave={hideTooltip}
            >
              <SendIcon size={16} />
              {/* tooltip rendered via portal */}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

AssistantTerminalPane.displayName = 'AssistantTerminalPane';

export default AssistantTerminalPane;


