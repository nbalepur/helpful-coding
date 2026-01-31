"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import MonacoEditor from '@monaco-editor/react';
import MultiFileEditor from './MultiFileEditor';
import { MessageData } from './Message';
import { loadCurrentTask, submitCode, trackSubmitCode } from '../functions/task_logic';
import { BsExclamationTriangle, BsInfoCircle } from 'react-icons/bs';
import { Check, X, Download, CheckCircle, Sparkles, ThumbsUp, Lightbulb } from 'lucide-react';
import Markdown from 'react-markdown';
import { TestCasesPanelRef, TestResult } from './TestCasesPanel';
import { ENV } from '../config/env';
import html2canvas from 'html2canvas';
import { buildFullHTMLDocument } from '../utils/htmlBuilder';
import { useSnackbar } from './SnackbarProvider';
import LoadingSpinner from './LoadingSpinner';
import Link from 'next/link';
import { useUserStudyPopup } from './UserStudyPopup';
import { POST_TEST_REQUIRED_TASKS } from '../config/tasks';
import { ERROR_TRY_AGAIN } from '../utils/constants';
import { useAuth } from '../utils/auth';
import { isStudyEnded } from '../config/study';
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

// Component to render text with code blocks as Monaco editors
const TextWithCodeBlocks: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  
  // Split text by triple backticks
  const parts: Array<{ type: 'text' | 'code'; content: string }> = [];
  const tripleBacktickRegex = /```([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  
  while ((match = tripleBacktickRegex.exec(text)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      const textContent = text.substring(lastIndex, match.index);
      if (textContent) {
        parts.push({ type: 'text', content: textContent });
      }
    }
    
    // Add code block
    parts.push({ type: 'code', content: match[1].trim() });
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
            <div key={`code-${index}`} style={{ margin: '8px 0', border: '1px solid #4b5563', borderRadius: '6px', overflow: 'hidden' }}>
              <MonacoEditor
                height="300px"
                language="javascript"
                value={part.content}
                theme="vs-dark"
                options={{
                  readOnly: true,
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
                }}
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
  onAcceptAgentChanges?: (fileType?: string, content?: string) => void;
  onRejectAgentChanges?: () => void;
  projectId?: number | null;
  userId?: number | null;
  taskName?: string | null;
  // Sidebar state for modal positioning
  sidebarOpen?: boolean;
  // Callback when project is successfully submitted
  onProjectSubmitted?: () => void | Promise<void>;
  // Loading state for files
  isLoadingFiles?: boolean;
  // Callback to expose project title and description to parent
  onProjectInfoChange?: (title: string, description: string) => void;
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
  sidebarOpen = false,
  onProjectSubmitted,
  isLoadingFiles = false,
  onProjectInfoChange,
}: CodingEditorProps) => {
  const { showSnackbar } = useSnackbar();
  const { recalculateState } = useUserStudyPopup();
  const { user, token, refreshUser } = useAuth();
  const studyEnded = isStudyEnded();
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
  const [showEvaluationCheck, setShowEvaluationCheck] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{
    task_fulfillment: number;
    style: number;
    enjoyment: number;
    creativity: number;
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
  const [answersChecked, setAnswersChecked] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipText, setTooltipText] = useState("");
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const [tooltipTop, setTooltipTop] = useState(0);
  const [tooltipPlaceAbove, setTooltipPlaceAbove] = useState(true);
  
  const trimmedProjectTitleLength = projectTitle.trim().length;
  const trimmedProjectDescriptionLength = projectDescription.trim().length;
  const isSubmitDisabled = !!(
    isSubmittingProject ||
    isCheckingModeration ||
    isScreenshotLoading ||
    isCheckingExistingSubmission ||
    !trimmedProjectTitleLength ||
    !trimmedProjectDescriptionLength ||
    !previewScreenshot ||
    (existingSubmission && !hasConsentedToOverride)
  );
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
        taskName,
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
      showSnackbar('Failed to download project', 'error');
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
        actualEditorRef,
        userId,
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

  // Listen for global request to open submit modal from page-level button
  useEffect(() => {
    const openSubmit = () => setShowSubmitModal(true);
    window.addEventListener('open-submit-modal', openSubmit as EventListener);
    return () => window.removeEventListener('open-submit-modal', openSubmit as EventListener);
  }, []);

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
    capture();

    return () => {
      cancelled = true;
    };
  }, [showSubmitModal, createPreviewScreenshot, userId, projectId, task_id]);

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

  const handleProjectSubmit = () => {
    setShowSubmitModal(false);
    
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
    
    // Track submission telemetry
    trackSubmitCode(setTelemetry, taskIndex, "project submitted", true, editor);
    
    // Clear code for the current task after submission
    localStorage.setItem("code", "");
  };

  const handleProjectFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionError(null);

    const trimmedTitle = projectTitle.trim();
    const trimmedDescription = projectDescription.trim();
    let hasError = false;

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
    setProjectTitle(trimmedTitle);
    setProjectDescription(trimmedDescription);
    
    // Check if evaluation is needed (non-required tasks or past study date)
    const needsEvaluation = studyEnded || (taskName && !POST_TEST_REQUIRED_TASKS.includes(taskName as any));
    
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
      // Go directly to comprehension questions for required tasks
      setShowEvaluationCheck(false);
      setShowComprehensionCheck(true);
    }
  };

  // Fetch comprehension questions when the panel is shown
  useEffect(() => {
    if (!showComprehensionCheck) {
      return;
    }

    const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
    
    // For tutorial tasks, skip userId/projectId checks since we're using seeded questions
    if (!isTutorialTask && (!userId || !projectId)) {
      return;
    }

    const fetchComprehensionQuestions = async () => {
      setIsLoadingComprehensionQuestions(true);
      setComprehensionQuestionsError(null);
      
      try {
        // For tutorial task, use seeded questions instead of generating them
        if (isTutorialTask) {
          // Fun, lighthearted mock questions for tutorial (not stored in database)
          const seededQuestions = [
            {
              id: 'tutorial-1',
              question_name: 'tutorial_question_1',
              question: 'How much do you agree with this statement: "Coding with AI tools like Cursor and Copilot makes you a better programmer"',
              question_type: 'mcqa',
              choices: ["1 - Strongly disagree", "2 - Disagree", "3 - Neither agree nor disagree", "4 - Agree", "5 - Strongly agree"],
            },
            {
              id: 'tutorial-2',
              question_name: 'tutorial_question_2',
              question: 'Which of these foods do you like to eat?',
              question_type: 'multi_select',
              choices: ['Dim Sum', 'Shakshuka', 'Birria Tacos', 'Dubai Chocolate', 'Pizza', 'Hummus'],
            },
          ];
          
          setComprehensionQuestions(seededQuestions);
          setIsLoadingComprehensionQuestions(false);
          return;
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
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to generate comprehension questions');
        }

        const data = await response.json();
        if (data.success && data.questions) {
          // Map the API response to the format expected by the UI
          const mappedQuestions = data.questions.map((q: any, index: number) => {
            const mapped = {
              id: q.id?.toString() || `comp-${index}`,
              question_name: q.question_name || '',
              question: q.question || '',
              question_type: q.question_type || 'free_response',
              choices: q.choices || undefined,
              answer: q.answer,
            };
            return mapped;
          });
          setComprehensionQuestions(mappedQuestions);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (error) {
        console.error('Failed to fetch comprehension questions:', error);
        setComprehensionQuestionsError(error instanceof Error ? error.message : 'Failed to load questions');
        // Fallback to empty array - user can still proceed
        setComprehensionQuestions([]);
      } finally {
        setIsLoadingComprehensionQuestions(false);
      }
    };

    fetchComprehensionQuestions();
  }, [showComprehensionCheck, userId, projectId, projectTitle, projectDescription, taskName]);

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
          task_fulfillment: 3,
          style: 3,
          enjoyment: 3,
          creativity: 3,
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

      // Close both modals
      setShowComprehensionCheck(false);
      setShowEvaluationCheck(false);
      setShowSubmitModal(false);
      
      handleProjectSubmit();
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

  const isRequiredTask = !studyEnded && taskName && POST_TEST_REQUIRED_TASKS.includes(taskName as any);
  
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
    
    // Regular validation for non-tutorial tasks
    // Validate that all questions are answered (multi-select can be empty)
    const unansweredQuestions = comprehensionQuestions.filter(q => {
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
    const invalidFreeResponseQuestions = comprehensionQuestions.filter(q => {
      if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
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

    // Submit with comprehension answers
    await submitProject(comprehensionAnswersData);
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
          <div className="terminal-pane min-h-0" style={{ padding: 0, height: '100%', overflow: 'visible' }}>
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
                overflow: 'visible'
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
          onClick={() => setShowSubmitModal(false)}
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
              flexDirection: 'column'
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
                  ? 'Project-Specific Questions' 
                  : (taskName === 'Playground' || taskName === 'playground' ? 'Submit / Finish Tutorial' : 'Submit Project')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmittingProject) {
                    setShowSubmitModal(false);
                    setShowEvaluationCheck(false);
                    setShowComprehensionCheck(false);
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
            </div>

            {/* Helper text for tutorial */}
            {!showComprehensionCheck && (taskName === 'Playground' || taskName === 'playground') && (
              <p
                style={{
                  color: '#9ca3af',
                  fontSize: '13px',
                  marginTop: '-8px',
                  marginBottom: '16px',
                }}
              >
                Normally, you will need to add a title and description for your project. But this does not matter for the tutorial.
              </p>
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
                <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '0px' }}>
                We are automatically reviewing your submission with an LLM judge for good-faith completion and offensive content. This may take up to 60 seconds. You'll also receive scores on Task Fulfillment, Style, Enjoyment, and Creativity along with an explanation, which you might find useful for improving your project!
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
                    {/* Unified Evaluation Component */}
                    <div style={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px'
                    }}>
                      <h3 style={{ color: '#e2e8f0', fontSize: '18px', fontWeight: 600, marginBottom: '0px' }}>
                        Evaluation Results
                      </h3>
                      
                      {/* Scores - Responsive grid layout */}
                      <style>{`
                        .evaluation-scores-grid {
                          display: grid;
                          grid-template-columns: 1fr;
                          gap: 16px;
                        }
                        @media (min-width: 640px) {
                          .evaluation-scores-grid {
                            grid-template-columns: repeat(2, 1fr);
                          }
                        }
                        @media (min-width: 1024px) {
                          .evaluation-scores-grid {
                            grid-template-columns: repeat(4, 1fr);
                          }
                        }
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
                      <div className="evaluation-scores-grid">
                        {['task_fulfillment', 'style', 'enjoyment', 'creativity'].map((dimension) => {
                          const score = evaluationResult[dimension as keyof typeof evaluationResult] as number;
                          const label = dimension === 'task_fulfillment' ? 'Task Fulfillment' :
                                       dimension === 'style' ? 'Style' :
                                       dimension === 'enjoyment' ? 'Enjoyment' : 'Creativity';
                          
                          const badgeColor = score >= 4 ? '#10b981' : score >= 3 ? '#f59e0b' : '#ef4444';
                          
                          // Icon mapping
                          let IconComponent;
                          let iconColor;
                          if (dimension === 'task_fulfillment') {
                            IconComponent = CheckCircle;
                            iconColor = '#60a5fa';
                          } else if (dimension === 'style') {
                            IconComponent = Sparkles;
                            iconColor = '#a78bfa';
                          } else if (dimension === 'enjoyment') {
                            IconComponent = ThumbsUp;
                            iconColor = '#f472b6';
                          } else {
                            IconComponent = Lightbulb;
                            iconColor = '#fbbf24';
                          }
                          
                          return (
                            <div
                              key={dimension}
                              style={{
                                backgroundColor: 'rgba(17, 24, 39, 0.5)',
                                borderRadius: '8px',
                                padding: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <IconComponent size={20} color={iconColor} />
                                <span style={{ color: '#9ca3af', fontSize: '14px' }}>
                                  {label}
                                </span>
                              </div>
                              <p style={{
                                color: badgeColor,
                                fontSize: '24px',
                                fontWeight: 700,
                                margin: 0
                              }}>
                                {score}/5
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Explanation */}
                      <div style={{
                        paddingTop: '16px',
                        borderTop: '1px solid #374151'
                      }}>
                        <h4 style={{
                          color: '#e2e8f0',
                          fontSize: '14px',
                          fontWeight: 600,
                          marginBottom: '12px'
                        }}>
                          Explanation
                        </h4>
                        <div style={{
                          color: '#d1d5db',
                          fontSize: '14px',
                          lineHeight: '1.6'
                        }} className="markdown-content evaluation-explanation">
                          <Markdown>{evaluationResult.explanation}</Markdown>
                        </div>
                      </div>
                    </div>
                    
                    {/* Status Message */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0px' }}>
                      <span style={{
                        color: '#e2e8f0',
                        fontSize: '18px',
                        fontWeight: 600
                      }}>
                        Decision:
                      </span>
                      <span style={{
                        color: evaluationResult.is_valid ? '#10b981' : '#ef4444',
                        fontSize: '18px',
                        fontWeight: 600
                      }}>
                        {evaluationResult.is_valid ? 'Valid Submission' : 'Invalid Submission'}
                      </span>
                      {evaluationResult.is_valid ? (
                        <Check size={18} color="#10b981" />
                      ) : (
                        <X size={18} color="#ef4444" />
                      )}
                    </div>
                    <p style={{
                      color: '#e2e8f0',
                      fontSize: '16px',
                      lineHeight: '1.5',
                      margin: 0,
                      marginTop: '0px',
                      marginBottom: '16px'
                    }}>
                      {evaluationResult.is_valid
                        ? 'You can proceed with your submission! However, we encourage you to review the feedback above and consider making improvements to enhance your scores before submitting your project for human judgment.'
                        : 'Your submission has been marked as invalid. Please review the explanation above and make necessary changes before resubmitting.'}
                    </p>
                    
                    {/* Buttons */}
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      
                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (evaluationResult.is_valid) {
                              setShowEvaluationCheck(false);
                            } else {
                              setShowSubmitModal(false);
                              setShowEvaluationCheck(false);
                              setShowComprehensionCheck(false);
                              // Clear comprehension state when canceling
                              setComprehensionQuestions([]);
                              setComprehensionAnswers({});
                              setComprehensionQuestionsError(null);
                              setAnswersChecked(false);
                            }
                          }}
                          style={{
                            padding: '6px 14px',
                            backgroundColor: '#4b5563',
                            color: '#f9fafb',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease, opacity 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#6b7280';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#4b5563';
                          }}
                        >
                          {evaluationResult.is_valid ? 'Back' : 'Revise Submission'}
                        </button>
                        {evaluationResult.is_valid && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowEvaluationCheck(false);
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
                  minHeight: 0
                }}
              >

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
                  justifyContent: submissionError ? 'space-between' : 'flex-end',
                  alignItems: 'center',
                  marginTop: '8px'
                }}
              >
                {submissionError && (
                  <div style={{ 
                    color: '#f87171', 
                    fontSize: '14px',
                    fontWeight: 500,
                    flex: 1,
                    textAlign: 'left'
                  }}>
                    {submissionError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {taskName !== 'Playground' && taskName !== 'playground' && (
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
                  <button
                    type="submit"
                    disabled={isSubmitDisabled || isSubmittingProject || isCheckingModeration || isCheckingExistingSubmission}
                    style={{
                      padding: '6px 16px',
                      backgroundColor: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (isSubmitDisabled || isSubmittingProject || isCheckingModeration || isCheckingExistingSubmission) ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      opacity: (isSubmitDisabled || isSubmittingProject || isCheckingModeration || isCheckingExistingSubmission) ? 0.6 : 1,
                      transition: 'background-color 0.2s ease, opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (isSubmitDisabled || isSubmittingProject || isCheckingModeration || isCheckingExistingSubmission) {
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
                      
                      // Always show "Continue" since comprehension questions always show now
                      return 'Continue';
                    })()}
                  </button>
                </div>
              </div>
            </form>
            ) : (
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
                <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '0px' }}>
                  {taskName === 'Playground' || taskName === 'playground' 
                    ? 'Before submitting, please answer the following questions so we can understand your AI usage! Normally, these will be questions tailored to the task you just completed.'
                    : 'Before submitting, please answer the following questions so we can understand your AI usage! If questions do not generate after 60 seconds, please refresh the page and try again.'}
                </p>
                
                {isLoadingComprehensionQuestions && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                    <LoadingSpinner size="lg" color="blue" className="mb-4" />
                    <p style={{ color: '#9ca3af', fontSize: '14px' }}>Generating questions...</p>
                  </div>
                )}
                
                {comprehensionQuestionsError && (
                  <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px' }}>
                    {comprehensionQuestionsError}
                  </div>
                )}
                
                {!isLoadingComprehensionQuestions && comprehensionQuestions.length === 0 && !comprehensionQuestionsError && (
                  <p style={{ color: '#9ca3af', fontSize: '14px', fontStyle: 'italic' }}>
                    No questions available. You can proceed with submission.
                  </p>
                )}
                
                {!isLoadingComprehensionQuestions && (
                  <>
                    {(() => {
                      // Count self-report questions (including sanity check)
                      const selfReportQuestions = comprehensionQuestions.filter(q => 
                        q.question_name && (q.question_name.startsWith('self_report_') || q.question_name === 'sanity_check')
                      );
                      const selfReportQuestionCount = selfReportQuestions.length;
                      const hasSelfReportQuestions = selfReportQuestionCount > 0;
                      // Check if current task is in POST_TEST_REQUIRED_TASKS
                      const isPostTestRequiredTask = !studyEnded && taskName && POST_TEST_REQUIRED_TASKS.includes(taskName as any);
                      
                      return comprehensionQuestions.map((q, index) => {
                        const currentAnswer = comprehensionAnswers[q.id] || '';
                        // Check if this is a self-report question (should not reveal answers)
                        // Includes sanity check since it uses the same self-report options
                        const isSelfReportQuestion = q.question_name && (q.question_name.startsWith('self_report_') || q.question_name === 'sanity_check');
                        // Check if this is a report question (should be disabled during check answer)
                        const isReportQuestion = q.question_name && (q.question_name.toLowerCase().includes('report') || q.question_name.startsWith('report_'));
                        // Only apply answer checking to non-self-report MCQA questions
                        const shouldShowAnswers = answersChecked && !isSelfReportQuestion;
                        // Disable report questions during check answer phase
                        const shouldDisableQuestion = answersChecked && isReportQuestion;
                        // Check if this is the first self-report question (index 0), there are self-report questions, and task is in POST_TEST_REQUIRED_TASKS
                        const isFirstSelfReportQuestion = index === 0 && isSelfReportQuestion && hasSelfReportQuestions && isPostTestRequiredTask;
                        
                        return (
                      <div 
                        key={q.id || index} 
                        style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: q.question_type === 'mcqa' ? '6px' : '12px',
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
                            For questions 1–{selfReportQuestionCount}, how much do you agree with the following statements:
                          </div>
                        )}
                      <div
                        style={{
                          color: '#e5e7eb',
                          fontWeight: 500,
                          fontSize: '14px'
                        }}
                      >
                        <span>{index + 1}. </span>
                        <TextWithCodeBlocks text={q.question} />
                      </div>
                      
                      {q.question_type === 'mcqa' && q.choices && q.choices.length > 0 ? (
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
                                const parts: string[] = [];
                                
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

                {submissionError && (
                  <div style={{ color: '#f87171', fontSize: '12px' }}>
                    {submissionError}
                  </div>
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
                        justifyContent: scoreInfo ? 'space-between' : 'flex-end',
                        alignItems: 'center',
                        marginTop: 'auto',
                        paddingTop: '16px'
                      }}
                    >
                      {/* Display overall score if available */}
                      {scoreInfo && (
                        <div style={{
                          fontSize: '16px',
                          fontWeight: 500,
                          color: '#e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          lineHeight: '1.5'
                        }}>
                          <span style={{ color: '#e5e7eb' }}>Overall Score: </span>
                          <span style={{ 
                            color: scoreInfo.scorePercent >= 70 ? '#10b981' : scoreInfo.scorePercent >= 50 ? '#f59e0b' : '#ef4444',
                            fontWeight: 600,
                            marginLeft: '6px'
                          }}>
                            {scoreInfo.scorePercent}%
                          </span>
                          <span style={{ color: '#9ca3af', marginLeft: '8px' }}>
                            ({scoreInfo.questionCount} question{scoreInfo.questionCount > 1 ? 's' : ''})
                          </span>
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', gap: '10px' }}>
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
                  {!isRequiredTask && taskName !== 'Playground' && taskName !== 'playground' && (
                    <button
                      type="button"
                      onClick={answersChecked ? handleComprehensionCheckSubmit : handleCheckAnswers}
                      disabled={isSubmittingProject || isLoadingComprehensionQuestions || (answersChecked ? (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                        // Multi-select questions are always valid, even if nothing is selected
                        if (q.question_type === 'multi_select') {
                          return false;
                        }
                        if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
                          const answer = comprehensionAnswers[q.id] || '';
                          return !answer.trim() || countWords(answer) < 10;
                        }
                        return !comprehensionAnswers[q.id]?.trim();
                      })) : (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
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
                        cursor: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
                            const answer = comprehensionAnswers[q.id] || '';
                            return !answer.trim() || countWords(answer) < 10;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
                            const answer = comprehensionAnswers[q.id] || '';
                            return !answer.trim() || countWords(answer) < 10;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 0.6 : 1,
                        transition: 'opacity 0.2s ease, transform 0.2s ease',
                        boxShadow: '0 10px 25px rgba(59, 130, 246, 0.25)'
                      } : {
                        padding: '6px 16px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 0.6 : 1,
                        transition: 'background-color 0.2s ease, opacity 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (answersChecked) {
                          if (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                            // Multi-select questions are always valid, even if nothing is selected
                            if (q.question_type === 'multi_select') {
                              return false;
                            }
                            if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
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
                          if (!(isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
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
                  {(isRequiredTask || (taskName === 'Playground' || taskName === 'playground')) && (
                    <button
                      type="button"
                      onClick={handleComprehensionCheckSubmit}
                      disabled={isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                        // Multi-select questions are always valid, even if nothing is selected
                        if (q.question_type === 'multi_select') {
                          return false;
                        }
                        const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
                        // For tutorial tasks, no word count requirement
                        if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
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
                        cursor: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
                          // For tutorial tasks, no word count requirement
                          if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
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
                        opacity: (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
                          // For tutorial tasks, no word count requirement
                          if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
                            const answer = comprehensionAnswers[q.id] || '';
                            if (isTutorialTask) {
                              return !answer.trim();
                            }
                            return !answer.trim() || countWords(answer) < 10;
                          }
                          return !comprehensionAnswers[q.id]?.trim();
                        }))) ? 0.6 : 1,
                        transition: 'opacity 0.2s ease, transform 0.2s ease',
                        boxShadow: '0 10px 25px rgba(59, 130, 246, 0.25)'
                      }}
                      onMouseEnter={(e) => {
                        const isTutorialTask = taskName === 'Playground' || taskName === 'playground';
                        if (isSubmittingProject || isLoadingComprehensionQuestions || (comprehensionQuestions.length > 0 && comprehensionQuestions.some(q => {
                          // Multi-select questions are always valid, even if nothing is selected
                          if (q.question_type === 'multi_select') {
                            return false;
                          }
                          // For tutorial tasks, no word count requirement
                          if (q.question_type === 'free_response' || (!q.question_type || (q.question_type !== 'mcqa' && q.question_type !== 'multi_select'))) {
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
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
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