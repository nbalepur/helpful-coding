"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Bot, Check, Copy, Code2, Send as SendIcon, Hand, PanelBottom, PanelRight, X, Undo, Redo, ChevronDown, CircleHelp, Lightbulb } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { useAnimatedText } from '../hooks/useAnimatedText';

export type AssistantType = 'user' | 'assistant' | 'tool' | 'suggestions' | 'system';

export interface AssistantItem {
  id?: string;
  message?: string;
  text?: string;
  type?: AssistantType;
  status?: 'pending' | 'done' | 'failed';
  diff?: {
    additions?: number;
    deletions?: number;
  };
  suggestions?: string[];
  fileName?: string; // optional: associated filename for tool messages
  /** When true, render message as markdown (code blocks, etc.). Used for ask-mode replies. */
  renderMarkdown?: boolean;
}

export interface AssistantTerminalPaneRef {
  focusInput: () => void;
}

interface AssistantTerminalPaneProps {
  items?: AssistantItem[];
  className?: string;
  title?: string;
  /** Mode label shown in header, e.g. "Ask Only" or "Execution Mode" */
  modeLabel?: string;
  modeValue?: 'agent' | 'ask' | 'brainstorm';
  onModeChange?: (mode: 'agent' | 'ask' | 'brainstorm') => void;
  modeSwitchDisabled?: boolean;
  /** Shown when there are no messages (e.g. "Hello! How can I help you today?") */
  initialMessage?: string;
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
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  hideSuggestions?: boolean;
  /** When true, pasting into the input is disabled (e.g. for website_requirement tasks). */
  disablePaste?: boolean;
}

// Track which messages have been fully animated (persists across re-renders)
// Using a module-level Set instead of useRef since it's outside component scope
const animatedMessageIds = new Set<string>();

// Prism token colors tuned to match Monaco's default dark theme as closely as possible.
const monacoLikePrismTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: '#d4d4d4',
    background: 'transparent',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  'pre[class*="language-"]': {
    color: '#d4d4d4',
    background: '#1e1e1e',
    margin: 0,
  },
  comment: { color: '#6a9955' },
  prolog: { color: '#6a9955' },
  doctype: { color: '#6a9955' },
  cdata: { color: '#6a9955' },
  punctuation: { color: '#d4d4d4' },
  property: { color: '#9cdcfe' },
  tag: { color: '#569cd6' },
  'attr-name': { color: '#9cdcfe' },
  'attr-value': { color: '#ce9178' },
  string: { color: '#ce9178' },
  char: { color: '#ce9178' },
  builtin: { color: '#4ec9b0' },
  inserted: { color: '#b5cea8' },
  deleted: { color: '#ce9178' },
  operator: { color: '#d4d4d4' },
  entity: { color: '#d7ba7d' },
  url: { color: '#d7ba7d' },
  atrule: { color: '#c586c0' },
  keyword: { color: '#569cd6' },
  function: { color: '#dcdcaa' },
  'class-name': { color: '#4ec9b0' },
  regex: { color: '#d16969' },
  important: { color: '#569cd6', fontWeight: 400 },
  variable: { color: '#9cdcfe' },
  number: { color: '#b5cea8' },
  boolean: { color: '#569cd6' },
  constant: { color: '#4fc1ff' },
};

/** Wraps a <pre> code block with a copy button that copies the block's text to the clipboard. Export for use in other Markdown renderers. */
export const CodeBlockWithCopy: React.FC<React.ComponentProps<'pre'>> = ({ children, className, style }) => {
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [isCopyButtonHovered, setIsCopyButtonHovered] = useState(false);

  const codeElement = React.Children.toArray(children).find(
    (child): child is React.ReactElement<{ className?: string; children?: React.ReactNode }> =>
      React.isValidElement(child) && typeof child.props.className === 'string'
  );
  const languageClass = codeElement?.props?.className ?? '';
  const languageMatch = /language-([a-zA-Z0-9_-]+)/.exec(languageClass);
  const languageLabelMap: Record<string, string> = {
    js: 'JavaScript',
    javascript: 'JavaScript',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    jsx: 'JavaScript',
    tsx: 'TypeScript',
    py: 'Python',
    python: 'Python',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML',
    md: 'Markdown',
    markdown: 'Markdown',
    bash: 'Bash',
    sh: 'Shell',
    shell: 'Shell',
    sql: 'SQL',
    c: 'C',
    cpp: 'C++',
    cxx: 'C++',
    java: 'Java',
    go: 'Go',
    rust: 'Rust',
    ruby: 'Ruby',
    php: 'PHP',
  };
  const normalizedLanguage = languageMatch?.[1]?.toLowerCase() ?? '';
  const languageLabel =
    languageLabelMap[normalizedLanguage] ??
    (normalizedLanguage
      ? normalizedLanguage
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (ch) => ch.toUpperCase())
      : 'Code');
  const syntaxLanguageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown',
    py: 'python',
    cxx: 'cpp',
  };
  const syntaxLanguage = syntaxLanguageMap[normalizedLanguage] ?? (normalizedLanguage || 'text');
  const rawCode = useMemo(() => {
    if (React.isValidElement(codeElement)) {
      const codeChildren = codeElement.props.children;
      if (Array.isArray(codeChildren)) return codeChildren.join('');
      return String(codeChildren ?? '');
    }
    if (Array.isArray(children)) return children.join('');
    return String(children ?? '');
  }, [children, codeElement]);

  const cleanedPreClassName = (className ?? '')
    .split(/\s+/)
    .filter(
      (token) =>
        token &&
        !token.startsWith('bg-') &&
        !token.startsWith('rounded') &&
        !token.startsWith('my-') &&
        !token.startsWith('pr-') &&
        !token.startsWith('overflow-')
    )
    .join(' ');
  const mergedPreStyle = {
    margin: 0,
    ...(style ?? {}),
  };

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const text = rawCode;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('idle');
    }

    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = setTimeout(() => {
      setCopyState('idle');
    }, 1800);
  }, [rawCode]);
  return (
    <div className="assistant-code-block rounded-md border overflow-hidden mt-0 mb-2" style={{ backgroundColor: '#1e1e1e', borderColor: '#3c3c3c' }}>
      <div
        className="h-8 px-2.5 border-b flex items-center justify-between select-none"
        style={{ backgroundColor: '#252526', borderColor: '#3c3c3c', userSelect: 'none' }}
      >
        <div className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: '#cccccc' }}>
          <Code2 size={11} style={{ color: '#9da0a6' }} />
          <span>{languageLabel}</span>
        </div>
        <div className="relative group">
          <button
            type="button"
            onClick={handleCopy}
            onMouseEnter={() => setIsCopyButtonHovered(true)}
            onMouseLeave={() => setIsCopyButtonHovered(false)}
            onFocus={() => setIsCopyButtonHovered(true)}
            onBlur={() => setIsCopyButtonHovered(false)}
            className="inline-flex items-center justify-center h-5 w-5 rounded-sm bg-transparent hover:bg-transparent focus:bg-transparent transition-colors"
            style={{
              color:
                copyState === 'copied'
                  ? (isCopyButtonHovered ? '#63d7bf' : '#4ec9b0')
                  : (isCopyButtonHovered ? '#c3c7cc' : '#9da0a6'),
              margin: 0,
              padding: 0,
              border: 'none',
              boxShadow: 'none',
              background: 'transparent',
            }}
            aria-label={copyState === 'copied' ? 'Copied' : 'Copy code'}
          >
            {copyState === 'copied' ? <Check size={11} /> : <Copy size={11} />}
          </button>
          <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] leading-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" style={{ backgroundColor: '#252526', color: '#cccccc', border: '1px solid #3c3c3c' }}>
            {copyState === 'copied' ? 'Copied' : 'Copy'}
          </span>
        </div>
      </div>
      <div
        className={`m-0 rounded-sm overflow-hidden ${cleanedPreClassName}`}
        style={{ ...mergedPreStyle, backgroundColor: '#1e1e1e' }}
      >
        <SyntaxHighlighter
          language={syntaxLanguage}
          style={monacoLikePrismTheme}
          PreTag="div"
          wrapLongLines
          customStyle={{
            margin: 0,
            padding: '10px 12px',
            background: 'transparent',
            maxHeight: '360px',
            overflowY: 'auto',
            overflowX: 'hidden',
            fontSize: '12px',
            lineHeight: '20px',
            borderRadius: 0,
          }}
          codeTagProps={{
            style: {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              display: 'block',
              background: 'transparent',
              padding: 0,
              borderRadius: 0,
            },
          }}
        >
          {rawCode}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

interface SideBySideCodeComparison {
  beforeText: string;
  leftLanguage: string;
  leftCode: string;
  rightLanguage: string;
  rightCode: string;
  afterText: string;
}

const parseSideBySideCodeComparison = (text: string): SideBySideCodeComparison | null => {
  const comparisonPattern =
    /^([\s\S]*?)Left block:\s*```([^\n`]*)\n([\s\S]*?)```\s*Right block:\s*```([^\n`]*)\n([\s\S]*?)```([\s\S]*)$/i;
  const match = text.match(comparisonPattern);

  if (!match) return null;

  const [, beforeText, leftLanguage, leftCode, rightLanguage, rightCode, afterText] = match;
  return {
    beforeText: beforeText.trim(),
    leftLanguage: leftLanguage.trim(),
    leftCode: leftCode.replace(/\n$/, ''),
    rightLanguage: rightLanguage.trim(),
    rightCode: rightCode.replace(/\n$/, ''),
    afterText: afterText.trim(),
  };
};

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
  modeLabel,
  initialMessage,
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
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  hideSuggestions = false,
  disablePaste = false,
  modeValue,
  onModeChange,
  modeSwitchDisabled = false,
}, ref) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const haltBtnRef = useRef<HTMLButtonElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);

  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number; placement: 'top' | 'left' } | null>(null);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const pasteDisabledTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((el: HTMLElement | null, text: string, placement: 'top' | 'left' = 'top') => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (placement === 'left') {
      // Position tooltip to the left of the element, vertically centered, with extra offset
      setTooltip({ text, x: rect.left - 12, y: rect.top + rect.height / 2, placement });
    } else {
      // Position tooltip at the top of the element, centered horizontally
      // The transform will handle moving it above with proper spacing
      setTooltip({ text, x: rect.left + rect.width / 2, y: rect.top, placement });
    }
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  useEffect(() => {
    if (!isModeMenuOpen) return;
    const handlePointerDownOutside = (event: MouseEvent) => {
      if (!modeMenuRef.current) return;
      if (!modeMenuRef.current.contains(event.target as Node)) {
        setIsModeMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDownOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isModeMenuOpen]);

  const currentModeValue = modeValue ?? (
    modeLabel?.toLowerCase().includes('agent')
      ? 'agent'
      : modeLabel?.toLowerCase().includes('brainstorm')
        ? 'brainstorm'
        : 'ask'
  );
  const currentModeLabel =
    currentModeValue === 'agent' ? 'Agent' : currentModeValue === 'ask' ? 'Ask' : 'Brainstorm';

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
  // Keep latest suggestions so the idea pane does not collapse while agent is running.
  const [persistedSuggestions, setPersistedSuggestions] = useState<string[]>([]);
  const [isMac, setIsMac] = useState(false); // Will be set after mount to detect platform
  
  // Detect platform after mount
  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);
  
  // Callback when animation completes to update ellipses logic
  const handleAnimationComplete = useCallback(() => {
    setAnimationCompletionCounter(prev => prev + 1);
  }, []);
  
  // Use controlled value if provided, otherwise use local state
  const inputValue = controlledInputValue !== undefined ? controlledInputValue : localInputValue;
  const setInputValue = onInputChange || setLocalInputValue;

  // When disablePaste is true, block paste via document-level capture so we catch it regardless of focus/mount order
  const pasteDisabledMessage = 'Pasting is disabled for this task to prevent cheating, sorry!';
  useEffect(() => {
    if (!disablePaste) return;
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as Node | null;
      if (textareaRef.current && target && textareaRef.current.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        if (pasteDisabledTooltipTimeoutRef.current) {
          clearTimeout(pasteDisabledTooltipTimeoutRef.current);
          pasteDisabledTooltipTimeoutRef.current = null;
        }
        showTooltip(textareaRef.current, pasteDisabledMessage);
        pasteDisabledTooltipTimeoutRef.current = setTimeout(() => {
          hideTooltip();
          pasteDisabledTooltipTimeoutRef.current = null;
        }, 2500);
      }
    };
    document.addEventListener('paste', handlePaste, true);
    return () => {
      document.removeEventListener('paste', handlePaste, true);
      if (pasteDisabledTooltipTimeoutRef.current) {
        clearTimeout(pasteDisabledTooltipTimeoutRef.current);
      }
    };
  }, [disablePaste, showTooltip, hideTooltip]);

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

  // Style placeholder to use monospace font for better "I" visibility
  useEffect(() => {
    const styleId = 'assistant-terminal-placeholder-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .assistant-terminal-input::placeholder {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const style = document.getElementById(styleId);
      if (style) {
        style.remove();
      }
    };
  }, []);

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
    
    // Don't show if last message is a tool message that's still pending (spinning animation)
    if (lastMessage?.type === 'tool' && lastMessage?.status === 'pending') {
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
    if (hideSuggestions) return false;
    if (!summaryGenerated) return false;
    // Consider the most recent assistant message as the summary
    const lastAssistant = [...renderedItems.messages].reverse().find(m => m.type === 'assistant');
    if (!lastAssistant?.id) return false;
    return animatedMessageIds.has(lastAssistant.id);
  }, [hideSuggestions, summaryGenerated, renderedItems.messages, animationCompletionCounter]);

  const latestSuggestions = useMemo(() => {
    const suggestionItem = renderedItems.suggestions[0];
    return suggestionItem?.suggestions ?? [];
  }, [renderedItems.suggestions]);

  useEffect(() => {
    if (latestSuggestions.length > 0) {
      setPersistedSuggestions(latestSuggestions);
    }
  }, [latestSuggestions]);

  // Clear cached suggestions when the conversation is cleared/reset.
  useEffect(() => {
    const hasAnyMessages = renderedItems.messages.length > 0;
    const hasAnySuggestionItems = renderedItems.suggestions.length > 0;
    if (!hasAnyMessages && !hasAnySuggestionItems && persistedSuggestions.length > 0) {
      setPersistedSuggestions([]);
    }
  }, [renderedItems.messages.length, renderedItems.suggestions.length, persistedSuggestions.length]);

  const shouldReserveSuggestionPaneSpace =
    currentModeValue === 'agent' &&
    !hideSuggestions;
  const shouldRenderSuggestionPane =
    !hideSuggestions &&
    (shouldReserveSuggestionPaneSpace ||
      shouldShowSuggestions ||
      persistedSuggestions.length > 0);
  const suggestionsToRender = hideSuggestions
    ? []
    : (shouldShowSuggestions ? latestSuggestions : persistedSuggestions);
  const suggestionsRenderKey = useMemo(() => suggestionsToRender.join('\u0001'), [suggestionsToRender]);
  const [displayedSuggestions, setDisplayedSuggestions] = useState<string[]>(suggestionsToRender);
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const previousSuggestionsKeyRef = useRef(suggestionsRenderKey);

  useEffect(() => {
    const previousKey = previousSuggestionsKeyRef.current;
    if (previousKey === suggestionsRenderKey) return;

    setSuggestionsVisible(false);
    const timeout = setTimeout(() => {
      setDisplayedSuggestions(suggestionsToRender);
      setSuggestionsVisible(true);
      previousSuggestionsKeyRef.current = suggestionsRenderKey;
    }, 130);

    return () => clearTimeout(timeout);
  }, [suggestionsRenderKey, suggestionsToRender]);

  // When the suggestions/idea pane mounts, the messages viewport gets shorter.
  // Keep the newest streamed text visible by nudging scroll to bottom again.
  const prevShouldRenderSuggestionPaneRef = useRef(false);
  useEffect(() => {
    const wasVisible = prevShouldRenderSuggestionPaneRef.current;
    const isVisible = shouldRenderSuggestionPane && suggestionsToRender.length > 0;

    if (!wasVisible && isVisible) {
      const timeout = setTimeout(() => {
        try {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } catch {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }
      }, 60);
      prevShouldRenderSuggestionPaneRef.current = isVisible;
      return () => clearTimeout(timeout);
    }

    prevShouldRenderSuggestionPaneRef.current = isVisible;
  }, [shouldRenderSuggestionPane, suggestionsToRender.length]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    if (!messagesEndRef.current) return;

    const container = messagesContainerRef.current;
    const messagesEnd = messagesEndRef.current;
    
    // Check if the message end is visible in the container
    const checkVisibility = () => {
      const containerRect = container.getBoundingClientRect();
      const endRect = messagesEnd.getBoundingClientRect();
      
      // Check if the end element is within the visible area of the container
      const isVisible = 
        endRect.top >= containerRect.top &&
        endRect.bottom <= containerRect.bottom;
      
      return isVisible;
    };
    
    // Auto scroll with a small delay to ensure layout is updated
    const timeout = setTimeout(() => {
      // Only scroll if the message end is not visible (went off screen)
      if (!checkVisibility()) {
        try {
          messagesEnd.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } catch (error) {
          container.scrollTop = container.scrollHeight;
        }
      }
    }, 40);

    return () => clearTimeout(timeout);
  }, [renderedItems.messages]);

  // Continuous scrolling during text animation
  useEffect(() => {
    if (!messagesContainerRef.current) return;
    if (!messagesEndRef.current) return;
    if (!awaitingResponse) return;

    const container = messagesContainerRef.current;
    const messagesEnd = messagesEndRef.current;

    // Check if there's an active animation (message that hasn't completed)
    const hasActiveAnimation = renderedItems.messages.some(msg => {
      if (msg.type === 'assistant' || (msg.type === 'tool' && msg.status === 'done')) {
        return msg.id && !animatedMessageIds.has(msg.id);
      }
      return false;
    });

    if (!hasActiveAnimation) return;

    // Helper function to check if message end is visible
    const checkVisibility = () => {
      const containerRect = container.getBoundingClientRect();
      const endRect = messagesEnd.getBoundingClientRect();
      
      // Check if the end element is within the visible area of the container
      const isVisible = 
        endRect.top >= containerRect.top &&
        endRect.bottom <= containerRect.bottom;
      
      return isVisible;
    };

    // Use requestAnimationFrame for smooth scrolling during animation
    let animationFrameId: number;
    let lastScrollTime = 0;
    const scrollThrottle = 50; // Throttle to every 50ms for performance

    const scrollLoop = () => {
      const now = Date.now();
      if (now - lastScrollTime >= scrollThrottle) {
        // Only scroll if the message end is not visible (went off screen)
        if (!checkVisibility()) {
          try {
            // Use instant scrolling during animation for better responsiveness
            container.scrollTop = container.scrollHeight;
          } catch (error) {
            // Fallback
          }
        }
        lastScrollTime = now;
      }
      animationFrameId = requestAnimationFrame(scrollLoop);
    };

    animationFrameId = requestAnimationFrame(scrollLoop);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [awaitingResponse, renderedItems.messages, animationCompletionCounter]);

  // Continuous scrolling during summary animation (when summaryGenerated is true)
  useEffect(() => {
    if (!messagesContainerRef.current) return;
    if (!messagesEndRef.current) return;
    if (!summaryGenerated) return;

    const container = messagesContainerRef.current;
    const messagesEnd = messagesEndRef.current;

    // Find the summary message (last assistant message)
    const lastAssistant = [...renderedItems.messages].reverse().find(m => m.type === 'assistant');
    
    // Check if the summary message is still animating
    const isSummaryAnimating = lastAssistant?.id && !animatedMessageIds.has(lastAssistant.id);
    
    if (!isSummaryAnimating) return;

    // Helper function to check if message end is visible
    const checkVisibility = () => {
      const containerRect = container.getBoundingClientRect();
      const endRect = messagesEnd.getBoundingClientRect();
      
      // Check if the end element is within the visible area of the container
      const isVisible = 
        endRect.top >= containerRect.top &&
        endRect.bottom <= containerRect.bottom;
      
      return isVisible;
    };

    // Use requestAnimationFrame for smooth scrolling during animation
    let animationFrameId: number;
    let lastScrollTime = 0;
    const scrollThrottle = 50; // Throttle to every 50ms for performance

    const scrollLoop = () => {
      const now = Date.now();
      if (now - lastScrollTime >= scrollThrottle) {
        // Only scroll if the message end is not visible (went off screen)
        if (!checkVisibility()) {
          try {
            // Use instant scrolling during animation for better responsiveness
            container.scrollTop = container.scrollHeight;
          } catch (error) {
            // Fallback
          }
        }
        lastScrollTime = now;
      }
      animationFrameId = requestAnimationFrame(scrollLoop);
    };

    animationFrameId = requestAnimationFrame(scrollLoop);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [summaryGenerated, renderedItems.messages, animationCompletionCounter]);

  // Scroll to bottom when coding trace finishes (awaitingResponse changes from true to false)
  const prevAwaitingResponseRef = useRef(awaitingResponse);
  useEffect(() => {
    // Check if awaitingResponse changed from true to false
    if (prevAwaitingResponseRef.current === true && awaitingResponse === false) {
      if (!messagesContainerRef.current) {
        prevAwaitingResponseRef.current = awaitingResponse;
        return;
      }
      if (!messagesEndRef.current) {
        prevAwaitingResponseRef.current = awaitingResponse;
        return;
      }

      const container = messagesContainerRef.current;
      const messagesEnd = messagesEndRef.current;
      
      // Check if the message end is visible in the container
      const checkVisibility = () => {
        const containerRect = container.getBoundingClientRect();
        const endRect = messagesEnd.getBoundingClientRect();
        
        // Check if the end element is within the visible area of the container
        const isVisible = 
          endRect.top >= containerRect.top &&
          endRect.bottom <= containerRect.bottom;
        
        return isVisible;
      };
      
      // Auto scroll with a small delay to ensure layout is updated
      const timeout = setTimeout(() => {
        // Only scroll if the message end is not visible (went off screen)
        if (!checkVisibility()) {
          try {
            messagesEnd.scrollIntoView({ behavior: 'smooth', block: 'end' });
          } catch (error) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }, 100);

      prevAwaitingResponseRef.current = awaitingResponse;
      return () => clearTimeout(timeout);
    }
    // Update ref for next comparison
    prevAwaitingResponseRef.current = awaitingResponse;
  }, [awaitingResponse]);

  // Scroll when summary is generated
  const prevSummaryGeneratedRef = useRef(summaryGenerated);
  useEffect(() => {
    // Check if summaryGenerated changed from false to true
    if (prevSummaryGeneratedRef.current === false && summaryGenerated === true) {
      if (!messagesContainerRef.current) {
        prevSummaryGeneratedRef.current = summaryGenerated;
        return;
      }
      if (!messagesEndRef.current) {
        prevSummaryGeneratedRef.current = summaryGenerated;
        return;
      }

      const container = messagesContainerRef.current;
      const messagesEnd = messagesEndRef.current;
      
      // Check if the message end is visible in the container
      const checkVisibility = () => {
        const containerRect = container.getBoundingClientRect();
        const endRect = messagesEnd.getBoundingClientRect();
        
        // Check if the end element is within the visible area of the container
        const isVisible = 
          endRect.top >= containerRect.top &&
          endRect.bottom <= containerRect.bottom;
        
        return isVisible;
      };
      
      // Auto scroll with a delay to ensure the summary message is fully rendered
      const timeout = setTimeout(() => {
        // Only scroll if the message end is not visible (went off screen)
        if (!checkVisibility()) {
          try {
            messagesEnd.scrollIntoView({ behavior: 'smooth', block: 'end' });
          } catch (error) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }, 100);

      prevSummaryGeneratedRef.current = summaryGenerated;
      return () => clearTimeout(timeout);
    }
    // Update ref for next comparison
    prevSummaryGeneratedRef.current = summaryGenerated;
  }, [summaryGenerated]);

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
    if (!messagesEndRef.current) return;
    
    const container = messagesContainerRef.current;
    const messagesEnd = messagesEndRef.current;
    
    // Check if the message end is visible in the container
    const checkVisibility = () => {
      const containerRect = container.getBoundingClientRect();
      const endRect = messagesEnd.getBoundingClientRect();
      
      // Check if the end element is within the visible area of the container
      const isVisible = 
        endRect.top >= containerRect.top &&
        endRect.bottom <= containerRect.bottom;
      
      return isVisible;
    };
    
    const timeout = setTimeout(() => {
      // Only scroll if the message end is not visible (went off screen)
      if (!checkVisibility()) {
        messagesEnd.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 16);
    return () => clearTimeout(timeout);
  }, [textareaHeight]);


  return (
    <div className={`w-full h-full flex flex-col bg-black ${className}`} aria-label={title}>
      {tooltip && typeof window !== 'undefined' && createPortal(
        <div style={{ 
          position: 'fixed', 
          top: tooltip.y, 
          left: tooltip.x, 
          transform: tooltip.placement === 'top' 
            ? 'translate(-50%, -100%) translateY(-8px)' 
            : tooltip.x > window.innerWidth / 2 
              ? 'translateX(-100%) translateY(-50%)' 
              : 'translateX(-8px) translateY(-50%)', 
          zIndex: 9999 
        }}>
          <div className="px-2 py-1 bg-white text-black text-xs rounded border border-gray-300 shadow-lg whitespace-nowrap relative">
            {tooltip.text}
          </div>
        </div>,
        document.body
      )}
      {/* Header row with title and placement toggle button */}
      <div className="flex items-center justify-between px-2 py-1 flex-shrink-0 bg-black border-b border-white/20 h-10">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">{title}</span>
          {onModeChange == null && modeLabel != null && modeLabel !== '' && (
            <span
              className={`rounded-full border px-2 py-1 text-[11px] font-medium leading-none ${
                modeValue === 'agent'
                  ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200/80'
                  : modeValue === 'ask'
                    ? 'border-yellow-600/60 bg-yellow-900/25 text-yellow-100/95'
                    : 'border-indigo-700/60 bg-indigo-900/30 text-indigo-100/95'
              }`}
            >
              {modeLabel}
            </span>
          )}
          {onModeChange && (
            <div className="relative" ref={modeMenuRef}>
              <button
                type="button"
                onClick={() => {
                  if (modeSwitchDisabled) return;
                  setIsModeMenuOpen((prev) => !prev);
                }}
                className={`!m-0 inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] leading-none !shadow-none transition-all hover:!shadow-none ${
                  modeSwitchDisabled
                    ? 'cursor-not-allowed border-white/20 !bg-white/10 text-gray-400 opacity-60'
                    : 'border-white/30 !bg-[#20252d] text-gray-100 hover:border-white/45 hover:!bg-[#272d36]'
                }`}
                style={{ boxShadow: 'none' }}
                aria-haspopup="menu"
                aria-expanded={isModeMenuOpen}
                aria-label="Switch assistant mode"
                disabled={modeSwitchDisabled}
              >
                <span className="text-[12px] leading-none">
                  {currentModeValue === 'agent' ? <Code2 size={12} /> : null}
                  {currentModeValue === 'ask' ? <CircleHelp size={12} /> : null}
                  {currentModeValue === 'brainstorm' ? <Lightbulb size={12} /> : null}
                </span>
                <span className="font-semibold tracking-wide">{currentModeLabel}</span>
                <ChevronDown
                  size={11}
                  className={`transition-transform ${isModeMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isModeMenuOpen && !modeSwitchDisabled && (
                <div
                  className="absolute left-0 top-[calc(100%+4px)] z-20 min-w-[164px] overflow-hidden rounded-md border border-white/20 bg-[#1a1f27] p-1 shadow-2xl"
                  role="menu"
                >
                  {([
                    { value: 'agent' as const, label: 'Agent' },
                    { value: 'ask' as const, label: 'Ask' },
                    { value: 'brainstorm' as const, label: 'Brainstorm' },
                  ]).map((option) => {
                    const isSelected = currentModeValue === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`!m-0 flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-[11px] !shadow-none transition-colors duration-120 hover:!shadow-none ${
                          isSelected
                            ? '!bg-blue-500/30 text-white'
                            : 'text-gray-200 !bg-transparent hover:!bg-white/10 hover:text-white'
                        }`}
                        style={{ boxShadow: 'none' }}
                        onClick={() => {
                          onModeChange(option.value);
                          setIsModeMenuOpen(false);
                        }}
                        role="menuitemradio"
                        aria-checked={isSelected}
                      >
                        <span className="inline-flex items-center gap-2">
                          {option.value === 'agent' ? <Code2 size={12} /> : null}
                          {option.value === 'ask' ? <CircleHelp size={12} /> : null}
                          {option.value === 'brainstorm' ? <Lightbulb size={12} /> : null}
                          <span>{option.label}</span>
                        </span>
                        {isSelected && <Check size={12} className="text-blue-300" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="px-2 py-1 text-xs rounded transition-colors relative group flex-shrink-0 h-7 w-7 flex items-center justify-center bg-gray-700/50 hover:bg-gray-600 text-gray-400 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-700/50"
              onMouseEnter={(e) => showTooltip(e.currentTarget, 'Undo Edit', 'top')}
              onMouseLeave={hideTooltip}
              type="button"
              aria-label="Undo"
            >
              <Undo size={14} />
            </button>
          )}
          {onRedo && (
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="px-2 py-1 text-xs rounded transition-colors relative group flex-shrink-0 h-7 w-7 flex items-center justify-center bg-gray-700/50 hover:bg-gray-600 text-gray-400 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-700/50"
              onMouseEnter={(e) => showTooltip(e.currentTarget, 'Redo Edit', 'top')}
              onMouseLeave={hideTooltip}
              type="button"
              aria-label="Redo"
            >
              <Redo size={14} />
            </button>
          )}
          {assistantPlacement && onAssistantPlacementChange && (
            <button
              onClick={() => onAssistantPlacementChange(assistantPlacement === 'bottom' ? 'side' : 'bottom')}
              className="px-2 py-1 text-xs rounded transition-colors relative group flex-shrink-0 h-7 w-7 flex items-center justify-center bg-gray-700/50 hover:bg-gray-600 text-gray-400 hover:text-gray-300"
              onMouseEnter={(e) => showTooltip(e.currentTarget, 'Toggle layout', 'top')}
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
          )}
        </div>
      </div>
      {/* Messages area grows to fill available space */}
      <div
        ref={messagesContainerRef}
        className="w-full bg-black overflow-y-auto flex-1 min-h-0"
      >
        <div className="px-3 py-0 space-y-2">
          {renderedItems.messages.length === 0 && initialMessage != null && initialMessage !== '' && (
            <div className="py-3 text-[13px] text-gray-400">
              {initialMessage}
            </div>
          )}
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
              const isFailed = item.status === 'failed';
              const additions = item.diff?.additions ?? 0;
              const deletions = item.diff?.deletions ?? 0;
              // For failed patches, show "Failed to edit ..." without error message
              const displayText = isFailed && item.fileName ? `Failed to edit ${item.fileName}` : item.text;
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
                  ) : isFailed ? (
                    <X size={14} className="text-red-400" />
                  ) : (
                    <LoadingSpinner size="sm" color="blue" />
                  )}
                  <span className="font-medium text-gray-100"><AnimatedTerminalText text={displayText} messageId={item.id} onAnimationComplete={handleAnimationComplete} /></span>
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

            // Ask-mode (and any) assistant messages with renderMarkdown: render code blocks and markdown
            if (item.type === 'assistant' && item.renderMarkdown) {
              const comparison = parseSideBySideCodeComparison(displayText);

              if (comparison) {
                return (
                  <div
                    key={item.id}
                    className="text-[13px] text-gray-300 markdown-content assistant-markdown-content"
                    style={{ lineHeight: '1.7em' }}
                  >
                    {comparison.beforeText ? (
                      <Markdown
                        components={{
                          p: ({ node, ...props }) => <p className="my-0" {...props} />,
                          ul: ({ node, ...props }) => <ul className="my-2 pl-5 list-disc" {...props} />,
                          ol: ({ node, ...props }) => <ol className="my-2 pl-5 list-decimal" {...props} />,
                          li: ({ node, ...props }) => <li className="my-1" {...props} />,
                        }}
                      >
                        {comparison.beforeText}
                      </Markdown>
                    ) : null}

                    <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="min-w-0">
                        <p className="my-0 text-[12px] text-gray-400">Left block:</p>
                        <CodeBlockWithCopy className="bg-transparent rounded p-0 pr-0 my-0 text-[12px]">
                          <code className={`language-${comparison.leftLanguage || 'plaintext'}`}>
                            {comparison.leftCode}
                          </code>
                        </CodeBlockWithCopy>
                      </div>

                      <div className="min-w-0">
                        <p className="my-0 text-[12px] text-gray-400">Right block:</p>
                        <CodeBlockWithCopy className="bg-transparent rounded p-0 pr-0 my-0 text-[12px]">
                          <code className={`language-${comparison.rightLanguage || 'plaintext'}`}>
                            {comparison.rightCode}
                          </code>
                        </CodeBlockWithCopy>
                      </div>
                    </div>

                    {comparison.afterText ? (
                      <div className="mt-2">
                        <Markdown
                          components={{
                            p: ({ node, ...props }) => <p className="my-0" {...props} />,
                            ul: ({ node, ...props }) => <ul className="my-2 pl-5 list-disc" {...props} />,
                            ol: ({ node, ...props }) => <ol className="my-2 pl-5 list-decimal" {...props} />,
                            li: ({ node, ...props }) => <li className="my-1" {...props} />,
                          }}
                        >
                          {comparison.afterText}
                        </Markdown>
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className="text-[13px] text-gray-300 markdown-content assistant-markdown-content"
                  style={{ lineHeight: '1.7em' }}
                >
                  <Markdown
                    components={{
                      p: ({ node, ...props }) => <p className="my-0" {...props} />,
                      ul: ({ node, ...props }) => <ul className="my-2 pl-5 list-disc" {...props} />,
                      ol: ({ node, ...props }) => <ol className="my-2 pl-5 list-decimal" {...props} />,
                      li: ({ node, ...props }) => <li className="my-1" {...props} />,
                      pre: ({ node, ...props }) => (
                        <CodeBlockWithCopy className="bg-transparent rounded p-0 pr-0 my-0 text-[12px]" {...props} />
                      ),
                      code: ({ node, className, ...props }) =>
                        className ? (
                          <code className={className} {...props} />
                        ) : (
                          <code className="px-1 rounded text-[12px]" style={{ backgroundColor: '#2d2d2d', color: '#d4d4d4' }} {...props} />
                        ),
                    }}
                  >
                    {displayText}
                  </Markdown>
                </div>
              );
            }

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
      
      {shouldRenderSuggestionPane && (
        <div
          className="w-full bg-black flex justify-center px-3 py-3 flex-none border-t border-white/20"
          style={{ minHeight: 62 }}
        >
          <div className="w-full flex flex-col items-center justify-end gap-2">
            {displayedSuggestions.length > 0 && (
              <div
                className="w-full text-[12px] text-gray-200 suggestion-animate transition-opacity duration-150"
                style={{ opacity: suggestionsVisible ? 1 : 0 }}
              >
                <div className="flex flex-wrap gap-3 justify-center pt-1 pb-1">
                  {displayedSuggestions.map((suggestion, idx) => (
                    <button
                      key={`suggestion-${idx}-${suggestion}`}
                      onClick={() => handleSuggestionClickInternal(suggestion)}
                      disabled={awaitingResponse}
                      className="px-3 py-1 text-xs rounded-md bg-blue-600/10 text-blue-300 hover:bg-blue-600/20 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:bg-blue-600/10"
                      style={{ border: '1px solid rgba(96, 165, 250, 0.4)', borderStyle: 'solid', borderWidth: '1px' }}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Toolbar outside the iframe, inside the assistant terminal */}
      <div className="flex flex-col gap-2 p-2 bg-[#262b32]">
        <div className="flex gap-2 items-center w-full">
          <Bot size={16} className="flex-shrink-0 text-gray-400 self-center" />
          <div className="flex-1 relative min-w-0 flex items-center">
            {!inputValue && (
              <div className="absolute inset-0 flex items-center px-2 text-sm text-gray-400 pointer-events-none">
                Ask anything... ({isMac ? '⌘' : 'Ctrl'}+<span className="font-mono font-semibold">I</span>)
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPasteCapture={(e) => {
                if (disablePaste) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onPaste={(e) => {
                if (disablePaste) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onKeyDown={(e) => {
                if (disablePaste && (e.key === 'v' || e.key === 'V') && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.stopPropagation();
                  // Tooltip is shown by document-level paste handler when paste event would have fired
                  if (pasteDisabledTooltipTimeoutRef.current) clearTimeout(pasteDisabledTooltipTimeoutRef.current);
                  showTooltip(textareaRef.current, pasteDisabledMessage);
                  pasteDisabledTooltipTimeoutRef.current = setTimeout(() => {
                    hideTooltip();
                    pasteDisabledTooltipTimeoutRef.current = null;
                  }, 2500);
                  return;
                }
                if (awaitingResponse) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (onSubmit && inputValue.trim()) {
                    onSubmit(inputValue);
                  }
                }
              }}
              className="assistant-terminal-input w-full text-sm rounded px-2 py-1 text-white focus:outline-none resize-none overflow-y-auto disabled:text-gray-400 disabled:bg-gray-800/60 disabled:border-gray-700 disabled:cursor-not-allowed"
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
          </div>
          <button 
            ref={clearBtnRef}
            className="px-2 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors relative group flex-shrink-0 h-8 flex items-center justify-center self-center"
            onClick={onClearMessages}
            onMouseEnter={() => showTooltip(clearBtnRef.current, `Clear messages (${isMac ? '⌘' : 'Ctrl'}⌫)`)}
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
              className="px-2 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors relative group flex-shrink-0 h-8 flex items-center justify-center self-center"
              onClick={() => { onHalt?.(); }}
              type="button"
              aria-label={isMac ? "Halt (Command+D)" : "Halt (Ctrl+D)"}
              onMouseEnter={() => showTooltip(haltBtnRef.current, `Halt (${isMac ? '⌘' : 'Ctrl'}D)`)}
              onMouseLeave={hideTooltip}
            >
              <Hand size={16} />
              {/* tooltip rendered via portal */}
            </button>
          ) : (
            <button 
              ref={sendBtnRef}
              className="px-2 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors relative group flex-shrink-0 h-8 flex items-center justify-center self-center"
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


