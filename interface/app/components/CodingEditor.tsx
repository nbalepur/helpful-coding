"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import MultiFileEditor from './MultiFileEditor';
import { MessageData } from './Message';
import { loadCurrentTask, submitCode, trackSubmitCode } from '../functions/task_logic';
import { BsExclamationTriangle } from 'react-icons/bs';
import { TestCasesPanelRef, TestResult } from './TestCasesPanel';
import { ENV } from '../config/env';

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
}: CodingEditorProps) => {
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
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
        .replace(/<embed[^>]*>/gi, '')
        .replace(/<link[^>]*>/gi, '')
        .replace(/<meta[^>]*>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/data:/gi, '')
        .replace(/vbscript:/gi, '');
    };

    const sanitizeCss = (css: string): string => {
      return css
        .replace(/expression\s*\(/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/@import/gi, '')
        .replace(/behavior\s*:/gi, '')
        .replace(/binding\s*:/gi, '');
    };

    const sanitizeJs = (js: string): string => {
      // Use same sanitization as PreviewIframe - less aggressive to preserve functionality
      return js
        .replace(/eval\s*\(/gi, '')
        .replace(/Function\s*\(/g, '')
        .replace(/document\.cookie/gi, '')
        .replace(/localStorage/gi, '')
        .replace(/sessionStorage/gi, '')
        .replace(/window\.open/gi, '')
        .replace(/window\.location/gi, '')
        .replace(/window\.parent/gi, '')
        .replace(/window\.top/gi, '')
        .replace(/parent\./gi, '')
        .replace(/top\./gi, '')
        .replace(/document\.write/gi, '')
        .replace(/document\.writeln/gi, '')
        .replace(/data:/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/http:/gi, '')
        .replace(/https:/gi, '')
        .replace(/\.com/gi, '')
        .replace(/\.org/gi, '')
        .replace(/\.net/gi, '')
        .replace(/\.io/gi, '')
        .replace(/\.dev/gi, '')
        .replace(/\.local/gi, '')
        .replace(/XMLHttpRequest/gi, '')
        .replace(/fetch\s*\(/gi, '')
        .replace(/import\s*\(/gi, '')
        .replace(/require\s*\(/gi, '')
        .replace(/WebSocket/gi, '')
        .replace(/EventSource/gi, '')
        .replace(/navigator\./gi, '')
        .replace(/screen\./gi, '')
        .replace(/history\./gi, '')
        .replace(/location\./gi, '')
        .replace(/window\[/gi, '')
        .replace(/document\[/gi, '');
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
            <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${ENV.EXECUTE_ENDPOINT_URL}; frame-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none';">
            <meta http-equiv="X-Content-Type-Options" content="nosniff">
            <meta http-equiv="X-Frame-Options" content="DENY">
            <meta http-equiv="Referrer-Policy" content="no-referrer">
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
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${ENV.EXECUTE_ENDPOINT_URL}; frame-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none';">
          <meta http-equiv="X-Content-Type-Options" content="nosniff">
          <meta http-equiv="X-Frame-Options" content="DENY">
          <meta http-equiv="Referrer-Policy" content="no-referrer">
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


  const generatePreviewContent = async (): Promise<{ html: string; css: string; js: string }> => {
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
              resultDiv.innerHTML = '<div class="error">❌ Error: ' + error.message + '</div>';
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
  };


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
  }, [terminalTab]);

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
  }, [code, initialFiles, enableMultiFile, terminalTab]); // Add code and initialFiles as dependencies

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
  }, [terminalTab, onFileContentChange]);

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
        alert("You have completed all the tasks!");
        setTimeout(() => {
          setTaskIndex((prevTaskIndex) => {
            return prevTaskIndex + 1;
          });
        }, 1000);
        var myData = [response_id, task_id, exp_condition, worker_id];
        localStorage.setItem("objectToPass", JSON.stringify(myData));
      }
    } else {
      alertMessage = "Code is incorrect. Please try again.";
      trackSubmitCode(setTelemetry, taskIndex, log, false, editor);
      alert(alertMessage);
    }
  }

  // Handle project submission
  const handleProjectSubmit = () => {
    setShowSubmitModal(false);
    
    // Trigger confetti effect
    const confettiLib = (window as any).confetti;
    
    if (confettiLib) {
      const duration = 3 * 1000; // 3 seconds instead of 15
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

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
    
    // Clear code and advance to next task or finish
    localStorage.setItem("code", "");
    
    if (taskIndex < function_signatures.length - 1) {
      setTaskIndex((prevTaskIndex) => prevTaskIndex + 1);
      alert("Thanks for submitting! Next task will now be displayed.");
    } else {
      alert("You have completed all the tasks!");
      setTimeout(() => {
        setTaskIndex((prevTaskIndex) => prevTaskIndex + 1);
      }, 1000);
      var myData = [response_id, task_id, exp_condition, worker_id];
      localStorage.setItem("objectToPass", JSON.stringify(myData));
    }
  };

  const showAssistantSide = assistantPlacement === 'side' && showAIAssistantForBottom;
  
  return (
    <div className="coding-editor h-full flex flex-col min-h-0 animate-fadeInRight">
      
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
          <div className="editor-pane min-h-0">
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
                fontSize: 14,
                lineNumbers: 'on',
                wordWrap: 'on',
                automaticLayout: true,
                readOnly: false,
                theme: 'vs-dark',
                cursorBlinking: 'blink',
                cursorSmoothCaretAnimation: 'on',
                smoothScrolling: true,
                mouseWheelZoom: true,
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
            title="Drag to resize"
            onMouseDown={onEditorMouseDown}
            style={{
              height: 2
            }}
          >
            <div className="w-full h-px bg-gray-700 group-hover:bg-gray-600 mx-auto" />
          </div>
        )}
        
        {showAIAssistantForBottom && !showAssistantSide && (
          <div className="terminal-pane min-h-0" style={{ padding: 0, height: '100%' }}>
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
              className="flex-shrink-0 cursor-col-resize group"
              title="Drag to resize"
              onMouseDown={handleAssistantSideMouseDown}
              style={{
                width: 4,
                backgroundColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <div className="w-px h-full bg-gray-700 group-hover:bg-gray-600 transition-colors" />
            </div>
            <div 
              className="assistant-side-pane flex-shrink-0"
              style={{ 
                width: assistantSideWidth,
                height: '100%',
                overflow: 'hidden'
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
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
              backgroundColor: '#2d2d2d',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              border: '1px solid #444'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ 
              color: '#e5e7eb', 
              marginBottom: '16px', 
              fontSize: '20px',
              fontWeight: '600'
            }}>
              Submit Project?
            </h2>
            
            <div style={{ 
              color: '#d1d5db', 
              marginBottom: '24px',
              lineHeight: '1.6',
              fontSize: '14px'
            }}>
              <p style={{ marginBottom: '12px' }}>
                Are you sure you want to submit this project?
              </p>
              <p style={{ marginBottom: '12px', color: '#9ca3af' }}>
                We recommend running all test cases at once before submitting.
              </p>
              
              {overriddenTestsCount > 0 && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '4px',
                  color: '#fbbf24',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <BsExclamationTriangle style={{ flexShrink: 0, fontSize: '16px' }} />
                  <span>
                    You overrode {overriddenTestsCount} test case{overriddenTestsCount !== 1 ? 's' : ''}.
                  </span>
                </div>
              )}
            </div>
            
            <div style={{ 
              display: 'flex', 
              gap: '12px', 
              justifyContent: 'flex-end' 
            }}>
              <button
                onClick={() => setShowSubmitModal(false)}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#374151',
                  color: '#e5e7eb',
                  border: '1px solid #4b5563',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#374151'}
              >
                Cancel
              </button>
              <button
                onClick={handleProjectSubmit}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                Submit Project
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default CodingEditor;