"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import MonacoEditor from '@monaco-editor/react';
import MultiFileEditor from './MultiFileEditor';
import { MessageData } from './Message';
import { loadCurrentTask, submitCode, trackSubmitCode } from '../functions/task_logic';
import { BsExclamationTriangle, BsInfoCircle } from 'react-icons/bs';
import { Check, X, Download } from 'lucide-react';
import Markdown from 'react-markdown';
import { CodeBlockWithCopy } from './AssistantTerminalPane';
import { TestCasesPanelRef, TestResult } from './TestCasesPanel';
import { ENV } from '../config/env';
import html2canvas from 'html2canvas';
import { buildFullHTMLDocument } from '../utils/htmlBuilder';
import { useSnackbar } from './SnackbarProvider';
import LoadingSpinner from './LoadingSpinner';
import Link from 'next/link';
import { useUserStudyPopup } from './UserStudyPopup';
import { WEBSITE_REQUIREMENT_TASKS } from '../config/tasks';
import { ERROR_TRY_AGAIN } from '../utils/constants';
import { useAuth } from '../utils/auth';
import { setPlaygroundCompletedInSettings } from '../utils/userSettings';
import { downloadProjectAsRepository } from '../utils/downloadProject';

const flattenFileTree = (nodes: any[] = []): any[] => {
  const result: any[] = [];
  const queue = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.type === 'file') {
      result.push(node);
    }
    if (node.children && Array.isArray(node.children)) {
      queue.unshift(...node.children);
    }
  }
  return result;
};

const SELF_REPORT_OPTIONS = [
  "1 - Strongly disagree",
  "2 - Disagree",
  "3 - Neither agree nor disagree",
  "4 - Agree",
  "5 - Strongly agree",
];

const isSelfReportQuestionName = (questionName?: string): boolean => {
  if (!questionName) {
    return false;
  }
  return (
    questionName.startsWith('self_report_') ||
    questionName === 'sanity_check' ||
    questionName.startsWith('warmup_')
  );
};

/** Second pane: distractor questions (ui_features_distractors, function_names_distractors, css_style_distractors) */
const DISTRACTOR_PANE_QUESTION_NAMES = ['ui_features_distractors', 'function_names_distractors', 'css_style_distractors'];
/** Third pane: code block questions (identify_own_*) */
const CODE_BLOCK_PANE_QUESTION_NAMES = ['identify_own_html_component', 'identify_own_css_block', 'identify_own_js_function'];

const isBinaryChoiceQuestionType = (questionType?: string): boolean => {
  return questionType === 'mcqa' || questionType === 'code_compare';
};

const isChoiceQuestionType = (questionType?: string): boolean => {
  return isBinaryChoiceQuestionType(questionType) || questionType === 'multi_select';
};

const isFreeResponseQuestionType = (questionType?: string): boolean => {
  if (questionType === 'free_response') {
    return true;
  }
  return !questionType || !isChoiceQuestionType(questionType);
};

const normalizeMonacoLanguage = (languageHint?: string): string => {
  const normalized = (languageHint || '').toLowerCase().trim();
  if (normalized === 'js') return 'javascript';
  if (normalized === 'ts') return 'typescript';
  if (normalized === 'htm') return 'html';
  if (normalized === 'scss' || normalized === 'sass') return 'css';
  if (normalized === 'javascript' || normalized === 'typescript' || normalized === 'html' || normalized === 'css') {
    return normalized;
  }
  return 'javascript';
};

/** Compute 0-based line indices that differ between left and right (for gutter indicators). */
function computeLineDiff(leftCode: string, rightCode: string): { leftDiffLines: number[]; rightDiffLines: number[] } {
  const leftLines = leftCode.split('\n');
  const rightLines = rightCode.split('\n');
  const n = leftLines.length;
  const m = rightLines.length;
  // LCS length dp[i][j]
  const dp: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (leftLines[i - 1] === rightLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const leftDiffLines: number[] = [];
  const rightDiffLines: number[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rightDiffLines.push(j - 1);
      j--;
    } else {
      leftDiffLines.push(i - 1);
      i--;
    }
  }
  return { leftDiffLines, rightDiffLines };
}

// Helper function to convert single backticks to HTML code tags (for choices)
const convertBackticksToCode = (text: string): string => {
  if (!text) return '';
  
  // Escape HTML to prevent XSS
  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
  
  let result = escapeHtml(text);
  // Replace single backticks (`code`) with <code>code</code>
  result = result.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
  
  return result;
};

const AutoHeightCodeBlock: React.FC<{
  language: string;
  code: string;
  synchronizedHeight?: number;
  onMeasuredHeightChange?: (height: number) => void;
}> = ({ language, code, synchronizedHeight, onMeasuredHeightChange }) => {
  const editorRef = useRef<any>(null);
  const [editorHeight, setEditorHeight] = useState<number>(120);

  const updateHeight = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || typeof editor.getContentHeight !== 'function') return;

    const contentHeight = editor.getContentHeight();
    const nextHeight = Math.max(80, Math.ceil(contentHeight) + 2);

    setEditorHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    onMeasuredHeightChange?.(nextHeight);
    try {
      const layoutInfo = editor.getLayoutInfo?.();
      if (layoutInfo?.width) {
        const targetHeight = synchronizedHeight ?? nextHeight;
        editor.layout({ width: layoutInfo.width, height: targetHeight });
      }
    } catch {
      // no-op; Monaco can throw layout errors during transitional mounts
    }
  }, [onMeasuredHeightChange, synchronizedHeight]);

  useEffect(() => {
    updateHeight();
  }, [code, updateHeight]);

  return (
    <MonacoEditor
      height={`${synchronizedHeight ?? editorHeight}px`}
      language={language || 'javascript'}
      value={code}
      theme="vs-dark"
      onMount={(editor) => {
        editorRef.current = editor;
        updateHeight();
        editor.onDidContentSizeChange(() => {
          updateHeight();
        });
      }}
      options={{
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: 'on',
        wordWrap: 'on',
        automaticLayout: true,
        scrollbar: {
          vertical: 'hidden',
          horizontal: 'hidden',
          alwaysConsumeMouseWheel: false,
        },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        hover: { enabled: false },
        parameterHints: { enabled: false },
        quickSuggestions: { comments: false, other: false, strings: false },
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: 'off',
        inlayHints: { enabled: 'off' },
      }}
    />
  );
};

/** Like AutoHeightCodeBlock but shows a colored indicator on lines that differ from the other side. */
const DIFF_LINE_NUMBER_CLASS = 'comparison-diff-line-number-inline';

const AutoHeightCodeBlockWithDiffIndicators: React.FC<{
  language: string;
  code: string;
  synchronizedHeight?: number;
  onMeasuredHeightChange?: (height: number) => void;
  diffLineIndices: number[];
}> = ({ language, code, synchronizedHeight, onMeasuredHeightChange, diffLineIndices }) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const [editorHeight, setEditorHeight] = useState<number>(120);
  const diffLineSet = useMemo(() => {
    return new Set(diffLineIndices.map((lineIndex) => lineIndex + 1));
  }, [diffLineIndices]);

  const updateHeight = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || typeof editor.getContentHeight !== 'function') return;

    const contentHeight = editor.getContentHeight();
    const nextHeight = Math.max(80, Math.ceil(contentHeight) + 2);

    setEditorHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    onMeasuredHeightChange?.(nextHeight);
    try {
      const layoutInfo = editor.getLayoutInfo?.();
      if (layoutInfo?.width) {
        const targetHeight = synchronizedHeight ?? nextHeight;
        editor.layout({ width: layoutInfo.width, height: targetHeight });
      }
    } catch {
      // no-op
    }
  }, [onMeasuredHeightChange, synchronizedHeight]);

  useEffect(() => {
    updateHeight();
  }, [code, updateHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const styleId = 'comparison-diff-line-number-style';
    if (document.getElementById(styleId)) return;

    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      .monaco-editor .${DIFF_LINE_NUMBER_CLASS} {
        color: #fbbf24 !important;
        font-weight: 600 !important;
      }
    `;
    document.head.appendChild(styleEl);
  }, []);

  const applyDiffLineNumberHighlight = useCallback((editor: any, monaco: any) => {
    if (!editor) return;
    if (diffLineIndices.length === 0) {
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
      return;
    }

    const decorations = diffLineIndices.map((lineIndex) => ({
      range: new monaco.Range(lineIndex + 1, 1, lineIndex + 1, 1),
      options: {
        isWholeLine: true,
        lineNumberClassName: DIFF_LINE_NUMBER_CLASS,
      },
    }));
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [diffLineIndices]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor && monaco) {
      applyDiffLineNumberHighlight(editor, monaco);
    }
  }, [applyDiffLineNumberHighlight]);

  return (
    <MonacoEditor
      height={`${synchronizedHeight ?? editorHeight}px`}
      language={language || 'javascript'}
      value={code}
      theme="vs-dark"
      onMount={(editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        updateHeight();
        editor.onDidContentSizeChange(() => {
          updateHeight();
        });
        applyDiffLineNumberHighlight(editor, monaco);
      }}
      options={{
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: (lineNumber: number) => (diffLineSet.has(lineNumber) ? `🔸 ${lineNumber}` : `${lineNumber}`),
        lineNumbersMinChars: 6,
        wordWrap: 'on',
        automaticLayout: true,
        scrollbar: {
          vertical: 'hidden',
          horizontal: 'hidden',
          alwaysConsumeMouseWheel: false,
        },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        hover: { enabled: false },
        parameterHints: { enabled: false },
        quickSuggestions: { comments: false, other: false, strings: false },
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: 'off',
        inlayHints: { enabled: 'off' },
      }}
    />
  );
};

// Component to render text with code blocks as Monaco editors
const TextWithCodeBlocks: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const [sideBySideHeights, setSideBySideHeights] = useState<{
    left?: number;
    right?: number;
  }>({});

  useEffect(() => {
    setSideBySideHeights({});
  }, [text]);

  const sideBySideSharedHeight = useMemo(() => {
    const measuredHeights = [sideBySideHeights.left, sideBySideHeights.right].filter(
      (height): height is number => typeof height === 'number'
    );
    if (measuredHeights.length === 0) return undefined;
    return Math.max(...measuredHeights);
  }, [sideBySideHeights.left, sideBySideHeights.right]);

  const sideBySideComparisonMatch = text.match(
    /^([\s\S]*?)Left block:\s*```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```\s*Right block:\s*```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```([\s\S]*)$/i
  );

  if (sideBySideComparisonMatch) {
    const [, beforeText, leftLanguageRaw, leftCodeRaw, rightLanguageRaw, rightCodeRaw, afterText] =
      sideBySideComparisonMatch;

    const leftTrimmed = leftCodeRaw.trim();
    const rightTrimmed = rightCodeRaw.trim();
    const { leftDiffLines, rightDiffLines } = computeLineDiff(leftTrimmed, rightTrimmed);

    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const renderTextSection = (content: string, key: string) => {
      const trimmed = content.trim();
      if (!trimmed) return null;
      const processedText = escapeHtml(trimmed).replace(/`([^`\n]+?)`/g, '<code>$1</code>');
      return (
        <span
          key={key}
          className="markdown-content"
          style={{ display: 'inline' }}
          dangerouslySetInnerHTML={{ __html: processedText }}
        />
      );
    };

    const renderCodePanel = (
      panelKey: 'left' | 'right',
      label: string,
      languageRaw: string | undefined,
      codeRaw: string,
      diffLineIndices: number[]
    ) => (
      <div key={panelKey} style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>{label}</div>
        <div style={{ border: '1px solid #4b5563', borderRadius: '6px', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}>
          <AutoHeightCodeBlockWithDiffIndicators
            language={normalizeMonacoLanguage(languageRaw)}
            code={codeRaw.trim()}
            synchronizedHeight={sideBySideSharedHeight}
            onMeasuredHeightChange={(height) => {
              setSideBySideHeights((prev) =>
                prev[panelKey] === height ? prev : { ...prev, [panelKey]: height }
              );
            }}
            diffLineIndices={diffLineIndices}
          />
        </div>
      </div>
    );

    return (
      <>
        {renderTextSection(beforeText, 'comparison-before')}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 my-2">
          {renderCodePanel('left', 'Left block:', leftLanguageRaw, leftCodeRaw, leftDiffLines)}
          {renderCodePanel('right', 'Right block:', rightLanguageRaw, rightCodeRaw, rightDiffLines)}
        </div>
        {renderTextSection(afterText, 'comparison-after')}
      </>
    );
  }
  
  // Split text by triple backticks
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const tripleBacktickRegex = /```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = tripleBacktickRegex.exec(text)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      const textContent = text.substring(lastIndex, match.index);
      if (textContent) {
        parts.push({ type: 'text', content: textContent });
      }
    }
    
    // Add code block
    parts.push({
      type: 'code',
      content: (match[2] || '').trim(),
      language: normalizeMonacoLanguage(match[1]),
    });
    lastIndex = tripleBacktickRegex.lastIndex;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    const textContent = text.substring(lastIndex);
    if (textContent) {
      parts.push({ type: 'text', content: textContent });
    }
  }
  
  // If no code blocks found, just return the text with single backticks converted
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text });
  }
  
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <div key={`code-${index}`} style={{ margin: '8px 0', border: '1px solid #4b5563', borderRadius: '6px', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}>
              <AutoHeightCodeBlock
                language={part.language || 'javascript'}
                code={part.content}
              />
            </div>
          );
        } else {
          // Process single backticks in text
          const escapeHtml = (str: string) => {
            return str
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          };
          
          let processedText = escapeHtml(part.content);
          processedText = processedText.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
          
          return (
            <span
              key={`text-${index}`}
              className="markdown-content"
              style={{ display: 'inline' }}
              dangerouslySetInnerHTML={{ __html: processedText }}
            />
          );
        }
      })}
    </>
  );
};

interface CodingEditorProps {
  // Editor props
  onEditorMount: (editor: any, monaco: any) => void;
  contextLength: number;
  wait_time_for_sug: number;
  setSuggestionIdx: React.Dispatch<React.SetStateAction<number>>;
  setTelemetry: React.Dispatch<React.SetStateAction<any[]>>;
  modelAutocomplete: string;
  endpointsNeedRefresh?: boolean;
  onEndpointsRefreshed?: () => void;
  taskIndex: number;
  setLogprobsCompletion: React.Dispatch<React.SetStateAction<any>>;
  logProbs: any;
  suggestionIdx: number;
  messageAIIndex: number;
  setIsSpinning: React.Dispatch<React.SetStateAction<boolean>>;
  proactive_refresh_time_inactive: number;
  chatRef: any;
  actualEditorRef: any;
  // TaskBar props
  setTaskDescriptions: React.Dispatch<React.SetStateAction<string[]>>;
  setFunctionSignatures: React.Dispatch<React.SetStateAction<string[]>>;
  setUnitTests: React.Dispatch<React.SetStateAction<string[]>>;
  setExpCondition: React.Dispatch<React.SetStateAction<string>>;
  setModel: React.Dispatch<React.SetStateAction<string>>;
  setMaxTokensTask: React.Dispatch<React.SetStateAction<number>>;
  editor: any;
  unit_tests: string[];
  setMessages: React.Dispatch<React.SetStateAction<MessageData[]>>;
  exp_condition: string;
  response_id: string;
  worker_id: string;
  setTaskIndex: React.Dispatch<React.SetStateAction<number>>;
  function_signatures: string[];
  task_id: string;
  telemetry: any[];
  skipTime: any;
  // Resize props
  editorHeight: number;
  onEditorMouseDown: (e: React.MouseEvent) => void;
  // Code props
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  // Multi-file support
  enableMultiFile?: boolean;
  initialFiles?: any[];
  readOnlyFiles?: boolean;
  // Test cases
  testCases?: any[];
  // Pane visibility
  showCodeEditor?: boolean;
  showTerminal?: boolean;
  onHideCodeEditor?: () => void;
  onHideTerminal?: () => void;
  onShowCodeEditor?: () => void;
  onShowTerminal?: () => void;
  // File change callbacks
  onFileContentChange?: () => void;
  onSaveShortcut?: (fileId?: string) => void;
  // Assistant placement (optional bottom rendering)
  assistantPlacement?: 'bottom' | 'side';
  showAIAssistantForBottom?: boolean;
  renderAssistantPane?: () => JSX.Element;
  // Assistant visibility for button styling when placement is bottom
  isAIAssistantVisible?: boolean;
  // Agent changes for diff view
  pendingAgentChanges?: any;
  onAcceptAgentChanges?: (fileType?: string, content?: string, action?: 'keep' | 'reject') => void;
  onRejectAgentChanges?: () => void;
  projectId?: number | null;
  userId?: number | null;
  taskName?: string | null;
  taskLabel?: string | null;
  assistantPromptCountRef?: React.MutableRefObject<number>;
  taskRequirements?: string[];
  aiAssistantMode?: 'agent' | 'ask' | 'brainstorm';
  // Sidebar state for modal positioning
  sidebarOpen?: boolean;
  // Callback when project is successfully submitted
  onProjectSubmitted?: () => void | Promise<void>;
  // Callback when comprehension question generation starts
  onQuestionsGenerationStarted?: (metadata?: Record<string, any>) => void | Promise<void>;
  // Callback when comprehension question generation completes (success/failure)
  onQuestionsGenerationCompleted?: (metadata?: Record<string, any>) => void | Promise<void>;
  // Callback when user continues from submission form into questions pane
  onContinuedToQuestions?: (metadata?: Record<string, any>) => void | Promise<void>;
  // Callback when required-task submit confirmation ("Continue") is clicked
  onRequiredTaskSubmitContinue?: () => void;
  // Loading state for files
  isLoadingFiles?: boolean;
  // Callback to expose project title and description to parent
  onProjectInfoChange?: (title: string, description: string) => void;
  // Callback to notify parent when submission questions pane opens/closes
  onSubmissionQuestionsVisibilityChange?: (isOpen: boolean) => void;
  // Prevent users from dismissing the submit modal manually
  lockSubmitModalExit?: boolean;
}

const CodingEditor: React.FC<CodingEditorProps> = ({
  onEditorMount,
  contextLength,
  wait_time_for_sug,
  setSuggestionIdx,
  setTelemetry,
  modelAutocomplete,
  endpointsNeedRefresh,
  onEndpointsRefreshed,
  taskIndex,
  setLogprobsCompletion,
  logProbs,
  suggestionIdx,
  messageAIIndex,
  setIsSpinning,
  proactive_refresh_time_inactive,
  chatRef,
  actualEditorRef,
  setTaskDescriptions,
  setFunctionSignatures,
  setUnitTests,
  setExpCondition,
  setModel,
  setMaxTokensTask,
  editor,
  unit_tests,
  setMessages,
  exp_condition,
  response_id,
  worker_id,
  setTaskIndex,
  function_signatures,
  task_id,
  telemetry,
  skipTime,
  editorHeight,
  onEditorMouseDown,
  code,
  setCode,
  enableMultiFile = false,
  initialFiles,
  readOnlyFiles = false,
  testCases = [],
  showCodeEditor = true,
  showTerminal = true,
  onHideCodeEditor,
  onHideTerminal,
  onShowCodeEditor,
  onShowTerminal,
  onFileContentChange,
  onSaveShortcut,
  assistantPlacement,
  showAIAssistantForBottom,
  renderAssistantPane,
  isAIAssistantVisible,
  pendingAgentChanges,
  onAcceptAgentChanges,
  onRejectAgentChanges,
  projectId,
  userId,
  taskName,
  taskLabel,
  assistantPromptCountRef,
  taskRequirements = [],
  aiAssistantMode = 'ask',
  sidebarOpen = false,
  onProjectSubmitted,
  onQuestionsGenerationStarted,
  onQuestionsGenerationCompleted,
  onContinuedToQuestions,
  onRequiredTaskSubmitContinue,
  isLoadingFiles = false,
  onProjectInfoChange,
  onSubmissionQuestionsVisibilityChange,
  lockSubmitModalExit = false,
}: CodingEditorProps) => {
  const { showSnackbar } = useSnackbar();
  const { recalculateState } = useUserStudyPopup();
  const { user, token, refreshUser } = useAuth();
  const studyEnded = false;
  const [output, setOutput] = useState(
    "Output will be shown here when Run is pressed."
  );
  const [showTimer, setShowTimer] = useState(false);
  const [backendCode, setBackendCode] = useState<string>('');
  const [terminalTab, setTerminalTab] = useState<'output' | 'api' | 'preview'>('output');
  const [testCaseType, setTestCaseType] = useState<'frontend' | 'backend' | 'html'>('frontend');
  const [testCasesPassed, setTestCasesPassed] = useState({
    frontend: { passed: 0, total: 3 },
    backend: { passed: 0, total: 2 },
    html: { passed: 0, total: 1 }
  });
  const [, setShouldRefreshEndpoints] = useState(false);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<any | null>(null);
  const [previewContent, setPreviewContent] = useState<{
    html: string;
    css: string;
    js: string;
  }>({ html: '', css: '', js: '' });
  const [showDebugTerminal, setShowDebugTerminal] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const debugIframeRef = useRef<HTMLIFrameElement>(null);
  
  // Assistant side panel state
  const [assistantSideWidth, setAssistantSideWidth] = useState(400);
  const [isAssistantResizing, setIsAssistantResizing] = useState(false);
  
  // Safely stringify complex objects (circular refs, functions, DOM nodes)
  const safeStringify = useCallback((value: any): string => {
    try {
      if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`;
      }
      // DOM Node
      if (typeof Node !== 'undefined' && value instanceof Node) {
        const el = value as Element;
        return (el && (el as any).outerHTML) || `[${value.nodeName}]`;
      }
      const seen = new WeakSet();
      return JSON.stringify(
        value,
        (key, val) => {
          if (typeof val === 'bigint') return `${val.toString()}n`;
          if (typeof val === 'symbol') return `[Symbol ${val.description || ''}]`;
          if (val instanceof Date) return val.toISOString();
          if (val instanceof Map) return { __type: 'Map', entries: Array.from(val.entries()) };
          if (val instanceof Set) return { __type: 'Set', values: Array.from(val.values()) };
          if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
          }
          if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
          return val;
        },
        2
      );
    } catch (e) {
      try { return String(value); } catch { return '[Unserializable]'; }
    }
  }, []);

  const escapeHtml = useCallback((text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }, []);
  
  // Function to scroll the debug console to the bottom
  const scrollDebugConsoleToBottom = useCallback(() => {
    if (debugIframeRef.current) {
      try {
        const iframe = debugIframeRef.current;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.documentElement.scrollTop = iframeDoc.documentElement.scrollHeight;
        }
      } catch (error) {
        // Ignore cross-origin errors or other iframe access issues
      }
    }
  }, []);

  // Auto-scroll to bottom when new debug logs are added
  useEffect(() => {
    if (debugLogs.length > 0) {
      // Small delay to ensure the DOM is updated before scrolling
      setTimeout(() => {
        scrollDebugConsoleToBottom();
      }, 10);
    }
  }, [debugLogs, scrollDebugConsoleToBottom]);
  
  // Load confetti script dynamically
  useEffect(() => {
    const checkAndLoadConfetti = () => {
      if (typeof window !== 'undefined') {
        // Check if already loaded
        if ((window as any).confetti) {
          setConfettiReady(true);
          return;
        }
        
        // Try to load canvas-confetti which is simpler and more reliable
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
        script.async = true;
        script.onload = () => {
          setTimeout(() => {
            if ((window as any).confetti) {
              setConfettiReady(true);
            }
          }, 100);
        };
        document.head.appendChild(script);
      }
    };
    
    checkAndLoadConfetti();
  }, []);
  
  // State for console divider
  const [consoleDividerWidth, setConsoleDividerWidth] = useState<number>(66); // Default 66% preview, 34% console (within 25%-75% bounds)
  const [isConsoleDividerResizing, setIsConsoleDividerResizing] = useState<boolean>(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const testCasesPanelRef = useRef<TestCasesPanelRef>(null);
  const [selectedTestsCount, setSelectedTestsCount] = useState(0);
  const [isTestsRunning, setIsTestsRunning] = useState(false);
  const [allTestsPassed, setAllTestsPassed] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const PROJECT_TITLE_LIMIT = 80;
  const PROJECT_DESCRIPTION_LIMIT = 500;
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectTitleError, setProjectTitleError] = useState<string | null>(null);
  const [projectDescriptionError, setProjectDescriptionError] = useState<string | null>(null);
  const [implementedRequirements, setImplementedRequirements] = useState<Record<string, boolean>>({});
  const [requirementsComments, setRequirementsComments] = useState('');
  const [requirementsCommentsError, setRequirementsCommentsError] = useState<string | null>(null);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [isCheckingModeration, setIsCheckingModeration] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<{ id: number; title: string; description: string | null; createdAt: string | null } | null>(null);
  const [isCheckingExistingSubmission, setIsCheckingExistingSubmission] = useState(false);
  const [hasConsentedToOverride, setHasConsentedToOverride] = useState(false);
  const [showComprehensionCheck, setShowComprehensionCheck] = useState(false);
  /** For required tasks: 'distractors' = second pane, 'code_block' = third pane */
  const [comprehensionSubPane, setComprehensionSubPane] = useState<'distractors' | 'code_block'>('distractors');
  const [showEvaluationCheck, setShowEvaluationCheck] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{
    is_valid: boolean;
    explanation: string;
  } | null>(null);
  const [evaluationId, setEvaluationId] = useState<number | null>(null);
  const [isLoadingEvaluation, setIsLoadingEvaluation] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [comprehensionAnswers, setComprehensionAnswers] = useState<Record<string, string>>({});
  const [comprehensionQuestions, setComprehensionQuestions] = useState<Array<{
    id: string;
    question_name?: string;
    question: string;
    question_type: string;
    choices?: string[];
    answer?: string | number | number[];
  }>>([]);
  const [isLoadingComprehensionQuestions, setIsLoadingComprehensionQuestions] = useState(false);
  const [comprehensionQuestionsError, setComprehensionQuestionsError] = useState<string | null>(null);
  const [comprehensionQuestionsWarnings, setComprehensionQuestionsWarnings] = useState<string[]>([]);
  const [answersChecked, setAnswersChecked] = useState(false);
  const [showRequiredTaskSubmitConfirm, setShowRequiredTaskSubmitConfirm] = useState(false);
  const [showLowEngagementReminder, setShowLowEngagementReminder] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipText, setTooltipText] = useState("");
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const [tooltipTop, setTooltipTop] = useState(0);
  const [tooltipPlaceAbove, setTooltipPlaceAbove] = useState(true);
  const isRequiredTask = Boolean(!studyEnded && taskName && WEBSITE_REQUIREMENT_TASKS.includes(taskName as any));
  const isSubmissionQuestionsPersistentTask = Boolean(
    taskName && WEBSITE_REQUIREMENT_TASKS.includes(taskName as any)
  );
  const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
  const isWarmupTask = taskName === 'website_tutorial_intro' || taskName === 'website_tutorial_follow_up';
  const isSecondWarmupTask = taskName === 'website_tutorial_follow_up';
  const submissionQuestionsStorageKey = useMemo(() => {
    if (!isSubmissionQuestionsPersistentTask) {
      return null;
    }
    if (typeof projectId !== 'number' || Number.isNaN(projectId)) {
      return null;
    }
    return `submission-questions-open:${projectId}`;
  }, [isSubmissionQuestionsPersistentTask, projectId]);
  const restoredSubmissionQuestionsKeyRef = useRef<string | null>(null);
  /** When we re-open the submit modal from localStorage (user came back), skip auto question generation so we don't run before HTML/code is ready. */
  const submitModalOpenedFromRestoreRef = useRef(false);
  const submissionQuestionsScrollRef = useRef<HTMLDivElement>(null);
  const shouldRequireInitialSubmitConfirmation = Boolean(
    taskName && WEBSITE_REQUIREMENT_TASKS.includes(taskName as any) && !isWarmupTask
  );
  const modalContextSuffix = isWarmupTask ? ' (Warm-Up)' : isTutorialTask ? ' (Tutorial)' : '';
  const selfReportQuestions = useMemo(
    () => comprehensionQuestions.filter((q) => isSelfReportQuestionName(q.question_name)),
    [comprehensionQuestions]
  );
  const codeTailoredQuestions = useMemo(
    () => comprehensionQuestions.filter((q) => !isSelfReportQuestionName(q.question_name)),
    [comprehensionQuestions]
  );
  const distractorPaneQuestions = useMemo(
    () => codeTailoredQuestions.filter((q) => q.question_name && DISTRACTOR_PANE_QUESTION_NAMES.includes(q.question_name)),
    [codeTailoredQuestions]
  );
  const codeBlockPaneQuestions = useMemo(
    () => codeTailoredQuestions.filter((q) => q.question_name && CODE_BLOCK_PANE_QUESTION_NAMES.includes(q.question_name)),
    [codeTailoredQuestions]
  );
  /** For required task: questions on current sub-pane (second = distractors, third = code block). For non-required: all comprehension questions. */
  const comprehensionPaneQuestions = useMemo(() => {
    if (!isRequiredTask) {
      return comprehensionQuestions;
    }
    if (comprehensionSubPane === 'code_block') {
      return codeBlockPaneQuestions;
    }
    return distractorPaneQuestions;
  }, [isRequiredTask, comprehensionSubPane, comprehensionQuestions, distractorPaneQuestions, codeBlockPaneQuestions]);
  const unansweredSelfReportCount = selfReportQuestions.filter((q) => {
    if (q.question_type === 'multi_select') {
      return false;
    }
    return !comprehensionAnswers[q.id]?.trim();
  }).length;
  
  const trimmedProjectTitleLength = projectTitle.trim().length;
  const trimmedProjectDescriptionLength = projectDescription.trim().length;
  const trimmedRequirementsCommentsLength = requirementsComments.trim().length;
  const implementedRequirementCount = Object.values(implementedRequirements).filter(Boolean).length;
  const isSubmitDisabled = !!(
    isSubmittingProject ||
    isCheckingModeration ||
    (!isRequiredTask && isScreenshotLoading) ||
    isCheckingExistingSubmission ||
    (
      isRequiredTask
        ? false
        : (!trimmedProjectTitleLength || !trimmedProjectDescriptionLength || !previewScreenshot)
    ) ||
    (existingSubmission && !hasConsentedToOverride)
  );
  const isFirstPaneActionDisabled = !!(
    isSubmitDisabled ||
    isSubmittingProject ||
    isCheckingModeration ||
    isCheckingExistingSubmission ||
    isLoadingComprehensionQuestions ||
    (isRequiredTask && comprehensionQuestions.length === 0 && !comprehensionQuestionsError) ||
    (isRequiredTask && comprehensionQuestions.length > 0 && unansweredSelfReportCount > 0)
  );
  const shouldShowRegenerateOnly = Boolean(comprehensionQuestionsError) && !isLoadingComprehensionQuestions;
  const formattedComprehensionQuestionsError = comprehensionQuestionsError
    ? `${comprehensionQuestionsError}. Try hitting regenerate again. If the problem persists, please contact nbalepur@umd.edu`
    : null;
  const titleInputId = 'submit-project-title';
  const descriptionInputId = 'submit-project-description';
  const isProjectTitleAtCap = trimmedProjectTitleLength >= PROJECT_TITLE_LIMIT;
  const isProjectDescriptionAtCap = trimmedProjectDescriptionLength >= PROJECT_DESCRIPTION_LIMIT;
  const previewBoxContainerRef = useRef<HTMLDivElement>(null);
  const [previewBoxSize, setPreviewBoxSize] = useState<{ width: number; height: number }>({ width: 480, height: 270 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assistantMessages, setAssistantMessages] = useState([
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
  ]);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [overriddenTestsCount, setOverriddenTestsCount] = useState(0);
  const [confettiReady, setConfettiReady] = useState(false);
  
  // Update overridden test count whenever test results change
  useEffect(() => {
    const overrideCount = Array.from(testResults.values()).filter(result => result.isOverridden).length;
    setOverriddenTestsCount(overrideCount);
  }, [testResults]);

  // Memoized content retrieval functions to prevent infinite re-renders
  const getHtmlContent = useCallback(() => {
    // Always try to get HTML from editor first (works in both single and multi-file mode)
    if (actualEditorRef?.current?.getAllFileContents) {
      try {
        const allContents = actualEditorRef.current.getAllFileContents();
        
        // Look for index.html or any .html file
        const htmlFile = Object.entries(allContents).find(([id, content]) => 
          id.toLowerCase().endsWith('.html') || id.toLowerCase() === 'index.html'
        );
        
        if (htmlFile && String(htmlFile[1]).trim()) {
          return String(htmlFile[1]);
        }
      } catch (error) {
        console.warn('Failed to get HTML from editor:', error);
      }
    }
    
    // Fallback to preview content only if editor content not found
    return previewContent.html || '';
  }, [actualEditorRef, enableMultiFile, showCodeEditor, previewContent.html]);

  const getCssContent = useCallback(() => {
    // Always try to get CSS from editor first (works in both single and multi-file mode)
    if (actualEditorRef?.current?.getAllFileContents) {
      try {
        const allContents = actualEditorRef.current.getAllFileContents();
        
        // Look for index.css or any .css file
        const cssFile = Object.entries(allContents).find(([id, content]) => 
          id.toLowerCase().endsWith('.css') || id.toLowerCase() === 'index.css'
        );
        
        if (cssFile && String(cssFile[1]).trim()) {
          return String(cssFile[1]);
        }
      } catch (error) {
        console.warn('Failed to get CSS from editor:', error);
      }
    }
    
    // Fallback to preview content only if editor content not found
    return previewContent.css || '';
  }, [actualEditorRef, previewContent.css]);

  const getJsContent = useCallback(() => {
    // Always try to get JS from editor first (works in both single and multi-file mode)
    if (actualEditorRef?.current?.getAllFileContents) {
      try {
        const allContents = actualEditorRef.current.getAllFileContents();
        
        // Look for index.js or any .js file
        const jsFile = Object.entries(allContents).find(([id, content]) => 
          id.toLowerCase().endsWith('.js') || id.toLowerCase() === 'index.js'
        );
        
        if (jsFile && String(jsFile[1]).trim()) {
          return String(jsFile[1]);
        }
      } catch (error) {
        console.warn('Failed to get JS from editor:', error);
      }
    }
    
    // Fallback to preview content only if editor content not found
    return previewContent.js || '';
  }, [actualEditorRef, previewContent.js]);

  const handleTestResultsChange = useCallback((results: TestResult[]) => {

    if (!results || results.length === 0) {
      setTestResults(new Map());
      return;
    }

    const resultsMap = new Map<string, TestResult>();
    results.forEach(result => {
      resultsMap.set(result.testName, result);
    });

    setTestResults(resultsMap);
  }, []);

  // Debug editor mount
  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    onEditorMount(editor, monaco);
  }, [onEditorMount]);

  // Note: Removed the useEffect that was forcing 50/50 split to allow random width initialization
  
  // Console divider resize handlers (following the same pattern as main page.tsx)
  const handleConsoleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsConsoleDividerResizing(true);
  };

  const handleConsoleDividerMouseMove = (e: MouseEvent) => {
    if (!isConsoleDividerResizing) return;
    
    // Use the ref to get the container, with fallback to querySelector
    const container = previewContainerRef.current || document.querySelector('.preview-container.with-debug') as HTMLElement;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    // Always use clientX relative to the viewport, regardless of event source
    const viewportX = e.clientX;
    const relativeX = viewportX - rect.left;
    const percentage = Math.max(25, Math.min(75, (relativeX / rect.width) * 100));
    
    // Debug logging removed for performance
    setConsoleDividerWidth(percentage);
  };

  const handleConsoleDividerMouseUp = () => {
    setIsConsoleDividerResizing(false);
  };

  // React event handlers for the overlay
  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    const mouseEvent = e.nativeEvent;
    handleConsoleDividerMouseMove(mouseEvent);
  };

  const handleOverlayMouseUp = (e: React.MouseEvent) => {
    const mouseEvent = e.nativeEvent;
    handleConsoleDividerMouseUp();
  };

  // Assistant side panel resize handlers
  const handleAssistantSideMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsAssistantResizing(true);
  };

  const handleAssistantSideMouseMove = (e: MouseEvent) => {
    if (!isAssistantResizing) return;
    
    // Get the container width (use the main editor container if available)
    const container = document.querySelector('.coding-editor');
    const containerRect = container ? container.getBoundingClientRect() : null;
    const containerWidth = containerRect ? containerRect.width : window.innerWidth;
    const containerLeft = containerRect ? containerRect.left : 0;
    
    // Minimum editor width (ensure editor is always visible)
    const minEditorWidth = 400;
    
    // Assistant panel constraints
    const minWidth = 300;
    const maxWidth = containerWidth - minEditorWidth;
    
    // Calculate width from right edge of container
    const rightEdgeX = containerLeft + containerWidth;
    const newWidth = rightEdgeX - e.clientX;
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    
    setAssistantSideWidth(clampedWidth);
  };

  const handleAssistantSideMouseUp = () => {
    setIsAssistantResizing(false);
  };

  // Add global mouse event listeners for assistant side panel resizing
  useEffect(() => {
    if (isAssistantResizing) {
      document.addEventListener('mousemove', handleAssistantSideMouseMove, { passive: false });
      document.addEventListener('mouseup', handleAssistantSideMouseUp, { passive: false });
      return () => {
        document.removeEventListener('mousemove', handleAssistantSideMouseMove);
        document.removeEventListener('mouseup', handleAssistantSideMouseUp);
      };
    }
  }, [isAssistantResizing]);

  // Add global mouse event listeners for console divider resizing
  useEffect(() => {
    if (isConsoleDividerResizing) {
      // Add listeners to document with passive: false to ensure we get all events
      document.addEventListener('mousemove', handleConsoleDividerMouseMove, { passive: false });
      document.addEventListener('mouseup', handleConsoleDividerMouseUp, { passive: false });
      
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleConsoleDividerMouseMove);
      document.removeEventListener('mouseup', handleConsoleDividerMouseUp);
      
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleConsoleDividerMouseMove);
      document.removeEventListener('mouseup', handleConsoleDividerMouseUp);
      
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isConsoleDividerResizing]);


  // Watch for refresh trigger from parent
  useEffect(() => {
    if (endpointsNeedRefresh) {
      setShouldRefreshEndpoints(true);
      if (onEndpointsRefreshed) {
        onEndpointsRefreshed();
      }
    }
  }, [endpointsNeedRefresh, onEndpointsRefreshed]);

  // Enhanced compilation validation using actual parsers
  const validateHTML = (content: string, fileName: string) => {
    const errors: Array<{file: string; type: 'error' | 'warning'; message: string; line?: number}> = [];
    
    try {
      // Use DOMParser for HTML validation
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      
      // Check for parsing errors
      const parserErrors = doc.querySelectorAll('parsererror');
      if (parserErrors.length > 0) {
        parserErrors.forEach((error, index) => {
          errors.push({
            file: fileName,
            type: 'error',
            message: `HTML parsing error: ${error.textContent || 'Invalid HTML structure'}`,
            line: index + 1
          });
        });
      }

      // Check for basic structure
      if (!content.includes('<html') && !content.includes('<!DOCTYPE')) {
        errors.push({
          file: fileName,
          type: 'warning',
          message: 'HTML file should contain <html> tag or DOCTYPE declaration'
        });
      }

    } catch (error) {
      errors.push({
        file: fileName,
        type: 'error',
        message: `HTML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    return errors;
  };

  const validateCSS = (content: string, fileName: string) => {
    const errors: Array<{file: string; type: 'error' | 'warning'; message: string; line?: number}> = [];
    
    try {
      // Create a temporary style element to validate CSS
      const style = document.createElement('style');
      style.textContent = content;
      
      // Try to parse CSS by adding to document temporarily
      const testDiv = document.createElement('div');
      testDiv.style.cssText = content;
      
      // Check for unclosed braces
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      
      if (openBraces !== closeBraces) {
        errors.push({
          file: fileName,
          type: 'error',
          message: `Mismatched braces: ${openBraces} open, ${closeBraces} closed`
        });
      }

      // Check for common CSS syntax issues
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        // Check for missing semicolons in property declarations
        if (trimmedLine.includes(':') && !trimmedLine.includes(';') && 
            !trimmedLine.includes('{') && !trimmedLine.includes('}') && 
            !trimmedLine.startsWith('/*') && !trimmedLine.startsWith('*') && 
            !trimmedLine.startsWith('//') && trimmedLine.length > 0) {
          errors.push({
            file: fileName,
            type: 'warning',
            message: `Missing semicolon on line ${index + 1}`,
            line: index + 1
          });
        }
      });

    } catch (error) {
      errors.push({
        file: fileName,
        type: 'error',
        message: `CSS parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    return errors;
  };

  const validateJavaScript = (content: string, fileName: string) => {
    const errors: Array<{file: string; type: 'error' | 'warning'; message: string; line?: number}> = [];
    
    try {
      // Skip bracket/brace checking for JavaScript - iframe will catch syntax errors
      // This prevents duplicate error messages since the iframe handles syntax errors

      // Check for common JavaScript syntax issues
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        // Check for missing semicolons in variable declarations
        if ((trimmedLine.startsWith('let ') || trimmedLine.startsWith('const ') || trimmedLine.startsWith('var ')) && 
            !trimmedLine.includes(';') && !trimmedLine.includes('{') && 
            !trimmedLine.startsWith('//') && trimmedLine.length > 0) {
          errors.push({
            file: fileName,
            type: 'warning',
            message: `Missing semicolon on line ${index + 1}`,
            line: index + 1
          });
        }
        
        // Check for obvious syntax errors like random text after functions
        if (trimmedLine.match(/}\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*$/) || 
            trimmedLine.match(/}\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/) ||
            trimmedLine.match(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*asdasds/)) {
          errors.push({
            file: fileName,
            type: 'error',
            message: `Invalid syntax on line ${index + 1}: "${trimmedLine}"`,
            line: index + 1
          });
        }
      });

    } catch (error) {
      errors.push({
        file: fileName,
        type: 'error',
        message: `JavaScript parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    return errors;
  };

  const validatePython = async (content: string, fileName: string) => {
    const errors: Array<{file: string; type: 'error' | 'warning'; message: string; line?: number}> = [];
    
    try {
      // Use the backend API to validate Python syntax
      const response = await fetch(`${ENV.BACKEND_URL}/api/validate-python`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pythonCode: content
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        // Parse error messages and line numbers
        const errorLines = data.error.split('\n');
        errorLines.forEach((line: string) => {
          if (line.trim() && !line.includes('Traceback')) {
            const lineMatch = line.match(/line (\d+)/);
            const lineNumber = lineMatch ? parseInt(lineMatch[1]) : undefined;
            
            errors.push({
              file: fileName,
              type: 'error',
              message: line.trim(),
              line: lineNumber
            });
          }
        });
      }

    } catch (error) {
      // Fallback to basic validation if API is not available
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/\]/g) || []).length;
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;

      if (openParens !== closeParens) {
        errors.push({
          file: fileName,
          type: 'error',
          message: `Mismatched parentheses: ${openParens} open, ${closeParens} closed`
        });
      }

      if (openBrackets !== closeBrackets) {
        errors.push({
          file: fileName,
          type: 'error',
          message: `Mismatched brackets: ${openBrackets} open, ${closeBrackets} closed`
        });
      }

      if (openBraces !== closeBraces) {
        errors.push({
          file: fileName,
          type: 'error',
          message: `Mismatched braces: ${openBraces} open, ${closeBraces} closed`
        });
      }
    }

    return errors;
  };

  // Function to open preview in new tab
  const openPreviewInNewTab = () => {
    if (!previewContent.html && !previewContent.css && !previewContent.js) {
      alert('No preview content available. Please generate a preview first.');
      return;
    }

    // Open in new tab (no window features parameter)
    const newWindow = window.open('', '_blank');
    
    if (!newWindow) {
      alert('Please allow popups for this site to open the preview in a new tab.');
      return;
    }

    // Build the complete HTML document (same sanitization as PreviewIframe)
    const sanitizeHtml = (html: string): string => {
      // Minimal sanitization to avoid breaking isolation
      return html;
    };

    const sanitizeCss = (css: string): string => {
      // Minimal CSS sanitization
      return css
        .replace(/@import[^;]+;/gi, '')
        .replace(/behavior\s*:/gi, '')
        .replace(/binding\s*:/gi, '');
    };

    const sanitizeJs = (js: string): string => {
      // Minimal JS sanitization to preserve functionality; rely on iframe sandbox for isolation
      return js
        .replace(/window\.parent/gi, '')
        .replace(/window\.top/gi, '')
        .replace(/parent\./gi, '')
        .replace(/top\./gi, '');
    };

    const sanitizedHtml = sanitizeHtml(previewContent.html || '');
    const sanitizedCss = sanitizeCss(previewContent.css || '');
    const sanitizedJs = sanitizeJs(previewContent.js || '');
    
    let fullHtml = '';
    
    if (sanitizedHtml) {
      if (sanitizedHtml.includes('<html') || sanitizedHtml.includes('<!DOCTYPE')) {
        fullHtml = sanitizedHtml;
      } else {
        fullHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Website Preview</title>
          </head>
          <body>
            ${sanitizedHtml}
          </body>
          </html>
        `;
      }
    } else {
      fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Website Preview</title>
        </head>
        <body>
          <h1>Website Preview</h1>
        </body>
        </html>
      `;
    }
    
    // Inject CSS if provided
    if (sanitizedCss) {
      fullHtml = fullHtml.replace('</head>', `<style>${sanitizedCss}</style></head>`);
    }
    
    if (sanitizedJs) {
      fullHtml = fullHtml.replace('</body>', `<script>${sanitizedJs}</script></body>`);
    }

    // Write the content to the new window
    newWindow.document.write(fullHtml);
    newWindow.document.close();
  };
  const generatePreviewContent = useCallback(async (): Promise<{ html: string; css: string; js: string }> => {
    if (enableMultiFile && initialFiles && initialFiles.length > 0) {
      // Build an up-to-date view of files by overlaying live editor contents
      // from actualEditorRef on top of initialFiles
      const getAllEditorContents = () => {
        try {
          return (actualEditorRef?.current?.getAllFileContents?.() as Record<string, string>) || {};
        } catch (e) {
          return {} as Record<string, string>;
        }
      };

      const editorContentsById = getAllEditorContents();

      const flattenFiles = (nodes: any[]): any[] => {
        const out: any[] = [];
        const stack = [...nodes];
        while (stack.length) {
          const node = stack.shift();
          if (!node) continue;
          if (node.type === 'file') out.push(node);
          if (node.children && Array.isArray(node.children)) {
            stack.unshift(...node.children);
          }
        }
        return out;
      };

      const flattened = flattenFiles(initialFiles);
      const currentFiles = flattened.map((f) => {
        const liveContent = editorContentsById[f.id];
        return liveContent !== undefined ? { ...f, content: liveContent } : f;
      });

      // Multi-file preview - execute the full stack application
      const htmlFile = currentFiles.find(file => 
        file.name.endsWith('.html') || file.name.endsWith('.htm')
      );
      const cssFile = currentFiles.find(file => 
        file.name.endsWith('.css')
      );
      const jsFile = currentFiles.find(file => 
        file.name.endsWith('.js')
      );
      const pythonFile = currentFiles.find(file => 
        file.name.endsWith('.py')
      );

      // Set backend code for API testing panel
      if (pythonFile?.content) {
        setBackendCode(pythonFile.content);
      } else {
        setBackendCode('');
      }

      let htmlContent = htmlFile?.content || '<html><head><title>Preview</title></head><body><h1>Preview</h1></body></html>';

      // Remove external asset references that cause 404s in about:blank previews
      // Strip <link rel="stylesheet" href="styles.css"> and <script src="frontend.js"></script>
      htmlContent = htmlContent
        .replace(/<link[^>]*href=["']styles\.css["'][^>]*>\s*/gi, '')
        .replace(/<script[^>]*src=["']frontend\.js["'][^>]*><\/script>\s*/gi, '');
      
      // Prepare CSS content
      let cssContent = cssFile?.content || '';
      
      // Prepare JavaScript content
      let jsContent = '';
      if (jsFile?.content) {
        jsContent = jsFile.content;
        
        // Guard contact form listener to avoid null errors when element is not present yet
        jsContent = jsContent.replace(
          /document\.getElementById\(['"]contact-form['"]\)\.addEventListener\(['"]submit['"],\s*\(e\)\s*=>\s*this\.handleContactSubmit\(e\)\)\s*;?/,
          "(function(){ const formEl = document.getElementById('contact-form'); if (formEl) { formEl.addEventListener('submit', (e) => this.handleContactSubmit(e)); } const rebind = () => { const f = document.getElementById('contact-form'); if (f && !f.dataset.bound) { f.addEventListener('submit', (e) => this.handleContactSubmit(e)); f.dataset.bound = '1'; } }; document.addEventListener('click', (ev) => { const target = ev.target; if (target && (target.id === 'nav-contact' || target.closest && target.closest('#nav-contact'))) { setTimeout(rebind, 0); } }); }).call(this);"
        );
      } else {
      }

      return {
        html: htmlContent,
        css: cssContent,
        js: jsContent
      };
    } else {
      // Single file preview - assume it's HTML or create a simple preview
      if (code.includes('<html>') || code.includes('<!DOCTYPE')) {
        return {
          html: code,
          css: '',
          js: ''
        };
      } else if (code.includes('function') || code.includes('const') || code.includes('var')) {
        // JavaScript code - create a simple HTML wrapper with execution
        return {
          html: `
            <div class="container">
              <h2>JavaScript Code Preview</h2>
              <div class="code-output">
                <pre>${code}</pre>
              </div>
              <div id="output"></div>
              <div id="execution-result"></div>
            </div>
          `,
          css: `
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .code-output { background: #f8f8f8; padding: 15px; border-radius: 4px; margin-top: 20px; }
            pre { margin: 0; white-space: pre-wrap; }
            .error { color: red; background: #ffe6e6; padding: 10px; border-radius: 4px; margin-top: 10px; }
            .success { color: green; background: #e6ffe6; padding: 10px; border-radius: 4px; margin-top: 10px; }
          `,
          js: `
            const resultDiv = document.getElementById('execution-result');
            try {
              // Execute the user's JavaScript code
              ${code}
              resultDiv.innerHTML = '<div class="success">✓ Code executed successfully!</div>';
            } catch (error) {
              resultDiv.innerHTML = '<div class="error">❌ Error: ' + error.message + ' ' + ERROR_TRY_AGAIN + '</div>';
            }
          `
        };
      } else if (code.includes('from flask') || code.includes('app = Flask')) {
        // Python Flask code - show backend preview
        return {
          html: `
            <div class="container">
              <div class="header">
                <h2>🐍 Flask Backend Preview</h2>
                <p class="status">Backend server would be started with this code</p>
                <p class="info">Use the multi-file editor with HTML/CSS/JS files to see the full website</p>
              </div>
              <div class="code-block">
                <pre>${code}</pre>
              </div>
            </div>
          `,
          css: `
            body { font-family: Arial, sans-serif; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
            .container { max-width: 800px; margin: 0 auto; }
            .header { background: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .code-block { background: #2a2a2a; padding: 15px; border-radius: 4px; margin: 10px 0; }
            pre { margin: 0; white-space: pre-wrap; line-height: 1.5; }
            .status { color: #4CAF50; font-weight: bold; }
            .info { color: #2196F3; }
          `,
          js: ''
        };
      } else {
        // Plain text or other - create a simple display
        return {
          html: `<pre>${code}</pre>`,
          css: `
            body { font-family: 'Courier New', monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
            pre { white-space: pre-wrap; line-height: 1.5; }
          `,
          js: ''
        };
      }
    }
  }, [enableMultiFile, initialFiles, actualEditorRef, code]);

  const collectSubmissionFiles = useCallback((): Record<string, string> => {
    const files: Record<string, string> = {};

    if (enableMultiFile && initialFiles && initialFiles.length > 0) {
      const editorContents = (() => {
        try {
          return (actualEditorRef?.current?.getAllFileContents?.() as Record<string, string>) || {};
        } catch (error) {
          console.warn('Failed to read live editor contents for submission:', error);
          return {} as Record<string, string>;
        }
      })();

      const flattenedNodes = flattenFileTree(initialFiles);
      flattenedNodes.forEach(node => {
        const key = node?.id || node?.name;
        if (!key) {
          return;
        }
        const liveContent = editorContents[key];
        const fallbackContent = node?.content ?? '';
        files[String(node.name || key)] = String(
          liveContent !== undefined ? liveContent : fallbackContent ?? ''
        );
      });

      Object.entries(editorContents).forEach(([id, content]) => {
        const exists = flattenedNodes.some(node => (node?.id || node?.name) === id);
        if (!exists) {
          files[id] = String(content ?? '');
        }
      });

      return files;
    }

    const mainCode = typeof code === 'string' ? code : '';
    const fallbackKey = mainCode.includes('<html')
      ? 'index.html'
      : (mainCode.includes('function') || mainCode.includes('const') || mainCode.includes('let'))
        ? 'script.js'
        : 'code.txt';

    files[fallbackKey] = mainCode;
    return files;
  }, [enableMultiFile, initialFiles, actualEditorRef, code]);

  // Helper to normalize code files to html/css/js format for download
  const normalizeCodeForDownload = useCallback((files: Record<string, string>) => {
    const directHtml = files.html ?? files.HTML ?? '';
    const directCss = files.css ?? files.CSS ?? '';
    const directJs = files.js ?? files.JS ?? '';

    const entries = Object.entries(files);
    const htmlFiles = entries.filter(([name]) => /\.html?$/i.test(name));
    const cssFiles = entries.filter(([name]) => /\.s?css$/i.test(name));
    const jsFiles = entries.filter(([name]) => /\.(tsx|jsx|ts|js|mjs|cjs)$/i.test(name));

    const html = directHtml || (htmlFiles.length ? String(htmlFiles[0][1]) : '');
    const css = directCss || (cssFiles.length ? cssFiles.map(([, value]) => String(value)).join('\n\n') : '');
    const js = directJs || (jsFiles.length ? jsFiles.map(([, value]) => String(value)).join('\n\n') : '');

    return { html, css, js };
  }, []);

  const handleDownloadProject = useCallback(async () => {
    try {
      const files = collectSubmissionFiles();
      const normalized = normalizeCodeForDownload(files);
      
      const projectName = taskName || 'VibeJam Project';
      const customTitle = projectTitle.trim() || undefined;
      const customDescription = projectDescription.trim() || undefined;

      await downloadProjectAsRepository(
        normalized,
        projectName,
        taskName || undefined,
        undefined, // taskDescription - not available in CodingEditor
        customTitle,
        customDescription
      );

      showSnackbar('Thanks for downloading! Unzip the file to see a GitHub repo with steps to run your game locally or host it online for free!');

      // Log download event if userId and projectId are available
      if (userId && projectId) {
        try {
          await fetch(`${ENV.BACKEND_URL}/api/code-logs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId,
              projectId,
              taskId: task_id || undefined,
              mode: 'download',
              event: 'download',
              code: normalized,
              metadata: {
                event: 'download',
                taskId: task_id || null,
                projectId,
                taskName: taskName || null,
                triggeredAt: new Date().toISOString(),
                codeLengths: Object.fromEntries(
                  Object.entries(normalized).map(([key, value]) => [key, value?.length || 0])
                ),
              },
            }),
          });
        } catch (error) {
          console.warn('Failed to log download event', error);
        }
      }
    } catch (error) {
      console.error('Failed to download project:', error);
      showSnackbar('Failed to download project');
    }
  }, [collectSubmissionFiles, normalizeCodeForDownload, taskName, projectTitle, projectDescription, showSnackbar, userId, projectId, task_id]);


  useEffect(() => {
    if (taskIndex != -1) {
      loadCurrentTask(
        taskIndex,
        response_id,
        task_id,
        exp_condition,
        worker_id,
        editor,
        setMessages,
        function_signatures,
        telemetry,
        setTelemetry,
        actualEditorRef
      );
    }

    if (true) {
      setOutput("Output will be shown here when Run is pressed.");
      const skipTimer = setTimeout(() => setShowTimer(true), skipTime);
      setShowTimer(false);
      if (chatRef.current) {
        chatRef.current.clearThrottle();
      }

      return () => clearTimeout(skipTimer);
    }
  }, [taskIndex]);

  // Set backend code for API testing panel when files change (not on every text change)
  useEffect(() => {
    if (enableMultiFile && initialFiles && initialFiles.length > 0) {
      // Multi-file mode - find Python file
      const flattenFiles = (nodes: any[]): any[] => {
        const out: any[] = [];
        const stack = [...nodes];
        while (stack.length) {
          const node = stack.shift();
          if (!node) continue;
          if (node.type === 'file') out.push(node);
          if (node.children && Array.isArray(node.children)) {
            stack.unshift(...node.children);
          }
        }
        return out;
      };

      const flattened = flattenFiles(initialFiles);
      const pythonFile = flattened.find(file => 
        file.name.endsWith('.py') || file.name === 'backend.py'
      );

      if (pythonFile?.content) {
        setBackendCode(pythonFile.content);
      } else {
        setBackendCode('');
      }
    } else {
      // Single file mode - check if current code is Python
      if (code.includes('@endpoint') || code.includes('from flask') || code.includes('app = Flask')) {
        setBackendCode(code);
      } else {
        setBackendCode('');
      }
    }
  }, [initialFiles, enableMultiFile]); // Removed 'code' from dependencies to prevent parsing on every text change

  // Auto-generate preview content when preview tab is selected
  useEffect(() => {
    if (terminalTab === 'preview') {
      generatePreviewContent().then(content => {
        setPreviewContent(content);
      });
    }
  }, [terminalTab, generatePreviewContent]);

  // Auto-update preview content when code changes (for both single and multi-file modes)
  useEffect(() => {
    if (terminalTab === 'preview') {
      // Debounce the preview update to avoid excessive re-renders
      const timeoutId = setTimeout(() => {
        generatePreviewContent().then(content => {
          setPreviewContent(content);
        });
      }, 500); // 500ms debounce

      return () => clearTimeout(timeoutId);
    }
  }, [code, initialFiles, enableMultiFile, terminalTab, generatePreviewContent]); // Add code and initialFiles as dependencies

  // Callback to handle file content changes in multi-file mode
  const handleFileContentChange = useCallback(() => {
    // Always notify parent about live content changes
    try { onFileContentChange && onFileContentChange(); } catch (e) {}
    if (terminalTab === 'preview') {
      // Debounce the preview update to avoid excessive re-renders
      const timeoutId = setTimeout(() => {
        generatePreviewContent().then(content => {
          setPreviewContent(content);
        });
      }, 500); // 500ms debounce

      return () => clearTimeout(timeoutId);
    }
  }, [terminalTab, onFileContentChange, generatePreviewContent]);

  const handleSaveShortcut = useCallback((fileId?: string) => {
    try { onSaveShortcut && onSaveShortcut(fileId); } catch (e) {}
  }, [onSaveShortcut]);

  const clearPersistedSubmissionQuestionsState = useCallback(() => {
    if (typeof window === 'undefined' || !submissionQuestionsStorageKey) {
      return;
    }
    try {
      window.localStorage.removeItem(submissionQuestionsStorageKey);
    } catch {
      // no-op: ignore storage errors
    }
  }, [submissionQuestionsStorageKey]);

  // Auto-scroll debug iframe to bottom when new logs are added
  useEffect(() => {
    if (debugIframeRef.current && debugLogs.length > 0) {
      const iframe = debugIframeRef.current;
      // Wait for iframe to load and then scroll
      const scrollToBottom = () => {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.documentElement.scrollTop = iframeDoc.documentElement.scrollHeight;
        }
      };
      
      // Try immediately and also after a short delay
      scrollToBottom();
      setTimeout(scrollToBottom, 10);
    }
  }, [debugLogs]);

  // Simple drag handlers - no useCallback complications
  // Note: The actual mouse down handler is now inline in the JSX for the console divider


  async function runCode(
    editor: any,
    task_index: number,
    unit_tests: string[],
    submit: boolean = false
  ) {
    let res: any;

    if (!submit) {
      res = await submitCode(editor, setOutput, setTelemetry, task_index);
    } else {
      res = await submitCode(editor, setOutput, setTelemetry, task_index);
      displayResult(res);
    }

    if (res.data.stderr != null || res.data.exception != null) {
      if (chatRef.current) {
        chatRef.current.getProactiveDebuggingSuggestions(res?.data);
      }
    }
  }

  const proceedToSubmitModalOrConfirm = useCallback((skipInitialConfirmation: boolean) => {
    if (shouldRequireInitialSubmitConfirmation && !skipInitialConfirmation) {
      setShowRequiredTaskSubmitConfirm(true);
      return;
    }
    setShowRequiredTaskSubmitConfirm(false);
    submitModalOpenedFromRestoreRef.current = false;
    setShowSubmitModal(true);
  }, [shouldRequireInitialSubmitConfirmation]);

  // Listen for global request to open submit modal from page-level button
  useEffect(() => {
    const openSubmit = (event?: Event) => {
      const customEvent = event as CustomEvent<{ skipInitialConfirmation?: boolean }> | undefined;
      const skipInitialConfirmation = Boolean(customEvent?.detail?.skipInitialConfirmation);
      const isGameBased = taskLabel === 'replication' || taskLabel === 'open-ended';
      const promptCount = assistantPromptCountRef?.current ?? 0;
      if (isGameBased && promptCount < 5) {
        setShowLowEngagementReminder(true);
        return;
      }
      proceedToSubmitModalOrConfirm(skipInitialConfirmation);
    };
    window.addEventListener('open-submit-modal', openSubmit as EventListener);
    return () => window.removeEventListener('open-submit-modal', openSubmit as EventListener);
  }, [shouldRequireInitialSubmitConfirmation, taskLabel, assistantPromptCountRef, proceedToSubmitModalOrConfirm]);

  const emitSubmissionQuestionsPaneVisibility = useCallback((isOpen: boolean) => {
    try {
      onSubmissionQuestionsVisibilityChange?.(isOpen);
    } catch {}
    try {
      window.dispatchEvent(
        new CustomEvent('submission-questions-pane-visibility', {
          detail: { open: isOpen },
        })
      );
    } catch {}
  }, [onSubmissionQuestionsVisibilityChange]);

  useEffect(() => {
    emitSubmissionQuestionsPaneVisibility(showSubmitModal);
  }, [showSubmitModal, emitSubmissionQuestionsPaneVisibility]);

  useEffect(() => {
    return () => {
      emitSubmissionQuestionsPaneVisibility(false);
    };
  }, [emitSubmissionQuestionsPaneVisibility]);

  useEffect(() => {
    if (typeof window === 'undefined' || !submissionQuestionsStorageKey) {
      restoredSubmissionQuestionsKeyRef.current = null;
      return;
    }
    if (restoredSubmissionQuestionsKeyRef.current === submissionQuestionsStorageKey) {
      return;
    }
    restoredSubmissionQuestionsKeyRef.current = submissionQuestionsStorageKey;

    try {
      const raw = window.localStorage.getItem(submissionQuestionsStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        showComprehensionCheck?: boolean;
        showEvaluationCheck?: boolean;
      };

      setShowRequiredTaskSubmitConfirm(false);
      submitModalOpenedFromRestoreRef.current = true;
      setShowSubmitModal(true);

      if (parsed?.showEvaluationCheck) {
        setShowEvaluationCheck(true);
        setShowComprehensionCheck(false);
        return;
      }

      if (parsed?.showComprehensionCheck) {
        setShowComprehensionCheck(true);
        setShowEvaluationCheck(false);
        return;
      }

      setShowComprehensionCheck(false);
      setShowEvaluationCheck(false);
    } catch {
      // no-op: ignore malformed persisted data
    }
  }, [submissionQuestionsStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !submissionQuestionsStorageKey) {
      return;
    }
    if (!showSubmitModal) {
      return;
    }
    try {
      window.localStorage.setItem(
        submissionQuestionsStorageKey,
        JSON.stringify({
          showComprehensionCheck,
          showEvaluationCheck,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // no-op: ignore storage write failures
    }
  }, [submissionQuestionsStorageKey, showSubmitModal, showComprehensionCheck, showEvaluationCheck]);

  function displayResult(result: any) {
    var log = "";
    if (result.data.stderr == null && result.data.exception == null) {
      log = result.data.stdout || "No output";
    } else {
      log = result.data.stdout || "";
      log += result.data.stderr || result.data.exception;
    }
    setOutput(log);

    var alertMessage = "";

    if (result.data.stderr == null && result.data.exception == null) {
      alertMessage = "Thanks for submitting! \n Next Task will now be displayed!";
      trackSubmitCode(setTelemetry, taskIndex, "correct code", true, editor);
      localStorage.setItem("code", "");

      if (taskIndex < function_signatures.length - 1) {
        setTaskIndex((prevTaskIndex) => {
          return prevTaskIndex + 1;
        });
        alert(alertMessage);
      } else {
        localStorage.setItem("code", "");
        setTimeout(() => {
          setTaskIndex((prevTaskIndex) => {
            return prevTaskIndex + 1;
          });
        }, 1000);
        var myData = [response_id, task_id, exp_condition, worker_id];
        localStorage.setItem("objectToPass", JSON.stringify(myData));
      }
    } else {
      alertMessage = "Code is incorrect. " + ERROR_TRY_AGAIN;
      trackSubmitCode(setTelemetry, taskIndex, log, false, editor);
      alert(alertMessage);
    }
  }

  // Handle project submission
  const createPreviewScreenshot = useCallback(async (): Promise<string> => {
    if (typeof window === 'undefined') {
      throw new Error('Preview capture is only available in the browser');
    }

    const content = await generatePreviewContent();

    if (!content.html && !content.css && !content.js) {
      throw new Error('No preview content available');
    }

    let tempIframe: HTMLIFrameElement | null = null;

    try {
      tempIframe = document.createElement('iframe');
      tempIframe.style.position = 'fixed';
      tempIframe.style.left = '-10000px';
      tempIframe.style.top = '0';
      tempIframe.style.width = '1280px';
      tempIframe.style.height = '720px';
      tempIframe.style.border = 'none';
      tempIframe.style.opacity = '0';
      tempIframe.style.pointerEvents = 'none';
      tempIframe.sandbox.add('allow-scripts');
      tempIframe.sandbox.add('allow-same-origin');
      document.body.appendChild(tempIframe);

      const iframeDoc = tempIframe.contentDocument || tempIframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error('Unable to access temporary preview iframe');
      }

      const fullHtml = buildFullHTMLDocument({
        htmlCode: content.html,
        cssCode: content.css,
        jsCode: content.js
      });

      iframeDoc.open();
      iframeDoc.write(fullHtml);
      iframeDoc.close();

      await new Promise(resolve => setTimeout(resolve, 1200));

      if (!iframeDoc.body) {
        throw new Error('Unable to capture preview body');
      }

      // Ensure the iframe document has proper viewport settings to prevent squishing
      if (!iframeDoc.querySelector('meta[name="viewport"]')) {
        const viewport = iframeDoc.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=1280, initial-scale=1.0';
        iframeDoc.head.appendChild(viewport);
      }

      // Ensure html and body are properly sized to match iframe dimensions
      // This prevents content from being squished or stretched
      iframeDoc.documentElement.style.width = '1280px';
      iframeDoc.documentElement.style.height = '720px';
      iframeDoc.documentElement.style.margin = '0';
      iframeDoc.documentElement.style.padding = '0';
      iframeDoc.documentElement.style.overflow = 'hidden';
      
      iframeDoc.body.style.width = '1280px';
      iframeDoc.body.style.height = '720px';
      iframeDoc.body.style.margin = '0';
      iframeDoc.body.style.padding = '0';
      iframeDoc.body.style.boxSizing = 'border-box';
      iframeDoc.body.style.overflow = 'hidden';

      // Inject CSS to prevent buttons and other elements from being squished
      // This ensures elements maintain their natural aspect ratios
      const antiSquishStyle = iframeDoc.createElement('style');
      antiSquishStyle.textContent = `
        button, input[type="button"], input[type="submit"], .btn {
          box-sizing: border-box !important;
          min-width: fit-content !important;
          white-space: nowrap !important;
        }
        * {
          box-sizing: border-box;
        }
      `;
      iframeDoc.head.appendChild(antiSquishStyle);

      // Wait a bit more for layout to settle after style changes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture the documentElement instead of body for more accurate rendering
      // This ensures we capture the full viewport at the correct size
      const canvas = await html2canvas(iframeDoc.documentElement, {
        allowTaint: true,
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: Math.max(1.5, window.devicePixelRatio || 1),
        logging: false,
        // Don't specify width/height - let it capture naturally at the set dimensions
      });

      return canvas.toDataURL('image/png', 0.92);
    } finally {
      if (tempIframe && tempIframe.parentNode) {
        tempIframe.parentNode.removeChild(tempIframe);
      }
    }
  }, [generatePreviewContent]);

  // Notify parent when project title/description changes
  useEffect(() => {
    if (onProjectInfoChange) {
      onProjectInfoChange(projectTitle, projectDescription);
    }
  }, [projectTitle, projectDescription, onProjectInfoChange]);

  useEffect(() => {
    if (!showSubmitModal) {
      setProjectTitle('');
      setProjectDescription('');
      setProjectTitleError(null);
      setProjectDescriptionError(null);
      setImplementedRequirements({});
      setRequirementsComments('');
      setRequirementsCommentsError(null);
      setPreviewScreenshot(null);
      setScreenshotError(null);
      setSubmissionError(null);
      setIsSubmittingProject(false);
      setIsScreenshotLoading(false);
      setExistingSubmission(null);
      setIsCheckingExistingSubmission(false);
      setHasConsentedToOverride(false);
      setShowComprehensionCheck(false);
      setComprehensionAnswers({});
      setComprehensionQuestions([]);
      setComprehensionQuestionsError(null);
      setAnswersChecked(false);
      return;
    }

    let cancelled = false;

    // Check for existing submission
    const checkExistingSubmission = async () => {
      if (!userId || !projectId) return;
      
      setIsCheckingExistingSubmission(true);
      try {
        const params = new URLSearchParams();
        if (projectId) {
          params.append('projectId', projectId.toString());
        } else if (task_id) {
          params.append('taskId', task_id);
        }
        
        const response = await fetch(`${ENV.BACKEND_URL}/api/users/${userId}/submissions/check?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          if (data.exists && data.submission) {
            if (!cancelled) {
              setExistingSubmission(data.submission);
            }
          } else {
            if (!cancelled) {
              setExistingSubmission(null);
            }
          }
        }
      } catch (error) {
        console.error('Failed to check existing submission', error);
        // Don't block submission if check fails
      } finally {
        if (!cancelled) {
          setIsCheckingExistingSubmission(false);
        }
      }
    };

    const capture = async () => {
      setIsScreenshotLoading(true);
      setScreenshotError(null);

      try {
        const screenshot = await createPreviewScreenshot();
        if (!cancelled) {
          setPreviewScreenshot(screenshot);
        }
      } catch (error) {
        console.error('Failed to capture preview screenshot', error);
        if (!cancelled) {
          setPreviewScreenshot(null);
          setScreenshotError('Unable to capture preview. ' + ERROR_TRY_AGAIN);
        }
      } finally {
        if (!cancelled) {
          setIsScreenshotLoading(false);
        }
      }
    };

    checkExistingSubmission();
    if (!isRequiredTask) {
      capture();
    } else {
      setPreviewScreenshot(null);
      setIsScreenshotLoading(false);
      setScreenshotError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [showSubmitModal, createPreviewScreenshot, userId, projectId, task_id, isRequiredTask]);

  useEffect(() => {
    if (!showSubmitModal || !isRequiredTask || !taskRequirements || taskRequirements.length === 0) {
      return;
    }

    const checkedRequirementIndexes = new Set<number>();

    // Prefer live checkbox state from Task Instructions iframe when available.
    if (typeof document !== 'undefined') {
      const instructionIframes = Array.from(
        document.querySelectorAll('iframe[title="Task Instructions"]')
      ) as HTMLIFrameElement[];

      instructionIframes.forEach((iframe) => {
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc) return;
        const requirementInputs = iframeDoc.querySelectorAll(
          '.requirements-checklist input[type="checkbox"][data-req-index]'
        );
        requirementInputs.forEach((input) => {
          const checkbox = input as HTMLInputElement;
          if (!checkbox.checked) return;
          const indexAttr = checkbox.getAttribute('data-req-index');
          const parsedIndex = indexAttr !== null ? Number.parseInt(indexAttr, 10) : NaN;
          if (!Number.isNaN(parsedIndex)) {
            checkedRequirementIndexes.add(parsedIndex);
          }
        });
      });
    }

    // Fallback: restore from localStorage if available.
    if (checkedRequirementIndexes.size === 0 && typeof window !== 'undefined' && taskName) {
      try {
        const raw = window.localStorage.getItem(`task-instruction-requirements:${taskName}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((value, index) => {
              if (typeof value === 'boolean' && value) {
                checkedRequirementIndexes.add(index);
              } else if (typeof value === 'number' && Number.isFinite(value)) {
                checkedRequirementIndexes.add(value);
              }
            });
          } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).checkedIndexes)) {
            (parsed as any).checkedIndexes.forEach((value: unknown) => {
              if (typeof value === 'number' && Number.isFinite(value)) {
                checkedRequirementIndexes.add(value);
              }
            });
          }
        }
      } catch {
        // no-op: if parsing fails, continue without prefill
      }
    }

    if (checkedRequirementIndexes.size === 0) {
      return;
    }

    const nextPrefillState: Record<string, boolean> = {};
    taskRequirements.forEach((requirement, index) => {
      if (checkedRequirementIndexes.has(index)) {
        nextPrefillState[requirement] = true;
      }
    });

    if (Object.keys(nextPrefillState).length > 0) {
      setImplementedRequirements(nextPrefillState);
    }
  }, [showSubmitModal, isRequiredTask, taskRequirements, taskName]);

  useEffect(() => {
    if (previewScreenshot) {
      setScreenshotError(null);
    }
  }, [previewScreenshot]);

  useEffect(() => {
    if (!showSubmitModal || showComprehensionCheck) {
      return;
    }

    const container = previewBoxContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const maxWidth = Math.min(rect.width, 960);
      const maxHeight = Math.min(rect.height, 540);
      const aspectRatio = 16 / 9;

      let width = maxWidth;
      let height = width / aspectRatio;

      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      const minWidth = 200;
      if (width < minWidth) {
        width = minWidth;
        height = width / aspectRatio;
      }

      setPreviewBoxSize({ width, height });
    };

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      updateSize();
    });
    
    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [showSubmitModal, showComprehensionCheck]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setScreenshotError('Please upload an image file.');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setScreenshotError('Image size must be less than 5MB.');
      return;
    }

    // Read file as data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        setPreviewScreenshot(result);
        setScreenshotError(null);
      }
    };
    reader.onerror = () => {
      setScreenshotError('Failed to read image file.');
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProjectSubmit = (showCelebration: boolean = true) => {
    setShowSubmitModal(false);
    
    if (showCelebration) {
      // Trigger confetti effect
      const confettiLib = (window as any).confetti;
      
      if (confettiLib) {
        const duration = 3 * 1000; // 3 seconds instead of 15
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 99999 };

        const randomInRange = (min: number, max: number) => {
          return Math.random() * (max - min) + min;
        };

        const interval = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);

          // since particles fall down, start a bit higher than random
          confettiLib(
            Object.assign({}, defaults, {
              particleCount,
              origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
            })
          );
          confettiLib(
            Object.assign({}, defaults, {
              particleCount,
              origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
            })
          );
        }, 250);
      }
    }
    
    // Track submission telemetry
    trackSubmitCode(setTelemetry, taskIndex, "project submitted", true, editor);
    
    // Clear code for the current task after submission
    localStorage.setItem("code", "");
  };

  const buildComprehensionAnswersPayload = useCallback(
    (questions: Array<{ id: string; question_name?: string; question_type: string; choices?: string[] }>) => {
      const payloadEntries = Object.fromEntries(
        questions.map((q) => {
          const answer = comprehensionAnswers[q.id] || '';
          if (q.question_type === 'multi_select' && q.choices) {
            const delimiter = '|||';
            const selectedChoices = answer ? answer.split(delimiter).filter(Boolean) : [];
            const binaryArray = q.choices.map((choice) => (selectedChoices.includes(choice) ? 1 : 0));
            return [q.question_name || q.id, binaryArray];
          }
          return [q.question_name || q.id, answer];
        })
      );

      // Required website tasks have pane-1 checklist/comment questions that are not backend-generated.
      // Include them explicitly so they are persisted alongside the generated comprehension answers.
      if (isRequiredTask) {
        const requirementChoices = (taskRequirements || []).filter((requirement) => typeof requirement === 'string');
        payloadEntries.required_task_implemented_requirements = requirementChoices.map((requirement) =>
          implementedRequirements[requirement] ? 1 : 0
        );
        payloadEntries.required_task_open_feedback = requirementsComments.trim();
      }

      return payloadEntries;
    },
    [comprehensionAnswers, implementedRequirements, isRequiredTask, requirementsComments, taskRequirements]
  );

  const emitQuestionsGenerationStarted = useCallback((metadata?: Record<string, any>) => {
    if (!onQuestionsGenerationStarted) return;
    Promise.resolve(onQuestionsGenerationStarted(metadata)).catch((error) => {
      console.warn("Failed to log question generation start event", error);
    });
  }, [onQuestionsGenerationStarted]);

  const emitQuestionsGenerationCompleted = useCallback((metadata?: Record<string, any>) => {
    if (!onQuestionsGenerationCompleted) return;
    Promise.resolve(onQuestionsGenerationCompleted(metadata)).catch((error) => {
      console.warn("Failed to log question generation completion event", error);
    });
  }, [onQuestionsGenerationCompleted]);

  const emitContinuedToQuestions = useCallback((metadata?: Record<string, any>) => {
    if (!onContinuedToQuestions) return;
    Promise.resolve(onContinuedToQuestions(metadata)).catch((error) => {
      console.warn("Failed to log continue-to-questions event", error);
    });
  }, [onContinuedToQuestions]);

  const fetchComprehensionQuestions = useCallback(async (
    trigger: "required_modal_open" | "required_continue" | "questions_pane_shown" | "manual_regenerate" = "questions_pane_shown"
  ): Promise<boolean> => {
    const generationStartedAt = Date.now();
    emitQuestionsGenerationStarted({ trigger });
    setIsLoadingComprehensionQuestions(true);
    setComprehensionQuestionsError(null);
    setComprehensionQuestionsWarnings([]);

    try {
      if (isTutorialTask) {
        const seededQuestions = [
          {
            id: 'tutorial-1',
            question_name: 'tutorial_question_1',
            question: 'How much do you agree with this statement: "When I build websites with AI tools like Cursor and Copilot, I learn more about web development"',
            question_type: 'mcqa',
            choices: SELF_REPORT_OPTIONS,
          },
          {
            id: 'tutorial-2',
            question_name: 'tutorial_question_2',
            question: 'Which of these programming jokes do you find funny?',
            question_type: 'multi_select',
            choices: [
              'Why do programmers prefer dark mode? Because light attracts bugs!',
              'There are only two hard things in computer science: cache invalidation, naming things, and off-by-one errors.',
              "Why did the programmer quit his job? Because he didn't get arrays.",
              "There are 10 types of people in the world: those who understand binary, and those who don't.",
              'A SQL query walks into a bar, walks up to two tables, and asks: "Can I join you?"',
              '"Knock, knock." "Who\'s there?" [long pause] "Java."',
            ],
          },
        ];
        setComprehensionQuestions(seededQuestions);
        emitQuestionsGenerationCompleted({
          trigger,
          success: true,
          question_count: seededQuestions.length,
          duration_ms: Date.now() - generationStartedAt,
        });
        return true;
      }

      if (isWarmupTask) {
        // Warm-up tasks intentionally skip auto-generated comprehension questions.
        const warmupQuestions = [
          {
            id: 'warmup-success',
            question_name: 'warmup_success',
            question: 'I successfully completed the task',
            question_type: 'mcqa',
            choices: SELF_REPORT_OPTIONS,
          },
          {
            id: 'warmup-understand',
            question_name: 'warmup_understand',
            question: 'I understood the requirements.',
            question_type: 'mcqa',
            choices: SELF_REPORT_OPTIONS,
          },
        ];
        setComprehensionQuestions(warmupQuestions);
        emitQuestionsGenerationCompleted({
          trigger,
          success: true,
          question_count: warmupQuestions.length,
          duration_ms: Date.now() - generationStartedAt,
        });
        return true;
      }

      if (!userId || !projectId) {
        throw new Error('Missing user or project details needed to generate questions');
      }

      const codeSnapshot = collectSubmissionFiles();
      if (!codeSnapshot || Object.keys(codeSnapshot).length === 0) {
        throw new Error('No code files found');
      }

      const response = await fetch(`${ENV.BACKEND_URL}/api/comprehension-questions/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          project_id: projectId,
          submission_title: projectTitle.trim(),
          submission_description: projectDescription.trim(),
          submission_code: codeSnapshot,
          ai_assistant_mode: aiAssistantMode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate comprehension questions');
      }

      const data = await response.json();
      if (!data.success || !data.questions) {
        throw new Error('Invalid response format');
      }

      setComprehensionQuestionsWarnings(Array.isArray(data.warnings) ? data.warnings : []);

      const mappedQuestions = data.questions.map((q: any, index: number) => ({
        id: q.id?.toString() || `comp-${index}`,
        question_name: q.question_name || '',
        question: q.question || '',
        question_type: q.question_type || 'free_response',
        choices: q.choices || undefined,
        answer: q.answer,
      }));
      setComprehensionQuestions(mappedQuestions);
      emitQuestionsGenerationCompleted({
        trigger,
        success: true,
        question_count: mappedQuestions.length,
        duration_ms: Date.now() - generationStartedAt,
      });
      return true;
    } catch (error) {
      console.error('Failed to fetch comprehension questions:', error);
      setComprehensionQuestionsError(error instanceof Error ? error.message : 'Failed to load questions');
      setComprehensionQuestionsWarnings([]);
      setComprehensionQuestions([]);
      emitQuestionsGenerationCompleted({
        trigger,
        success: false,
        question_count: 0,
        error_message: error instanceof Error ? error.message : "Failed to load questions",
        duration_ms: Date.now() - generationStartedAt,
      });
      return false;
    } finally {
      setIsLoadingComprehensionQuestions(false);
    }
  }, [
    emitQuestionsGenerationCompleted,
    emitQuestionsGenerationStarted,
    isTutorialTask,
    isWarmupTask,
    userId,
    projectId,
    aiAssistantMode,
    projectTitle,
    projectDescription,
    collectSubmissionFiles,
  ]);

  useEffect(() => {
    if (!showSubmitModal || !isRequiredTask || showComprehensionCheck || showEvaluationCheck) {
      return;
    }
    if (isLoadingComprehensionQuestions || comprehensionQuestions.length > 0 || comprehensionQuestionsError) {
      return;
    }
    // When modal was re-opened from localStorage (user came back), skip auto-generation so we don't run before HTML/code is ready. Generation will run when they click Continue.
    if (submitModalOpenedFromRestoreRef.current) {
      submitModalOpenedFromRestoreRef.current = false;
      return;
    }
    void fetchComprehensionQuestions("required_modal_open");
  }, [
    showSubmitModal,
    isRequiredTask,
    showComprehensionCheck,
    showEvaluationCheck,
    isLoadingComprehensionQuestions,
    comprehensionQuestions.length,
    comprehensionQuestionsError,
    fetchComprehensionQuestions,
  ]);

  const handleProjectFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionError(null);

    const trimmedTitle = projectTitle.trim();
    const trimmedDescription = projectDescription.trim();
    const trimmedRequirementsComments = requirementsComments.trim();
    let normalizedSubmissionTitle = trimmedTitle;
    let normalizedSubmissionDescription = trimmedDescription;
    let hasError = false;

    if (isRequiredTask) {
      setRequirementsCommentsError(null);
      setProjectTitleError(null);
      setProjectDescriptionError(null);
      setScreenshotError(null);
    } else {
      if (!trimmedTitle) {
        setProjectTitleError('Please add a project title.');
        hasError = true;
      } else {
        setProjectTitleError(null);
      }

      if (!trimmedDescription) {
        setProjectDescriptionError('Please add a short description.');
        hasError = true;
      } else {
        setProjectDescriptionError(null);
      }

      if (trimmedTitle.length > PROJECT_TITLE_LIMIT) {
        setProjectTitleError(`Title must be ${PROJECT_TITLE_LIMIT} characters or fewer.`);
        hasError = true;
      }

      if (trimmedDescription.length > PROJECT_DESCRIPTION_LIMIT) {
        setProjectDescriptionError(`Description must be ${PROJECT_DESCRIPTION_LIMIT} characters or fewer.`);
        hasError = true;
      }

      if (!previewScreenshot) {
        setScreenshotError('Preview not ready yet. Please wait a moment and try again.');
        hasError = true;
      }
    }

    // Always show comprehension questions for all tasks
    const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
    
    // For tutorial tasks, skip projectId and userId checks since we're not storing anything
    if (!isTutorialTask) {
      if (!userId || Number.isNaN(userId)) {
        setSubmissionError('Missing user information. Please sign in again and retry.');
        hasError = true;
      }

      if (!projectId || Number.isNaN(projectId)) {
        setSubmissionError('Unable to determine project for this submission. Please reopen the task and try again.');
        hasError = true;
      }
    }

    // Check if there's an existing submission that requires consent
    if (existingSubmission && !hasConsentedToOverride) {
      setSubmissionError('Please confirm that you want to override your existing submission.');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    // Store the validated title and description
    if (isRequiredTask) {
      const implementedList = (taskRequirements || []).filter((requirement) => implementedRequirements[requirement]);
      const fallbackTitle = taskName ? `${taskName} submission` : 'Website requirements submission';
      const descriptionSections = [
        `Implemented requirements (${implementedList.length}/${(taskRequirements || []).length}):`,
        implementedList.length ? implementedList.map((req) => `- ${req}`).join('\n') : '- None selected',
        '',
        'Comments on easy vs difficult requirements:',
        trimmedRequirementsComments || 'No additional comments provided.',
      ];
      normalizedSubmissionTitle = fallbackTitle;
      normalizedSubmissionDescription = descriptionSections.join('\n');
      setProjectTitle(normalizedSubmissionTitle);
      setProjectDescription(normalizedSubmissionDescription);
    } else {
      setProjectTitle(normalizedSubmissionTitle);
      setProjectDescription(normalizedSubmissionDescription);
    }
    
    // Check if evaluation is needed (non-required tasks or past study date)
    const needsEvaluation = studyEnded || (taskName && !WEBSITE_REQUIREMENT_TASKS.includes(taskName as any));
    
    // For public tasks (needsEvaluation), check moderation first
    if (needsEvaluation && !isTutorialTask) {
      setIsCheckingModeration(true);
      setSubmissionError(null);
      // Clear previous field errors related to moderation
      setProjectTitleError(null);
      setProjectDescriptionError(null);
      setScreenshotError(null);
      
      try {
        // Call moderation endpoint
        const moderationResponse = await fetch(`${ENV.BACKEND_URL}/api/submissions/check-moderation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: trimmedTitle,
            description: trimmedDescription,
            image: previewScreenshot,
          }),
        });

        if (!moderationResponse.ok) {
          const errorData = await moderationResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to check content appropriateness');
        }

        const moderationData = await moderationResponse.json();
        
        if (!moderationData.is_appropriate) {
          // Content was flagged - show error and prevent proceeding
          setSubmissionError('Your submission has offensive content. Review and update your title/description/image and try again.');
          setIsCheckingModeration(false);
          return;
        }
        
        // Moderation passed - continue with normal flow
      } catch (error) {
        console.error('Moderation check error:', error);
        // On error, show warning but allow user to proceed (graceful degradation)
        // This prevents blocking users if the moderation service is down
        const errorMessage = error instanceof Error ? error.message : 'Unable to verify content appropriateness';
        setSubmissionError(`Warning: ${errorMessage}. You may proceed, but please ensure your content is appropriate.`);
        // Don't return - allow user to proceed after seeing the warning
      } finally {
        setIsCheckingModeration(false);
      }
    }
    
    if (needsEvaluation) {
      // Show evaluation step first
      setShowEvaluationCheck(true);
      setShowComprehensionCheck(false);
      // Clear comprehension state when switching to evaluation
      setComprehensionQuestions([]);
      setComprehensionAnswers({});
      setComprehensionQuestionsError(null);
      setAnswersChecked(false);
    } else {
      setShowEvaluationCheck(false);
      if (isRequiredTask) {
        if (isLoadingComprehensionQuestions) {
          return;
        }

        if (comprehensionQuestions.length === 0) {
          const generated = await fetchComprehensionQuestions("required_continue");
          if (!generated) {
            setSubmissionError(null);
          }
          return;
        }

        if (unansweredSelfReportCount > 0) {
          setSubmissionError('Please answer all self-report questions before continuing.');
          return;
        }

        if (codeTailoredQuestions.length > 0) {
          emitContinuedToQuestions({ source: "required_continue" });
          setComprehensionSubPane(distractorPaneQuestions.length > 0 ? 'distractors' : 'code_block');
          setShowComprehensionCheck(true);
          return;
        }

        // If only self-report questions exist (e.g., warm-up), submit directly.
        await submitProject(buildComprehensionAnswersPayload(comprehensionQuestions));
        return;
      }

      emitContinuedToQuestions({ source: "submit_form_continue" });
      setShowComprehensionCheck(true);
    }
  };

  // Fetch comprehension questions when the panel is shown
  useEffect(() => {
    if (!showComprehensionCheck || isRequiredTask) {
      return;
    }

    void fetchComprehensionQuestions("questions_pane_shown");
  }, [showComprehensionCheck, isRequiredTask, fetchComprehensionQuestions]);

  // Scroll submission questions pane to top when opening it or moving to next sub-pane (e.g. Continue → code block)
  useEffect(() => {
    if (!showComprehensionCheck) return;
    submissionQuestionsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [showComprehensionCheck, comprehensionSubPane]);

  // Fetch evaluation when the evaluation panel is shown
  useEffect(() => {
    if (!showEvaluationCheck) {
      return;
    }

    const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
    
    // For tutorial tasks, skip evaluation
    if (isTutorialTask) {
      setShowEvaluationCheck(false);
      setShowComprehensionCheck(true);
      return;
    }
    
    // For non-tutorial tasks, skip userId/projectId checks would fail, so return early
    if (!userId || !projectId) {
      return;
    }

    const fetchEvaluation = async () => {
      // Clear previous evaluation result to prevent showing stale scores
      setEvaluationResult(null);
      setIsLoadingEvaluation(true);
      setEvaluationError(null);
      
      try {
        const codeSnapshot = collectSubmissionFiles();
        if (!codeSnapshot || Object.keys(codeSnapshot).length === 0) {
          throw new Error('No code files found');
        }

        const response = await fetch(`${ENV.BACKEND_URL}/api/submissions/evaluate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            project_id: projectId,
            submission_title: projectTitle.trim(),
            submission_description: projectDescription.trim(),
            submission_code: codeSnapshot,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to evaluate submission');
        }

        const data = await response.json();
        if (data.success && data.evaluation) {
          setEvaluationResult(data.evaluation);
          // Store evaluation_id if provided
          if (data.evaluation_id) {
            setEvaluationId(data.evaluation_id);
          }
        } else {
          throw new Error('Invalid response format');
        }
      } catch (error) {
        console.error('Failed to fetch evaluation:', error);
        setEvaluationError(error instanceof Error ? error.message : 'Failed to load evaluation');
        // On error, allow user to proceed (graceful degradation)
        setEvaluationResult({
          is_valid: true,
          explanation: 'Evaluation could not be completed, but you may proceed.'
        });
      } finally {
        setIsLoadingEvaluation(false);
      }
    };

    fetchEvaluation();
  }, [showEvaluationCheck, userId, projectId, projectTitle, projectDescription, taskName]);

  // Helper function to count words in a string
  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  // Helper function to submit the project (used both with and without comprehension questions)
  const submitProject = async (comprehensionAnswersData?: Record<string, any>) => {
    const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
    
    // For tutorial, skip database submission - just show success message
    if (isTutorialTask) {
      setIsSubmittingProject(true);
      setSubmissionError(null);
      
      // Simulate a brief delay for UX
      await new Promise(resolve => setTimeout(resolve, 500));
      clearPersistedSubmissionQuestionsState();
      
      // Close both modals
      setShowComprehensionCheck(false);
      setShowEvaluationCheck(false);
      setShowSubmitModal(false);
      
      // Update user settings in database to mark playground as completed
      if (userId) {
        try {
          await setPlaygroundCompletedInSettings(
            userId,
            user?.settings,
            token || undefined
          );
          // Refresh user object to get updated settings
          await refreshUser();
        } catch (error) {
          console.error('Failed to update playground completion in database:', error);
          // Don't block the user flow if this fails
        }
      }
      
      handleProjectSubmit();
      // Reset consent state after successful submission
      setHasConsentedToOverride(false);
      setExistingSubmission(null);
      // Reset comprehension answers
      setComprehensionAnswers({});
      
      // Show success snackbar immediately after submission
      showSnackbar(
        <>
          Thanks for completing the tutorial! Navigate to the{' '}
          <Link href="/browse" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
            tasks page
          </Link>{' '}
          to start working on real projects
        </>,
        12000 // 12 seconds
      );
      
      setIsSubmittingProject(false);
      return;
    }
    
    // Regular submission flow for non-tutorial tasks
    const codeSnapshot = collectSubmissionFiles();
    if (!codeSnapshot || Object.keys(codeSnapshot).length === 0) {
      setSubmissionError('We could not capture your project files. Please ensure the editor has loaded and try again.');
      return;
    }

    setIsSubmittingProject(true);
    setSubmissionError(null);
    
    try {
      const response = await fetch(`${ENV.BACKEND_URL}/api/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          projectId,
          taskId: task_id || null,
          title: projectTitle.trim(),
          description: projectDescription.trim(),
          code: codeSnapshot,
          image: previewScreenshot,
          comprehensionAnswers: comprehensionAnswersData || {},
          evaluationId: evaluationId || null,
          forcedTimeout: lockSubmitModalExit,
        }),
      });

      if (!response.ok) {
        let message = 'Failed to submit project.';
        try {
          const data = await response.json();
          if (data?.error) {
            message = data.error;
          }
        } catch (_) {
          // ignore parse errors
        }
        throw new Error(message);
      }
      const submissionResponse = await response.json().catch(() => ({} as { isDisqualified?: boolean }));
      const isDisqualified = Boolean(submissionResponse?.isDisqualified);

      // Close both modals
      clearPersistedSubmissionQuestionsState();
      setShowComprehensionCheck(false);
      setShowEvaluationCheck(false);
      setShowSubmitModal(false);
      
      handleProjectSubmit(!isDisqualified);
      // Reset consent state after successful submission
      setHasConsentedToOverride(false);
      setExistingSubmission(null);
      // Reset comprehension answers
      setComprehensionAnswers({});
      // Reset evaluation result and ID
      setEvaluationResult(null);
      setEvaluationId(null);
      
      // Show success snackbar immediately after submission
      showSnackbar(
        <>
          Nice work! Navigate back to the{' '}
          <Link href="/browse" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
            tasks page
          </Link>{' '}
          to work on other projects
        </>,
        12000 // 12 seconds
      );
      
      // Recalculate popup state after successful submission (run in background)
      if (recalculateState) {
        try {
          await recalculateState();
        } catch (error) {
          console.error('Error recalculating popup state after submission:', error);
        }
      }
      
      // Call the callback if provided
      if (onProjectSubmitted) {
        try {
          await onProjectSubmitted();
        } catch (error) {
          console.error('Error in onProjectSubmitted callback:', error);
        }
      }
    } catch (error) {
      console.error('Error submitting project:', error);
      setSubmissionError(error instanceof Error ? error.message : 'Failed to submit project. ' + ERROR_TRY_AGAIN);
    } finally {
      setIsSubmittingProject(false);
    }
  };

  const handleCheckAnswers = () => {
    setAnswersChecked(true);
    setSubmissionError(null);
  };

  const handleComprehensionCheckSubmit = async () => {
    const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
    
    // For non-required tasks, require answers to be checked first
    if (!isRequiredTask && !isTutorialTask && !answersChecked) {
      setSubmissionError('Please check your answers before submitting.');
      return;
    }
    
    // For tutorial, just validate that questions are answered (no word count requirement)
    if (isTutorialTask) {
      const unansweredQuestions = comprehensionQuestions.filter(q => {
        // Multi-select questions are always valid, even if nothing is selected
        if (q.question_type === 'multi_select') {
          return false;
        }
        return !comprehensionAnswers[q.id]?.trim();
      });
      if (unansweredQuestions.length > 0) {
        setSubmissionError('Please answer all questions before submitting.');
        return;
      }
      
      // Save tutorial questions and answers
      if (userId) {
        try {
          // Prepare comprehension answers
          const comprehensionAnswersData = Object.fromEntries(
            comprehensionQuestions.map(q => {
              const answer = comprehensionAnswers[q.id] || '';
              // For multi_select questions, convert to binary array [1, 0, 1, 0]
              if (q.question_type === 'multi_select' && q.choices) {
                // Use ||| as delimiter to match what we use for storage
                const delimiter = '|||';
                const selectedChoices = answer ? answer.split(delimiter).filter(Boolean) : [];
                const binaryArray = q.choices.map(choice => selectedChoices.includes(choice) ? 1 : 0);
                return [q.question_name || q.id, binaryArray];
              }
              // For other question types, keep as string
              return [q.question_name || q.id, answer];
            })
          );
          
          const requestBody = {
            user_id: userId,
            questions: comprehensionQuestions.map(q => ({
              id: q.id,
              question_name: q.question_name || q.id,
              question: q.question,
              question_type: q.question_type,
              choices: q.choices,
              answer: q.answer,
            })),
            answers: comprehensionAnswersData,
          };
          
          console.log('Saving tutorial questions:', requestBody);
          
          const response = await fetch(`${ENV.BACKEND_URL}/api/comprehension-questions/save-tutorial`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Failed to save tutorial questions:', response.status, errorData);
            // Don't block submission if saving questions fails
          } else {
            const responseData = await response.json().catch(() => ({}));
            console.log('Successfully saved tutorial questions:', responseData);
          }
        } catch (error) {
          console.error('Error saving tutorial questions:', error);
          // Don't block submission if saving questions fails
        }
      }
      
      // Submit without storing answers (comprehensionAnswersData will be empty/ignored)
      await submitProject({});
      return;
    }
    
    const questionsForPaneValidation = isRequiredTask ? codeTailoredQuestions : comprehensionQuestions;

    // Regular validation for non-tutorial tasks.
    // Required tasks validate pane 2 questions only; pane 1 self-report is validated earlier.
    const unansweredQuestions = questionsForPaneValidation.filter(q => {
      if (q.question_type === 'multi_select') {
        // Multi-select questions are always valid, even if nothing is selected
        return false;
      }
      return !comprehensionAnswers[q.id]?.trim();
    });
    if (unansweredQuestions.length > 0) {
      setSubmissionError('Please answer all comprehension questions before submitting.');
      return;
    }

    // Validate minimum word count for free response questions
    const minWords = 10;
    const invalidFreeResponseQuestions = questionsForPaneValidation.filter(q => {
      if (isFreeResponseQuestionType(q.question_type)) {
        const answer = comprehensionAnswers[q.id] || '';
        const wordCount = countWords(answer);
        return wordCount < minWords;
      }
      return false;
    });
    if (invalidFreeResponseQuestions.length > 0) {
      setSubmissionError(`Free response answers must be at least ${minWords} words long.`);
      return;
    }

    const comprehensionAnswersData = buildComprehensionAnswersPayload(comprehensionQuestions);

    // Submit with comprehension answers
    await submitProject(comprehensionAnswersData);
  };

  const handleRequiredTaskSubmitConfirm = async () => {
    try {
      onRequiredTaskSubmitContinue?.();
    } catch (error) {
      console.warn('Failed to run onRequiredTaskSubmitContinue callback', error);
    }
    setShowRequiredTaskSubmitConfirm(false);
    setShowSubmitModal(true);
  };

  const showAssistantSide = assistantPlacement === 'side' && showAIAssistantForBottom;
  
  return (
    <div className="coding-editor h-full flex flex-col min-h-0">
      
      {/* Main content area - horizontal flex when side placement */}
      <div className="flex-1 flex min-h-0" style={{ overflow: 'hidden' }}>
        {/* Editor area */}
        <div 
          className="coding-editor-content flex-1 min-h-0"
          style={{
            display: (!showCodeEditor && !showTerminal && !showAIAssistantForBottom) ? 'none' : 'grid',
            gridTemplateRows: showCodeEditor && (showTerminal || (showAIAssistantForBottom && !showAssistantSide))
              ? `${editorHeight}px 1px minmax(0, 1fr)`
              : showCodeEditor
              ? '1fr'
              : (showTerminal || (showAIAssistantForBottom && !showAssistantSide))
              ? '0px 0px 1fr'
              : '1fr',
            overflow: 'hidden',
            borderRight: 'none'
          }}
        >
        {showCodeEditor && (
          <div className={`editor-pane min-h-0${showAssistantSide ? ' editor-pane-side' : ''}`}>
          {enableMultiFile ? (
            <MultiFileEditor
              onEditorMount={handleEditorMount}
              contextLength={contextLength}
              wait_time_for_sug={wait_time_for_sug}
              setSuggestionIdx={setSuggestionIdx}
              setTelemetry={setTelemetry}
              modelAutocomplete={modelAutocomplete}
              taskIndex={taskIndex}
              setLogprobsCompletion={setLogprobsCompletion}
              logProbs={logProbs}
              suggestionIdx={suggestionIdx}
              messageAIIndex={messageAIIndex}
              setIsSpinning={setIsSpinning}
              proactive_refresh_time_inactive={proactive_refresh_time_inactive}
              chatRef={chatRef}
              actualEditorRef={actualEditorRef}
              code={code}
              setCode={setCode}
              editorHeight={editorHeight}
              onEditorMouseDown={onEditorMouseDown}
              initialFiles={initialFiles}
              readOnly={readOnlyFiles}
              onSaveShortcut={handleSaveShortcut}
              onContentChange={handleFileContentChange}
              isAIAssistantVisible={isAIAssistantVisible}
              pendingAgentChanges={pendingAgentChanges}
              onAcceptAgentChanges={onAcceptAgentChanges}
              onRejectAgentChanges={onRejectAgentChanges}
              isLoadingFiles={isLoadingFiles}
            />
          ) : (
            <MonacoEditor
              height="100%"
              language="javascript"
              value={code}
              onChange={(value) => setCode(value || '')}
              onMount={(editor, monaco) => {
                // Set up the editor with proper theme and configuration
                monaco.editor.setTheme('vs-dark');
                handleEditorMount(editor, monaco);
              }}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineNumbers: 'on',
                wordWrap: 'on',
                automaticLayout: true,
                readOnly: false,
                theme: 'vs-dark',
                cursorBlinking: 'blink',
                cursorSmoothCaretAnimation: 'off',
                smoothScrolling: true,
                mouseWheelZoom: true,
                mouseWheelScrollSensitivity: 0.7,
                contextmenu: true,
                selectOnLineNumbers: true,
                roundedSelection: false,
                renderLineHighlight: 'none',
                folding: true,
                foldingStrategy: 'indentation',
                showFoldingControls: 'always',
                bracketPairColorization: { enabled: true },
                guides: {
                  bracketPairs: 'active',
                  indentation: true,
                },
              }}
            />
          )}
          </div>
        )}
        
        {showCodeEditor && showAIAssistantForBottom && !showAssistantSide && (
          <div 
            className="editor-resize-handle flex-shrink-0 cursor-row-resize group"
            onMouseDown={onEditorMouseDown}
            style={{
              height: 2
            }}
          >
            <div className="w-full h-px bg-gray-700 group-hover:bg-gray-600 mx-auto" />
          </div>
        )}
        
        {showAIAssistantForBottom && !showAssistantSide && (
          <div
            className="terminal-pane min-h-0"
            style={{ padding: 0, height: '100%', overflow: 'hidden', backgroundColor: '#000000' }}
          >
            <div style={{ padding: '0px 0px 0px 0px', height: '100%' }}>
              {typeof renderAssistantPane === 'function' ? renderAssistantPane() : null}
            </div>
          </div>
        )}
        </div>
        
        {/* Side assistant panel */}
        {showAssistantSide && (
          <>
            <div 
              className="assistant-side-divider flex-shrink-0 cursor-col-resize group"
              onMouseDown={handleAssistantSideMouseDown}
              style={{
                width: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <div
                className="h-full bg-gray-700 group-hover:bg-gray-600 transition-colors rounded-sm"
                style={{ width: 2 }}
              />
            </div>
            <div 
              className="assistant-side-pane flex-shrink-0"
              style={{ 
                width: assistantSideWidth,
                height: '100%',
                overflow: 'hidden',
                backgroundColor: '#000000'
              }}
            >
              {typeof renderAssistantPane === 'function' ? renderAssistantPane() : null}
            </div>
          </>
        )}
      </div>

      {/* Transparent overlay for assistant side panel resizing */}
      {isAssistantResizing && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'transparent',
            zIndex: 9999,
            cursor: 'col-resize',
            pointerEvents: 'all'
          }}
        />
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: sidebarOpen ? '256px' : '48px',
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.76)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={() => {
            if (!isRequiredTask && !lockSubmitModalExit) {
              setShowSubmitModal(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#11131a',
              borderRadius: '14px',
              padding: '1% 2% 1% 2%',
              width: `calc(100vw - ${sidebarOpen ? '320px' : '112px'})`,
              height: 'calc(100vh - 64px)',
              boxShadow: '0 30px 60px rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}
            >
              <h2
                style={{
                  color: '#e2e8f0',
                  fontSize: '22px',
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  paddingLeft: (showComprehensionCheck || showEvaluationCheck) ? '10px' : '0px',
                }}
              >
                {showEvaluationCheck
                  ? 'Submission Evaluation'
                  : showComprehensionCheck 
                  ? `Project-Specific Questions${modalContextSuffix}` 
                  : (taskName === 'Playground' || taskName === 'playground'
                      ? `Submit / Finish Tutorial${modalContextSuffix}`
                      : `Submit Project${modalContextSuffix}`)}
              </h2>
              {!isRequiredTask && !lockSubmitModalExit && (
                <button
                  type="button"
                  onClick={() => {
                    if (!isSubmittingProject) {
                      setShowSubmitModal(false);
                      setShowEvaluationCheck(false);
                      setShowComprehensionCheck(false);
                      setComprehensionSubPane('distractors');
                      // Clear comprehension state when closing
                      setComprehensionQuestions([]);
                      setComprehensionAnswers({});
                      setComprehensionQuestionsError(null);
                      setAnswersChecked(false);
                    }
                  }}
                  aria-label="Close submit modal"
                  disabled={isSubmittingProject}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    fontSize: '18px',
                    cursor: isSubmittingProject ? 'not-allowed' : 'pointer',
                    padding: '4px 8px',
                    lineHeight: 1,
                    transition: 'color 0.2s ease',
                    opacity: isSubmittingProject ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmittingProject) {
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmittingProject) {
                      e.currentTarget.style.color = '#9ca3af';
                    }
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Intro helper text for the first submission pane */}
            {!showComprehensionCheck && !showEvaluationCheck && (
              <p
                style={{
                  color: '#9ca3af',
                  fontSize: '16px',
                  marginTop: '-8px',
                  marginBottom: '28px',
                }}
              >
                {isWarmupTask
                  ? (isSecondWarmupTask
                      ? "Just like the previous warm-up, to finish submitting your project you'll first answer a few questions about which requirements you completed."
                      : "To finish submitting your project, you'll first answer a few questions about which requirements you were able to complete. You can now practice the submission flow.")
                  : isRequiredTask
                  ? "Please answer a few questions about your submission. Generating these questions can take 1-2 minutes."
                  : isTutorialTask
                  ? 'Before you submit any game-based website, you must add a project title, description, and preview image. For this tutorial task, feel free to add anything!'
                  : 'Before you continue, add a project title, description, and preview image for your submission that judges and other users will use. Any inappropriate content will disqualify you from our study.'}
              </p>
            )}
            {!showComprehensionCheck && !showEvaluationCheck && (
              <div
                style={{
                  borderTop: '1px solid rgba(148, 163, 184, 0.2)',
                  marginLeft: '-2%',
                  marginRight: '-2%',
                  marginBottom: '20px',
                }}
              />
            )}

            {showEvaluationCheck ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '32px',
                  minHeight: 0,
                  overflowY: 'auto',
                  paddingLeft: '10px',
                  paddingRight: '20px'
                }}
              >
                <p style={{ color: '#9ca3af', fontSize: '16px', marginBottom: '0px' }}>
                We're reviewing your submission for good-faith completion and offensive content. This may take up to 60 seconds.
                </p>
                
                {isLoadingEvaluation && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                    <LoadingSpinner size="lg" color="blue" className="mb-4" />
                    <p style={{ color: '#9ca3af', fontSize: '14px' }}>Evaluating your submission...</p>
                  </div>
                )}
                
                {evaluationError && (
                  <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px' }}>
                    {evaluationError}
                  </div>
                )}
                
                {!isLoadingEvaluation && evaluationResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
                    {/* Evaluation card: judgment first, then reasoning */}
                    <div style={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px'
                    }}>
                      {/* Judgment + explanation in one flow */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        {evaluationResult.is_valid ? (
                          <Check size={22} color="#10b981" />
                        ) : (
                          <X size={22} color="#ef4444" />
                        )}
                        <span style={{
                          color: evaluationResult.is_valid ? '#10b981' : '#ef4444',
                          fontSize: '18px',
                          fontWeight: 600
                        }}>
                          {evaluationResult.is_valid ? 'Valid Submission' : 'Invalid Submission'}
                        </span>
                      </div>
                      <div>
                        <h4 style={{
                          color: '#9ca3af',
                          fontSize: '14px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '8px'
                        }}>
                          Explanation
                        </h4>
                        <style>{`
                          .evaluation-explanation ul {
                            list-style-type: disc;
                            padding-left: 20px;
                            margin: 0.5em 0;
                          }
                          .evaluation-explanation ol {
                            list-style-type: decimal;
                            padding-left: 20px;
                            margin: 0.5em 0;
                          }
                          .evaluation-explanation li {
                            margin: 0.25em 0;
                            display: list-item;
                          }
                        `}</style>
                        <div style={{
                          color: '#d1d5db',
                          fontSize: '16px',
                          lineHeight: '1.6'
                        }} className="markdown-content evaluation-explanation">
                          <Markdown components={{ pre: (props) => <CodeBlockWithCopy className="bg-[#1e1e1e] rounded p-2 pr-10 my-2 overflow-x-auto text-[12px]" {...props} /> }}>{evaluationResult.explanation}</Markdown>
                        </div>
                      </div>
                    </div>

                    <p style={{
                      color: '#9ca3af',
                      fontSize: '16px',
                      lineHeight: '1.5',
                      margin: 0
                    }}>
                      {evaluationResult.is_valid
                        ? 'You can proceed with your submission!'
                        : lockSubmitModalExit
                        ? 'Time is up, so this task will be finalized as an invalid submission and you can continue to other tasks.'
                        : 'Your submission is invalid. Please review the feedback above and make changes before resubmitting.'}
                    </p>
                    
                    {/* Buttons */}
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      
                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        {!isRequiredTask && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (evaluationResult.is_valid) {
                                setShowEvaluationCheck(false);
                              } else {
                                if (lockSubmitModalExit) {
                                  setShowEvaluationCheck(false);
                                  await submitProject({});
                                } else {
                                  setShowSubmitModal(false);
                                  setShowEvaluationCheck(false);
                                  setShowComprehensionCheck(false);
                                  setComprehensionSubPane('distractors');
                                  // Clear comprehension state when canceling
                                  setComprehensionQuestions([]);
                                  setComprehensionAnswers({});
                                  setComprehensionQuestionsError(null);
                                  setAnswersChecked(false);
                                }
                              }
                            }}
                            disabled={isSubmittingProject}
                            style={{
                              padding: '6px 14px',
                              backgroundColor: '#4b5563',
                              color: '#f9fafb',
                              border: '1px solid rgba(148, 163, 184, 0.2)',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: 500,
                              cursor: isSubmittingProject ? 'not-allowed' : 'pointer',
                              transition: 'background-color 0.2s ease, opacity 0.2s ease',
                              opacity: isSubmittingProject ? 0.6 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!isSubmittingProject) {
                                e.currentTarget.style.backgroundColor = '#6b7280';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#4b5563';
                            }}
                          >
                            {evaluationResult.is_valid
                              ? 'Back'
                              : lockSubmitModalExit
                              ? 'Finalize and Continue'
                              : 'Revise Submission'}
                          </button>
                        )}
                        {evaluationResult.is_valid && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowEvaluationCheck(false);
                              emitContinuedToQuestions({ source: "evaluation_continue" });
                              setShowComprehensionCheck(true);
                            }}
                            style={{
                              padding: '6px 14px',
                              backgroundColor: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'background-color 0.2s ease, opacity 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#1d4ed8';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#2563eb';
                            }}
                          >
                            Continue
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : !showComprehensionCheck ? (
              <form
                onSubmit={handleProjectFormSubmit}
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  gridTemplateRows: 'auto auto 1fr auto',
                  gap: '1em',
                  minHeight: 0,
                  overflowY: 'auto',
                  paddingLeft: '10px',
                  paddingRight: '20px'
                }}
              >

              {isRequiredTask ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '36px' }}>
                {isLoadingComprehensionQuestions && comprehensionQuestions.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0 24px 0', gap: '10px' }}>
                    <LoadingSpinner size="lg" color="blue" />
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Generating questions...</p>
                  </div>
                ) : shouldShowRegenerateOnly ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px' }}>
                      {formattedComprehensionQuestionsError}
                    </div>
                  </div>
                ) : (
                  <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '14px' }}>
                    1. Which requirements were you able to successfully implement? (pre-populated from your Task Instructions checklist)
                  </div>
                  {(taskRequirements || []).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(taskRequirements || []).map((requirement, index) => {
                        const requirementId = `requirement-${index}`;
                        const checked = !!implementedRequirements[requirement];
                        return (
                          <label
                            key={requirementId}
                            htmlFor={requirementId}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              cursor: 'pointer',
                              color: '#e5e7eb',
                              fontSize: '14px',
                              padding: '12px 14px',
                              borderRadius: '6px',
                              border: '1px solid #4b5563',
                              backgroundColor: checked ? 'rgba(37, 99, 235, 0.18)' : '#1f2937',
                            }}
                          >
                            <input
                              id={requirementId}
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setImplementedRequirements((prev) => ({
                                  ...prev,
                                  [requirement]: isChecked,
                                }));
                              }}
                              style={{ margin: 0, accentColor: '#3b82f6' }}
                            />
                            <span>{requirement}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>
                      No requirements were provided for this task.
                    </div>
                  )}
                </div>

                {!isLoadingComprehensionQuestions && selfReportQuestions.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      paddingTop: '20px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <div style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '16px' }}>
                      {`For each statement in questions 2-${selfReportQuestions.length + 1}, select your level of agreement:`}
                    </div>
                    {selfReportQuestions.map((q, index) => {
                      const currentAnswer = comprehensionAnswers[q.id] || '';
                      return (
                        <div
                          key={q.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            paddingTop: index > 0 ? '18px' : '0px',
                            borderTop: index > 0 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                          }}
                        >
                          <div style={{ color: '#e5e7eb', fontSize: '14px', fontWeight: 500 }}>
                            <span>{index + 2}. </span>
                            <TextWithCodeBlocks text={q.question} />
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(q.choices || SELF_REPORT_OPTIONS).map((choice, choiceIndex) => {
                              const inputId = `self-report-${q.id}-${choiceIndex}`;
                              const isSelected = currentAnswer === choice;
                              return (
                                <label
                                  key={inputId}
                                  htmlFor={inputId}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: isSelected ? '#1e3a8a' : '#1f2937',
                                    border: isSelected ? '1px solid #3b82f6' : '1px solid #4b5563',
                                  }}
                                >
                                  <input
                                    id={inputId}
                                    type="radio"
                                    name={`self-report-${q.id}`}
                                    value={choice}
                                    checked={isSelected}
                                    onChange={(e) => {
                                      setComprehensionAnswers((prev) => ({
                                        ...prev,
                                        [q.id]: e.target.value,
                                      }));
                                      if (submissionError) {
                                        setSubmissionError(null);
                                      }
                                    }}
                                    style={{ margin: 0, accentColor: '#3b82f6' }}
                                  />
                                  <span
                                    className="markdown-content"
                                    style={{ color: '#e5e7eb', fontSize: '14px', fontWeight: isSelected ? 500 : 'normal' }}
                                    dangerouslySetInnerHTML={{ __html: convertBackticksToCode(choice) }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    paddingTop: '20px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: '#e5e7eb',
                      fontWeight: 500,
                      fontSize: '14px',
                    }}
                  >
                    <span>
                      {selfReportQuestions.length + 2}. Any other comments on your interaction with the AI assistant while completing this task? (Optional)
                    </span>
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                      {trimmedRequirementsCommentsLength} chars
                    </span>
                  </label>
                  <textarea
                    value={requirementsComments}
                    onChange={(e) => {
                      setRequirementsComments(e.target.value);
                      if (requirementsCommentsError && e.target.value.trim()) {
                        setRequirementsCommentsError(null);
                      }
                    }}
                    placeholder="Feel free to share anything you liked or disliked."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '6px',
                      border: requirementsCommentsError ? '1px solid #f87171' : '1px solid #4b5563',
                      backgroundColor: '#1f2937',
                      color: '#e5e7eb',
                      fontSize: '14px',
                      resize: 'vertical',
                      overflowY: 'auto'
                    }}
                  />
                  {requirementsCommentsError && (
                    <div style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>
                      {requirementsCommentsError}
                    </div>
                  )}
                </div>
                  </>
                )}

                {comprehensionQuestionsError && !shouldShowRegenerateOnly && (
                  <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px' }}>
                    {formattedComprehensionQuestionsError}
                  </div>
                )}
              </div>
              ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                <label 
                  htmlFor={titleInputId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: '#e5e7eb',
                    fontWeight: 500,
                    fontSize: '14px',
                    marginBottom: '0'
                  }}
                >
                  <span>Project Title</span>
                  <span style={{ color: isProjectTitleAtCap ? '#60a5fa' : '#9ca3af', fontSize: '12px' }}>
                    {projectTitle.length}/{PROJECT_TITLE_LIMIT}
                  </span>
                </label>
                <input
                  id={titleInputId}
                  type="text"
                  value={projectTitle}
                  maxLength={PROJECT_TITLE_LIMIT}
                  onChange={(e) => {
                    const nextTitle = e.target.value.slice(0, PROJECT_TITLE_LIMIT);
                    setProjectTitle(nextTitle);
                    if (projectTitleError) {
                      const trimmed = nextTitle.trim();
                      if (trimmed && trimmed.length <=   PROJECT_TITLE_LIMIT) {
                        setProjectTitleError(null);
                      }
                    }
                  }}
                  placeholder="Give a unique name for users to associate with your project"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid #4b5563',
                    backgroundColor: '#1f2937',
                    color: '#e5e7eb',
                    fontSize: '14px'
                  }}
                />
                {projectTitleError && (
                  <div style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>
                    {projectTitleError}
                  </div>
                )}
              </div>
              )}

              {!isRequiredTask && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                <label
                  htmlFor={descriptionInputId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: '#e5e7eb',
                    fontWeight: 500,
                    fontSize: '14px',
                    marginBottom: '0'
                  }}
                >
                  <span>Project Description</span>
                  <span style={{ color: isProjectDescriptionAtCap ? '#60a5fa' : '#9ca3af', fontSize: '12px' }}>
                    {trimmedProjectDescriptionLength}/{PROJECT_DESCRIPTION_LIMIT}
                  </span>
                </label>
                <textarea
                  id={descriptionInputId}
                  value={projectDescription}
                  maxLength={PROJECT_DESCRIPTION_LIMIT}
                  onChange={(e) => {
                    const nextDescription = e.target.value.slice(0, PROJECT_DESCRIPTION_LIMIT);
                    setProjectDescription(nextDescription);
                    if (projectDescriptionError) {
                      const trimmed = nextDescription.trim();
                      if (trimmed && trimmed.length <= PROJECT_DESCRIPTION_LIMIT) {
                        setProjectDescriptionError(null);
                      }
                    }
                  }}
                  placeholder="Summarize what a user can expect when they open your project, including key mechanics, features, and rules!"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid #4b5563',
                    backgroundColor: '#1f2937',
                    color: '#e5e7eb',
                    fontSize: '14px',
                    resize: 'none',
                    overflowY: 'auto'
                  }}
                />
                {projectDescriptionError && (
                  <div style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>
                    {projectDescriptionError}
                  </div>
                )}
              </div>
              )}

              {!isRequiredTask && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: 'auto 1fr auto',
                  gap: '6px',
                  minHeight: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', paddingBottom: 0 }}>
                  <span style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '14px' }}>
                    Project Preview Image
                  </span>
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                  >
                    <BsInfoCircle
                      style={{
                        color: '#9ca3af',
                        fontSize: '14px',
                        cursor: 'help'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#60a5fa';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const vw = window.innerWidth || document.documentElement.clientWidth;
                        const vh = window.innerHeight || document.documentElement.clientHeight;
                        const margin = 8;
                        let left = rect.left + rect.width / 2;
                        left = Math.min(Math.max(left, margin), vw - margin);
                        const spaceAbove = rect.top;
                        const spaceBelow = vh - rect.bottom;
                        const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                        const top = placeAbove ? rect.top : rect.bottom;
                        setTooltipText("This image is the thumbnail that judges will see before they click on your site. We suggest using a screenshot of your site, but you can upload any appropriate image with the button in the top right.");
                        setTooltipLeft(left);
                        setTooltipTop(top);
                        setTooltipPlaceAbove(placeAbove);
                        setTooltipVisible(true);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#9ca3af';
                        setTooltipVisible(false);
                      }}
                    />
                  </div>
                </div>
                <div
                  ref={previewBoxContainerRef}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'stretch',
                    minHeight: 0
                  }}
                >
                  <div
                    style={{
                      width: `${previewBoxSize.width}px`,
                      height: `${previewBoxSize.height}px`,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      aspectRatio: '16 / 9',
                      border: '1px solid rgba(148, 163, 184, 0.22)',
                      borderRadius: '0',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative'
                    }}
                  >
                    {isScreenshotLoading ? (
                      <>
                        <div
                          role="status"
                          aria-label="Loading snapshot"
                          className="flex flex-col items-center justify-center space-y-3"
                        >
                          <LoadingSpinner size="xl" color="blue" />
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            padding: '8px',
                            backgroundColor: 'rgba(31, 41, 55, 0.9)',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            borderRadius: '6px',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                            zIndex: 10,
                            width: '32px',
                            height: '32px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#2563eb';
                            e.currentTarget.style.borderColor = '#2563eb';
                            e.currentTarget.style.color = '#ffffff';
                            const rect = e.currentTarget.getBoundingClientRect();
                            const vw = window.innerWidth || document.documentElement.clientWidth;
                            const vh = window.innerHeight || document.documentElement.clientHeight;
                            const margin = 8;
                            let left = rect.left + rect.width / 2;
                            left = Math.min(Math.max(left, margin), vw - margin);
                            const spaceAbove = rect.top;
                            const spaceBelow = vh - rect.bottom;
                            const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                            const top = placeAbove ? rect.top : rect.bottom;
                            setTooltipText("Upload Custom Image");
                            setTooltipLeft(left);
                            setTooltipTop(top);
                            setTooltipPlaceAbove(placeAbove);
                            setTooltipVisible(true);
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(31, 41, 55, 0.9)';
                            e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)';
                            e.currentTarget.style.color = '#9ca3af';
                            setTooltipVisible(false);
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </button>
                      </>
                    ) : previewScreenshot ? (
                      <>
                        <img
                          src={previewScreenshot}
                          alt="Submission preview"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            borderRadius: '0',
                            border: '1px solid rgba(148, 163, 184, 0.18)'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            padding: '8px',
                            backgroundColor: 'rgba(31, 41, 55, 0.9)',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            borderRadius: '6px',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                            zIndex: 10,
                            width: '32px',
                            height: '32px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#2563eb';
                            e.currentTarget.style.borderColor = '#2563eb';
                            e.currentTarget.style.color = '#ffffff';
                            const rect = e.currentTarget.getBoundingClientRect();
                            const vw = window.innerWidth || document.documentElement.clientWidth;
                            const vh = window.innerHeight || document.documentElement.clientHeight;
                            const margin = 8;
                            let left = rect.left + rect.width / 2;
                            left = Math.min(Math.max(left, margin), vw - margin);
                            const spaceAbove = rect.top;
                            const spaceBelow = vh - rect.bottom;
                            const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                            const top = placeAbove ? rect.top : rect.bottom;
                            setTooltipText("Upload Custom Image");
                            setTooltipLeft(left);
                            setTooltipTop(top);
                            setTooltipPlaceAbove(placeAbove);
                            setTooltipVisible(true);
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(31, 41, 55, 0.9)';
                            e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)';
                            e.currentTarget.style.color = '#9ca3af';
                            setTooltipVisible(false);
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '12px' }}>
                          Preview not available yet. It will appear here as soon as it is ready.
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            padding: '8px',
                            backgroundColor: 'rgba(31, 41, 55, 0.9)',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            borderRadius: '6px',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                            zIndex: 10,
                            width: '32px',
                            height: '32px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#2563eb';
                            e.currentTarget.style.borderColor = '#2563eb';
                            e.currentTarget.style.color = '#ffffff';
                            const rect = e.currentTarget.getBoundingClientRect();
                            const vw = window.innerWidth || document.documentElement.clientWidth;
                            const vh = window.innerHeight || document.documentElement.clientHeight;
                            const margin = 8;
                            let left = rect.left + rect.width / 2;
                            left = Math.min(Math.max(left, margin), vw - margin);
                            const spaceAbove = rect.top;
                            const spaceBelow = vh - rect.bottom;
                            const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                            const top = placeAbove ? rect.top : rect.bottom;
                            setTooltipText("Upload Custom Image");
                            setTooltipLeft(left);
                            setTooltipTop(top);
                            setTooltipPlaceAbove(placeAbove);
                            setTooltipVisible(true);
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(31, 41, 55, 0.9)';
                            e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)';
                            e.currentTarget.style.color = '#9ca3af';
                            setTooltipVisible(false);
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </button>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
                {screenshotError && (
                  <div style={{ color: '#f87171', fontSize: '12px' }}>
                    {screenshotError}
                  </div>
                )}
              </div>
              )}

              {overriddenTestsCount > 0 && (
                <div
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.08)',
                    border: '1px solid rgba(252, 211, 77, 0.2)',
                    borderRadius: '10px',
                    color: '#fcd34d',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <BsExclamationTriangle style={{ flexShrink: 0, fontSize: '16px' }} />
                  <span>
                    {overriddenTestsCount} overridden test{overriddenTestsCount !== 1 ? 's' : ''}. Confirm you're
                    OK with the change before submitting.
                  </span>
                </div>
              )}

              {existingSubmission && (
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '10px',
                    color: '#fca5a5',
                    fontSize: '13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <BsExclamationTriangle style={{ flexShrink: 0, fontSize: '16px', marginTop: '2px' }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontWeight: 500 }}>
                        You already have a submission called "{existingSubmission.title}"!
                      </span>
                      <span>
                        Submitting again will override your current submission and clear all votes (if the voting period has begun) on your site.
                      </span>
                    </div>
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      paddingLeft: '24px'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hasConsentedToOverride}
                      onChange={(e) => setHasConsentedToOverride(e.target.checked)}
                      style={{
                        cursor: 'pointer',
                        width: '16px',
                        height: '16px',
                        accentColor: '#ef4444'
                      }}
                    />
                    <span style={{ fontSize: '12px' }}>
                      I understand and want to override my current submission
                    </span>
                  </label>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '8px'
                }}
              >
                <div
                  style={{
                    color: '#f87171',
                    fontSize: '14px',
                    fontWeight: 500,
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    visibility: submissionError ? 'visible' : 'hidden'
                  }}
                >
                  {submissionError || ' '}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                  {!isRequiredTask && taskName !== 'Playground' && taskName !== 'playground' && !shouldShowRegenerateOnly && (
                  <button
                    type="button"
                    onClick={handleDownloadProject}
                    disabled={isSubmittingProject}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#374151',
                      color: '#f9fafb',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '6px',
                      cursor: isSubmittingProject ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      opacity: isSubmittingProject ? 0.6 : 1,
                      transition: 'background-color 0.2s ease, opacity 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    onMouseEnter={(e) => {
                      if (isSubmittingProject) {
                        return;
                      }
                      e.currentTarget.style.backgroundColor = '#4b5563';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#374151';
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Download Project
                  </button>
                  )}
                  {shouldShowRegenerateOnly ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSubmissionError(null);
                        void fetchComprehensionQuestions("manual_regenerate");
                      }}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        transition: 'background-color 0.2s ease, opacity 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#1d4ed8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                      }}
                    >
                      Regenerate Questions
                    </button>
                  ) : (
                    !(isRequiredTask && comprehensionQuestions.length === 0 && !comprehensionQuestionsError) && (
                      <button
                        type="submit"
                        disabled={isFirstPaneActionDisabled}
                        style={{
                          padding: '6px 16px',
                          backgroundColor: '#2563eb',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: isFirstPaneActionDisabled ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                          opacity: isFirstPaneActionDisabled ? 0.6 : 1,
                          transition: 'background-color 0.2s ease, opacity 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (isFirstPaneActionDisabled) {
                            return;
                          }
                          e.currentTarget.style.backgroundColor = '#1d4ed8';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#2563eb';
                        }}
                      >
                        {(() => {
                          if (isCheckingExistingSubmission) {
                            return 'Checking…';
                          }
                          if (isCheckingModeration) {
                            return 'Checking content…';
                          }
                          if (isSubmittingProject) {
                            return 'Submitting…';
                          }

                          if (isRequiredTask) {
                            if (comprehensionQuestions.length === 0) {
                              return comprehensionQuestionsError ? 'Retry Generation' : 'Continue';
                            }
                            if (codeTailoredQuestions.length === 0) {
                              return 'Submit Project';
                            }
                            return 'Continue';
                          }

                          return 'Continue';
                        })()}
                      </button>
                    )
                  )}
                </div>
              </div>
            </form>
            ) : (
              <div
                ref={submissionQuestionsScrollRef}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '32px',
                  minHeight: 0,
                  overflowY: 'auto',
                  paddingLeft: '10px',
                  paddingRight: '20px'
                }}
              >
                <p style={{ color: '#9ca3af', fontSize: '16px', marginBottom: '0px' }}>
                  {isWarmupTask
                    ? (isSecondWarmupTask
                        ? "Just like the previous warm-up, you'll also be asked questions about your project and AI assistant usage before submitting."
                        : "Before submitting, you'll also be asked questions about your project and AI assistant usage. You can practice answering these questions below.")
                    : taskName === 'Playground' || taskName === 'playground'
                    ? 'Before submitting, please answer the following questions so we can understand your AI usage! Normally, these will be questions tailored to the task you just completed.'
                    : 'Before submitting, please answer the following questions so we can understand your AI usage! Try your best to answer each question. You won\'t be able to look back at your code.'}
                </p>
                <p style={{ color: '#93c5fd', fontSize: '14px', marginTop: '-12px', marginBottom: '0px' }}>
                  You may have to scroll down to see all of the questions and the button to proceed.
                </p>
                {!isWarmupTask && (
                  <p style={{ color: '#9ca3af', fontSize: '16px', marginTop: '-18px', marginBottom: '0px' }}>

                  </p>
                )}
                
                {isLoadingComprehensionQuestions && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                    <LoadingSpinner size="lg" color="blue" className="mb-4" />
                    <p style={{ color: '#9ca3af', fontSize: '14px' }}>Generating questions...</p>
                    <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '8px' }}>
                      If questions do not generate after 60 seconds, please refresh the page and try again.
                    </p>
                  </div>
                )}
                
                {comprehensionQuestionsWarnings.length > 0 && (
                  <div style={{ padding: '12px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', color: '#fcd34d', fontSize: '13px', marginBottom: '12px' }}>
                    {comprehensionQuestionsWarnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                )}
                {comprehensionQuestionsError && (
                  <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px' }}>
                    {formattedComprehensionQuestionsError}
                  </div>
                )}
                
                {!isLoadingComprehensionQuestions && comprehensionPaneQuestions.length === 0 && !comprehensionQuestionsError && (
                  <p style={{ color: '#9ca3af', fontSize: '14px', fontStyle: 'italic' }}>
                    No questions available. You can proceed with submission.
                  </p>
                )}
                
                {!isLoadingComprehensionQuestions && !comprehensionQuestionsError && (
                  <>
                    {(() => {
                      const questionsForCurrentPane = comprehensionPaneQuestions;
                      const numberOffset = isRequiredTask ? 0 : 0;
                      // Count self-report questions (including sanity check)
                      const paneSelfReportQuestions = questionsForCurrentPane.filter(q => 
                        q.question_name && (q.question_name.startsWith('self_report_') || q.question_name === 'sanity_check')
                      );
                      const selfReportQuestionCount = paneSelfReportQuestions.length;
                      const hasMultipleSelfReportQuestions = selfReportQuestionCount > 1;
                      const firstSelfReportQuestionIndex = questionsForCurrentPane.findIndex(
                        q => q.question_name && (q.question_name.startsWith('self_report_') || q.question_name === 'sanity_check')
                      );
                      const firstSelfReportQuestionNumber =
                        firstSelfReportQuestionIndex >= 0 ? numberOffset + firstSelfReportQuestionIndex + 1 : 0;
                      const lastSelfReportQuestionNumber =
                        firstSelfReportQuestionNumber > 0
                          ? firstSelfReportQuestionNumber + selfReportQuestionCount - 1
                          : 0;
                      
                      return questionsForCurrentPane.map((q, index) => {
                        const currentAnswer = comprehensionAnswers[q.id] || '';
                        // Check if this is a self-report question (should not reveal answers)
                        // Includes sanity check since it uses the same self-report options
                        const isSelfReportQuestion = Boolean(q.question_name && (q.question_name.startsWith('self_report_') || q.question_name === 'sanity_check'));
                        // Check if this is a report question (should be disabled during check answer)
                        const isReportQuestion = Boolean(q.question_name && (q.question_name.toLowerCase().includes('report') || q.question_name.startsWith('report_')));
                        // Only apply answer checking to non-self-report MCQA questions
                        const shouldShowAnswers = answersChecked && !isSelfReportQuestion;
                        // Disable report questions during check answer phase
                        const shouldDisableQuestion = answersChecked && isReportQuestion;
                        // Show grouped instruction when there are multiple self-report questions.
                        const isFirstSelfReportQuestion =
                          hasMultipleSelfReportQuestions &&
                          index === firstSelfReportQuestionIndex &&
                          isSelfReportQuestion;
                        
                        return (
                      <div 
                        key={q.id || index} 
                        style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: isBinaryChoiceQuestionType(q.question_type) ? '6px' : '12px',
                          paddingTop: index > 0 ? '20px' : '0px',
                          borderTop: index > 0 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
                        }}
                      >
                        {isFirstSelfReportQuestion && (
                          <div
                            style={{
                              color: '#ffffff',
                              fontSize: '16px',
                              marginBottom: '12px'
                            }}
                          >
                            For questions {firstSelfReportQuestionNumber} through {lastSelfReportQuestionNumber}, rate how much you agree with the following statements:
                          </div>
                        )}
                      <div
                        style={{
                          color: '#e5e7eb',
                          fontWeight: 500,
                          fontSize: '14px'
                        }}
                      >
                        <span>{numberOffset + index + 1}. </span>
                        <TextWithCodeBlocks text={q.question} />
                      </div>
                      
                      {isBinaryChoiceQuestionType(q.question_type) && q.choices && q.choices.length > 0 ? (
                        <>
                          <div 
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'row',
                              flexWrap: 'wrap',
                              gap: '8px',
                              marginTop: '0px'
                            }}
                          >
                            {q.choices.map((choice, choiceIndex) => {
                              const isSelected = currentAnswer === choice;
                              const inputId = `comp-${q.id}-${choiceIndex}`;
                              // Determine if this is the correct answer (for showing after check)
                              // Answer is 1-based index (1, 2, 3, 4, 5), convert to 0-based for comparison
                              let correctAnswerIndex: number | null = null;
                              if (q.answer !== null && q.answer !== undefined && q.answer !== '') {
                                if (typeof q.answer === 'number') {
                                  correctAnswerIndex = q.answer - 1; // Convert 1-based to 0-based
                                } else if (typeof q.answer === 'string' && !isNaN(Number(q.answer)) && q.answer.trim() !== '') {
                                  correctAnswerIndex = Number(q.answer) - 1;
                                }
                              }
                              
                              const isCorrect = shouldShowAnswers && correctAnswerIndex !== null && choiceIndex === correctAnswerIndex;
                              const isDisabled = shouldShowAnswers || shouldDisableQuestion;
                              // Show checkmark for correct answer, X for incorrect answer (regardless of user selection)
                              // This makes it clearer: check = "this is the right answer", not "you picked this correctly"
                              
                              return (
                                <label
                                  key={choiceIndex}
                                  htmlFor={inputId}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: isSelected ? '#1e3a8a' : '#1f2937',
                                    border: isSelected 
                                      ? '1px solid #3b82f6' 
                                      : '1px solid #4b5563',
                                    transition: 'background-color 0.2s, border-color 0.2s',
                                    flex: '0 1 auto',
                                    minWidth: 'fit-content',
                                    position: 'relative'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isDisabled && !isSelected) {
                                      e.currentTarget.style.backgroundColor = '#374151';
                                      e.currentTarget.style.borderColor = '#6b7280';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = '#1f2937';
                                      e.currentTarget.style.borderColor = '#4b5563';
                                    }
                                  }}
                                >
                                  <input
                                    id={inputId}
                                    type="radio"
                                    name={`comp-${q.id}`}
                                    value={choice}
                                    checked={isSelected}
                                    disabled={isDisabled}
                                    onChange={(e) => {
                                      if (!isDisabled) {
                                        setComprehensionAnswers(prev => ({
                                          ...prev,
                                          [q.id]: e.target.value
                                        }));
                                        if (submissionError) {
                                          setSubmissionError(null);
                                        }
                                      }
                                    }}
                                    style={{
                                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                                      accentColor: '#3b82f6'
                                    }}
                                  />
                                  <span 
                                    className="markdown-content" 
                                    style={{ 
                                      color: '#e5e7eb',
                                      fontSize: '14px',
                                      fontWeight: isSelected ? 500 : 'normal',
                                      pointerEvents: 'none'
                                    }}
                                    dangerouslySetInnerHTML={{ __html: convertBackticksToCode(choice) }}
                                  />
                                  {/* Check/X icon right after text to show if this is the correct answer (not user accuracy) */}
                                  {shouldShowAnswers && (
                                    <span style={{ 
                                      marginLeft: '8px',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}>
                                      {isCorrect ? (
                                        <Check size={18} color="#10b981" />
                                      ) : (
                                        <X size={18} color="#ef4444" />
                                      )}
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                          {/* Show summary of what user got wrong for non-self-report MCQA questions after checking */}
                          {shouldShowAnswers && q.answer !== null && q.answer !== undefined && q.answer !== '' && (typeof q.answer === 'number' || (typeof q.answer === 'string' && q.answer.trim() !== '' && !isNaN(Number(q.answer)))) && (
                            <div style={{
                              marginTop: '8px',
                              padding: '8px 12px',
                              backgroundColor: 'transparent',
                              border: '1px solid #3b82f6',
                              borderRadius: '6px',
                              fontSize: '13px',
                              color: '#e5e7eb'
                            }}>
                              {(() => {
                                const correctAnswerIndex = typeof q.answer === 'number' ? q.answer - 1 : (typeof q.answer === 'string' && !isNaN(Number(q.answer))) ? Number(q.answer) - 1 : null;
                                const correctAnswerText = correctAnswerIndex !== null && q.choices && correctAnswerIndex >= 0 && correctAnswerIndex < q.choices.length
                                  ? q.choices[correctAnswerIndex]
                                  : q.answer;
                                const userSelectedText = currentAnswer || 'nothing';
                                const isUserCorrect = currentAnswer === correctAnswerText;
                                
                                if (isUserCorrect) {
                                  return (
                                    <span>
                                      <strong style={{ color: '#10b981' }}>✓ Correct! </strong>
                                      You selected the right answer.
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span>
                                      <strong style={{ color: '#ef4444' }}>✗ Incorrect. </strong>
                                      You selected <strong>"{userSelectedText}"</strong>, but the correct answer is <strong style={{ color: '#60a5fa' }}>"{correctAnswerText}"</strong>.
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                          )}
                        </>
                      ) : q.question_type === 'multi_select' && q.choices && q.choices.length > 0 ? (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {q.choices.map((choice, choiceIndex) => {
                              // Use ||| as delimiter to avoid conflicts with commas in choice text
                              const delimiter = '|||';
                              const selectedAnswers = currentAnswer ? currentAnswer.split(delimiter).filter(Boolean) : [];
                              const isChecked = selectedAnswers.includes(choice);
                              const checkboxId = `comp-${q.id}-${choiceIndex}`;
                              
                              // Parse the correct answer (binary array like [1, 0, 1, 0])
                              let correctAnswers: number[] = [];
                              if (shouldShowAnswers && q.answer) {
                                if (Array.isArray(q.answer)) {
                                  correctAnswers = q.answer;
                                } else if (typeof q.answer === 'string') {
                                  try {
                                    // Try parsing as JSON array
                                    const parsed = JSON.parse(q.answer);
                                    if (Array.isArray(parsed)) {
                                      correctAnswers = parsed;
                                    }
                                  } catch (e) {
                                    // If not JSON, might be a comma-separated string
                                    correctAnswers = q.answer.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
                                  }
                                }
                              }
                              
                              // Determine if this choice is correct (1 in the answer array)
                              const isCorrect = shouldShowAnswers && correctAnswers.length > choiceIndex && correctAnswers[choiceIndex] === 1;
                              // Determine if user selected this choice
                              const userSelected = isChecked;
                              // Determine if user selected incorrectly (selected when should not, or didn't select when should)
                              const isIncorrect = shouldShowAnswers && (
                                (userSelected && !isCorrect) || (!userSelected && isCorrect)
                              );
                              // Disable if answers are checked or if this is a report question during check answer
                              const shouldDisableInput = shouldShowAnswers || shouldDisableQuestion;
                              
                              // Show checkmark for correct answer, X for incorrect answer (regardless of user selection)
                              // This makes it clearer: check = "this is the right answer", not "you picked this correctly"
                              
                              return (
                                <label
                                  key={choiceIndex}
                                  htmlFor={checkboxId}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: shouldDisableInput ? 'not-allowed' : 'pointer',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #4b5563',
                                    transition: shouldDisableInput ? 'none' : 'background-color 0.2s, border-color 0.2s',
                                    position: 'relative',
                                    width: '100%',
                                    pointerEvents: shouldDisableInput ? 'none' : 'auto'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!shouldDisableInput) {
                                      e.currentTarget.style.backgroundColor = '#374151';
                                      e.currentTarget.style.borderColor = '#6b7280';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!shouldDisableInput) {
                                      e.currentTarget.style.backgroundColor = '#1f2937';
                                      e.currentTarget.style.borderColor = '#4b5563';
                                    }
                                  }}
                                >
                                  <input
                                    id={checkboxId}
                                    type="checkbox"
                                    value={choice}
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (!shouldDisableInput) {
                                        // Use ||| as delimiter to avoid conflicts with commas in choice text
                                        const delimiter = '|||';
                                        const selectedAnswers = currentAnswer ? currentAnswer.split(delimiter).filter(Boolean) : [];
                                        let newAnswers: string[];
                                        
                                        if (e.target.checked) {
                                          newAnswers = [...selectedAnswers, choice];
                                        } else {
                                          newAnswers = selectedAnswers.filter(a => a !== choice);
                                        }
                                        
                                        const newAnswerString = newAnswers.join(delimiter);
                                        
                                        setComprehensionAnswers(prev => ({
                                          ...prev,
                                          [q.id]: newAnswerString
                                        }));
                                        if (submissionError) {
                                          setSubmissionError(null);
                                        }
                                      }
                                    }}
                                    onClick={(e) => {
                                      if (shouldDisableInput) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }
                                    }}
                                    style={{
                                      cursor: shouldDisableInput ? 'not-allowed' : 'pointer',
                                      accentColor: '#3b82f6',
                                      pointerEvents: shouldDisableInput ? 'none' : 'auto'
                                    }}
                                  />
                                  <span 
                                    className="markdown-content" 
                                    style={{ 
                                      color: '#e5e7eb',
                                      fontSize: '14px',
                                      fontWeight: 'normal',
                                      pointerEvents: 'none'
                                    }}
                                    dangerouslySetInnerHTML={{ __html: convertBackticksToCode(choice) }}
                                  />
                                  {/* Check/X icon right after text to show if this is the correct answer (not user accuracy) */}
                                  {shouldShowAnswers && (
                                    <span style={{ 
                                      marginLeft: '8px',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}>
                                      {isCorrect ? (
                                        <Check size={18} color="#10b981" />
                                      ) : (
                                        <X size={18} color="#ef4444" />
                                      )}
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                          {/* Show summary of what user got wrong for multi_select questions after checking */}
                          {shouldShowAnswers && q.answer && (
                            <div style={{
                              marginTop: '8px',
                              padding: '8px 12px',
                              backgroundColor: 'transparent',
                              border: '1px solid #3b82f6',
                              borderRadius: '6px',
                              fontSize: '13px',
                              color: '#e5e7eb'
                            }}>
                              {(() => {
                                // Parse correct answers
                                let correctAnswers: number[] = [];
                                if (Array.isArray(q.answer)) {
                                  correctAnswers = q.answer;
                                } else if (typeof q.answer === 'string') {
                                  try {
                                    const parsed = JSON.parse(q.answer);
                                    if (Array.isArray(parsed)) {
                                      correctAnswers = parsed;
                                    }
                                  } catch (e) {
                                    correctAnswers = q.answer.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
                                  }
                                }
                                
                                // Get user selections
                                const delimiter = '|||';
                                const userSelected = currentAnswer ? currentAnswer.split(delimiter).filter(Boolean) : [];
                                
                                // Categorize choices
                                const correctlySelected: string[] = [];
                                const missed: string[] = [];
                                const incorrectlySelected: string[] = [];
                                
                                q.choices?.forEach((choice, idx) => {
                                  const shouldBeSelected = correctAnswers.length > idx && correctAnswers[idx] === 1;
                                  const wasSelected = userSelected.includes(choice);
                                  
                                  if (shouldBeSelected && wasSelected) {
                                    correctlySelected.push(choice);
                                  } else if (shouldBeSelected && !wasSelected) {
                                    missed.push(choice);
                                  } else if (!shouldBeSelected && wasSelected) {
                                    incorrectlySelected.push(choice);
                                  }
                                });
                                
                                // Build summary message
                                const parts: React.ReactNode[] = [];
                                
                                if (correctlySelected.length > 0) {
                                  parts.push(
                                    <span key="correct">
                                      <strong style={{ color: '#10b981' }}>✓ Correctly selected: </strong>
                                      {correctlySelected.join(', ')}
                                    </span>
                                  );
                                }
                                
                                if (missed.length > 0) {
                                  parts.push(
                                    <span key="missed">
                                      <strong style={{ color: '#f59e0b' }}>✗ Missed: </strong>
                                      {missed.join(', ')}
                                    </span>
                                  );
                                }
                                
                                if (incorrectlySelected.length > 0) {
                                  parts.push(
                                    <span key="incorrect">
                                      <strong style={{ color: '#ef4444' }}>✗ Incorrectly selected: </strong>
                                      {incorrectlySelected.join(', ')}
                                    </span>
                                  );
                                }
                                
                                if (parts.length === 0) {
                                  return (
                                    <span>
                                      <strong style={{ color: '#10b981' }}>✓ Perfect! </strong>
                                      You selected all the correct answers.
                                    </span>
                                  );
                                }
                                
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {parts.map((part, idx) => (
                                      <div key={idx}>{part}</div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <textarea
                            id={`comp-${q.id}`}
                            value={currentAnswer}
                            disabled={shouldDisableQuestion || shouldShowAnswers}
                            onChange={(e) => {
                              if (!shouldDisableQuestion && !shouldShowAnswers) {
                                setComprehensionAnswers(prev => ({
                                  ...prev,
                                  [q.id]: e.target.value
                                }));
                                if (submissionError) {
                                  setSubmissionError(null);
                                }
                              }
                            }}
                            placeholder="Your answer..."
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              borderRadius: '6px',
                              border: '1px solid #4b5563',
                              backgroundColor: '#1f2937',
                              color: '#e5e7eb',
                              fontSize: '14px',
                              resize: 'vertical',
                              fontFamily: 'inherit',
                              cursor: shouldShowAnswers ? 'not-allowed' : 'text',
                              opacity: shouldShowAnswers ? 0.7 : 1
                            }}
                          />
                          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                            {(() => {
                              const wordCount = countWords(currentAnswer);
                              const minWords = 10;
                              const isValid = wordCount >= minWords;
                              return (
                                <span style={{ color: isValid ? '#9ca3af' : '#f87171' }}>
                                  {wordCount} / {minWords} words {!isValid && '- minimum requirement'}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                      });
                    })()}
                  </>
                )}

                {/* Calculate overall score for multi_select questions */}
                {(() => {
                  let scoreInfo: { scorePercent: number; questionCount: number } | null = null;
                  
                  if (answersChecked && !isRequiredTask) {
                    const multiSelectQuestions = comprehensionQuestions.filter(q => 
                      q.question_type === 'multi_select' && 
                      !q.question_name?.startsWith('self_report_')
                    );
                    
                    if (multiSelectQuestions.length > 0) {
                      const scores = multiSelectQuestions.map(q => {
                        const currentAnswer = comprehensionAnswers[q.id] || '';
                        const delimiter = '|||';
                        const selectedAnswers = currentAnswer ? currentAnswer.split(delimiter).filter(Boolean) : [];
                        
                        // Parse correct answer
                        let correctAnswers: number[] = [];
                        if (q.answer) {
                          if (Array.isArray(q.answer)) {
                            correctAnswers = q.answer;
                          } else if (typeof q.answer === 'string') {
                            try {
                              const parsed = JSON.parse(q.answer);
                              if (Array.isArray(parsed)) {
                                correctAnswers = parsed;
                              }
                            } catch (e) {
                              correctAnswers = q.answer.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
                            }
                          }
                        }
                        
                        if (correctAnswers.length === 0 || q.choices === undefined) return null;
                        
                        // Calculate score: compare user selections with correct answers
                        let correctCount = 0;
                        let totalCount = correctAnswers.length;
                        
                        for (let i = 0; i < q.choices.length; i++) {
                          const shouldBeSelected = correctAnswers[i] === 1;
                          const isSelected = selectedAnswers.includes(q.choices[i]);
                          if (shouldBeSelected === isSelected) {
                            correctCount++;
                          }
                        }
                        
                        return totalCount > 0 ? correctCount / totalCount : 0;
                      }).filter((score): score is number => score !== null);
                      
                      if (scores.length > 0) {
                        const overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                        const scorePercent = Math.round(overallScore * 100);
                        scoreInfo = {
                          scorePercent,
                          questionCount: scores.length
                        };
                      }
                    }
                  }
                  
                  return (
                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 'auto',
                        paddingTop: '16px'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {submissionError ? (
                          <div
                            style={{
                              color: '#f87171',
                              fontSize: '12px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {submissionError}
                          </div>
                        ) : scoreInfo ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                            <div style={{
                              fontSize: '16px',
                              fontWeight: 500,
                              color: '#e5e7eb',
                              display: 'flex',
                              alignItems: 'center',
                              lineHeight: '1.5',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              <span style={{ color: '#e5e7eb', flexShrink: 0 }}>Overall Score: </span>
                              <span style={{
                                color: scoreInfo.scorePercent >= 70 ? '#10b981' : scoreInfo.scorePercent >= 50 ? '#f59e0b' : '#ef4444',
                                fontWeight: 600,
                                marginLeft: '6px',
                                flexShrink: 0
                              }}>
                                {scoreInfo.scorePercent}%
                              </span>
                              <span style={{ color: '#9ca3af', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                ({scoreInfo.questionCount} question{scoreInfo.questionCount > 1 ? 's' : ''})
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                              Feel free to submit! We will use these responses to improve our AI system, but this score does not affect compensation or progress.
                            </div>
                          </div>
                        ) : (
                          <div style={{ visibility: 'hidden', fontSize: '12px' }}> </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
                  {!isRequiredTask && !shouldShowRegenerateOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowComprehensionCheck(false);
                        setShowEvaluationCheck(false);
                        // Clear comprehension state when going back
                        setComprehensionQuestions([]);
                        setComprehensionAnswers({});
                        setComprehensionQuestionsError(null);
                        setAnswersChecked(false);
                      }}
                      disabled={isSubmittingProject || (!isRequiredTask && answersChecked)}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: '#4b5563',
                        color: '#f9fafb',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '6px',
                        cursor: (isSubmittingProject || (!isRequiredTask && answersChecked)) ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: (isSubmittingProject || (!isRequiredTask && answersChecked)) ? 0.6 : 1,
                        transition: 'background-color 0.2s ease, opacity 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (isSubmittingProject || (!isRequiredTask && answersChecked)) {
                          return;
                        }
                        e.currentTarget.style.backgroundColor = '#6b7280';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#4b5563';
                      }}
                    >
                      Back
                    </button>
                  )}
                  {isRequiredTask && comprehensionSubPane === 'distractors' && codeBlockPaneQuestions.length > 0 && !shouldShowRegenerateOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        emitContinuedToQuestions({ source: "distractor_pane_continue" });
                        setComprehensionSubPane('code_block');
                      }}
                      disabled={isSubmittingProject || isLoadingComprehensionQuestions || (distractorPaneQuestions.length > 0 && distractorPaneQuestions.some(q => {
                        if (q.question_type === 'multi_select') return false;
                        return !comprehensionAnswers[q.id]?.trim();
                      }))}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (isSubmittingProject || isLoadingComprehensionQuestions || (distractorPaneQuestions.length > 0 && distractorPaneQuestions.some(q => {
                          if (q.question_type === 'multi_select') return false;
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: (isSubmittingProject || isLoadingComprehensionQuestions || (distractorPaneQuestions.length > 0 && distractorPaneQuestions.some(q => {
                          if (q.question_type === 'multi_select') return false;
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 0.6 : 1,
                        transition: 'background-color 0.2s ease, opacity 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!(isSubmittingProject || isLoadingComprehensionQuestions || (distractorPaneQuestions.length > 0 && distractorPaneQuestions.some(q => {
                          if (q.question_type === 'multi_select') return false;
                          return !comprehensionAnswers[q.id]?.trim();
                        })))) e.currentTarget.style.backgroundColor = '#1d4ed8';
                      }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
                    >
                      Continue
                    </button>
                  )}
                  {!isRequiredTask && taskName !== 'Playground' && taskName !== 'playground' && !shouldShowRegenerateOnly && (
                    <button
                      type="button"
                      onClick={answersChecked ? handleComprehensionCheckSubmit : handleCheckAnswers}
                      disabled={isSubmittingProject || isLoadingComprehensionQuestions || (answersChecked ? (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                        // Multi-select questions are always valid, even if nothing is selected
                        if (q.question_type === 'multi_select') {
                          return false;
                        }
                        if (isFreeResponseQuestionType(q.question_type)) {
                          const answer = comprehensionAnswers[q.id] || '';
                          return !answer.trim() || countWords(answer) < 10;
                        }
                        return !comprehensionAnswers[q.id]?.trim();
                      })) : (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                        // Multi-select questions are always valid
                        if (q.question_type === 'multi_select') {
                          return false;
                        }
                        // Check if all questions are answered
                        return !comprehensionAnswers[q.id]?.trim();
                      })))}
                      style={answersChecked ? {
                        padding: '6px 16px',
                        background: 'linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)',
                        backgroundSize: '400% 400%',
                        backgroundPosition: '0% 50%',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          if (isFreeResponseQuestionType(q.question_type)) {
                            const answer = comprehensionAnswers[q.id] || '';
                            return !answer.trim() || countWords(answer) < 10;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          if (isFreeResponseQuestionType(q.question_type)) {
                            const answer = comprehensionAnswers[q.id] || '';
                            return !answer.trim() || countWords(answer) < 10;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 0.6 : 1,
                        transition: 'opacity 0.2s ease, transform 0.2s ease'
                      } : {
                        padding: '6px 16px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 0.6 : 1,
                        transition: 'background-color 0.2s ease, opacity 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (answersChecked) {
                          if (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                            // Multi-select questions are always valid, even if nothing is selected
                            if (q.question_type === 'multi_select') {
                              return false;
                            }
                            if (isFreeResponseQuestionType(q.question_type)) {
                              const answer = comprehensionAnswers[q.id] || '';
                              return !answer.trim() || countWords(answer) < 10;
                            }
                            return !comprehensionAnswers[q.id]?.trim();
                          }))) {
                            e.currentTarget.style.animation = '';
                            return;
                          }
                          e.currentTarget.style.animation = 'gradient-shift 3s ease infinite';
                        } else {
                          if (!(isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                            if (q.question_type === 'multi_select') {
                              return false;
                            }
                            return !comprehensionAnswers[q.id]?.trim();
                          })))) {
                            e.currentTarget.style.backgroundColor = '#1d4ed8';
                          }
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (answersChecked) {
                          e.currentTarget.style.animation = '';
                        } else {
                          e.currentTarget.style.backgroundColor = '#2563eb';
                        }
                      }}
                    >
                      {answersChecked ? (isSubmittingProject ? 'Submitting…' : 'Submit Project') : 'Check Answers'}
                    </button>
                  )}
                  {((isRequiredTask && (comprehensionSubPane === 'code_block' || codeBlockPaneQuestions.length === 0)) || (taskName === 'Playground' || taskName === 'playground')) && !shouldShowRegenerateOnly && (
                    <button
                      type="button"
                      onClick={handleComprehensionCheckSubmit}
                      disabled={isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                        // Multi-select questions are always valid, even if nothing is selected
                        if (q.question_type === 'multi_select') {
                          return false;
                        }
                        const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
                        // For tutorial tasks, no word count requirement
                        if (isFreeResponseQuestionType(q.question_type)) {
                          const answer = comprehensionAnswers[q.id] || '';
                          if (isTutorialTask) {
                            return !answer.trim();
                          }
                          return !answer.trim() || countWords(answer) < 10;
                        }
                        return !comprehensionAnswers[q.id]?.trim();
                      }))}
                      style={{
                        padding: '6px 16px',
                        background: 'linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)',
                        backgroundSize: '400% 400%',
                        backgroundPosition: '0% 50%',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
                          // For tutorial tasks, no word count requirement
                          if (isFreeResponseQuestionType(q.question_type)) {
                            const answer = comprehensionAnswers[q.id] || '';
                            if (isTutorialTask) {
                              return !answer.trim();
                            }
                            return !answer.trim() || countWords(answer) < 10;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
                          // For tutorial tasks, no word count requirement
                          if (isFreeResponseQuestionType(q.question_type)) {
                            const answer = comprehensionAnswers[q.id] || '';
                            if (isTutorialTask) {
                              return !answer.trim();
                            }
                            return !answer.trim() || countWords(answer) < 10;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 0.6 : 1,
                        transition: 'opacity 0.2s ease, transform 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
                        if (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionPaneQuestions.length > 0 && comprehensionPaneQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          // For tutorial tasks, no word count requirement
                          if (isFreeResponseQuestionType(q.question_type)) {
                            const answer = comprehensionAnswers[q.id] || '';
                            if (isTutorialTask) {
                              return !answer.trim();
                            }
                            return !answer.trim() || countWords(answer) < 10;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) {
                          e.currentTarget.style.animation = '';
                          return;
                        }
                        e.currentTarget.style.animation = 'gradient-shift 3s ease infinite';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.animation = '';
                      }}
                    >
                      {isSubmittingProject ? 'Submitting…' : (taskName === 'Playground' || taskName === 'playground' ? 'Submit / Finish Tutorial' : 'Submit Project')}
                    </button>
                  )}
                  {shouldShowRegenerateOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setSubmissionError(null);
                        void fetchComprehensionQuestions("manual_regenerate");
                      }}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#1d4ed8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                      }}
                    >
                      Regenerate Questions
                    </button>
                  )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

        </div>
      )}

      {showLowEngagementReminder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001
          }}
        >
          <div
            style={{
              width: 'min(560px, calc(100vw - 120px))',
              backgroundColor: '#11131a',
              border: '1px solid rgba(148, 163, 184, 0.28)',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 30px 60px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '20px', fontWeight: 600 }}>
              We noticed you didn&apos;t spend much time on this task
            </h3>
            <p style={{ margin: 0, color: '#9ca3af', fontSize: '15px', lineHeight: 1.5 }}>
              Remember: the top 10 highest-scoring submissions (by user voting) each win $10. Spending more time with the AI assistant can help you build something that stands out.<br /><br />You can still submit—or go back and keep building.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowLowEngagementReminder(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  color: '#cbd5e1',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLowEngagementReminder(false);
                  proceedToSubmitModalOrConfirm(false);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Continue to submit
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldRequireInitialSubmitConfirmation && showRequiredTaskSubmitConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: sidebarOpen ? '256px' : '48px',
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            padding: '20px'
          }}
        >
          <div
            style={{
              width: 'min(560px, calc(100vw - 120px))',
              backgroundColor: '#11131a',
              border: '1px solid rgba(148, 163, 184, 0.28)',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 30px 60px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '20px', fontWeight: 600 }}>
              Are you sure you want to submit your project?
            </h3>
            <p style={{ margin: 0, color: '#9ca3af', fontSize: '15px', lineHeight: 1.5 }}>
              You won&apos;t be able to make any more edits to your code.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowRequiredTaskSubmitConfirm(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  color: '#cbd5e1',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleRequiredTaskSubmitConfirm}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {tooltipVisible && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: tooltipLeft,
            top: tooltipTop,
            transform: tooltipPlaceAbove ? 'translate(-50%, -100%) translateY(-8px)' : 'translate(-50%, 8px)',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
            zIndex: 100000,
            whiteSpace: 'normal',
            pointerEvents: 'none',
            maxWidth: '400px',
            textAlign: 'left'
          }}
        >
          {tooltipText}
        </div>,
        document.body
      )}

    </div>
  );
};

export default CodingEditor;