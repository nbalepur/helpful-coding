"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import MultiFileEditor from './MultiFileEditor';
import { MessageData } from '../../utils/messageTypes';
import { loadCurrentTask, trackSubmitCode } from '../../utils/task_logic';
import SubmitProjectModal from '../submissions/SubmitProjectModal';
import { ENV } from '../../config/env';
import html2canvas from 'html2canvas';
import { buildFullHTMLDocument } from '../../utils/htmlBuilder';
import { useSnackbar } from '../ui/SnackbarProvider';
import { downloadProjectAsRepository } from '../../utils/downloadProject';
import { ERROR_TRY_AGAIN } from '../../constants/errorMessages';

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
  editor: any;
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
  // Pane visibility
  showCodeEditor?: boolean;
  showTerminal?: boolean;
  onHideCodeEditor?: () => void;
  onHideTerminal?: () => void;
  onShowCodeEditor?: () => void;
  onShowTerminal?: () => void;
  // File change callbacks
  onFileContentChange?: () => void;
  onClearPlan?: () => void;
  onBuildPlan?: () => void;
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
  taskLabel?: string | null;
  sidebarOpen?: boolean;
  onProjectSubmitted?: () => void | Promise<void>;
  isLoadingFiles?: boolean;
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
  editor,
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
  showCodeEditor = true,
  showTerminal = true,
  onHideCodeEditor,
  onHideTerminal,
  onShowCodeEditor,
  onShowTerminal,
  onFileContentChange,
  onClearPlan,
  onBuildPlan,
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
  sidebarOpen = false,
  onProjectSubmitted,
  isLoadingFiles = false,
  onProjectInfoChange,
}: CodingEditorProps) => {
  const { showSnackbar } = useSnackbar();
  const [showTimer, setShowTimer] = useState(false);

  // Assistant side panel state
  const [assistantSideWidth, setAssistantSideWidth] = useState(400);
  const [isAssistantResizing, setIsAssistantResizing] = useState(false);
  
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
  
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const [confettiReady, setConfettiReady] = useState(false);

  // Debug editor mount
  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    onEditorMount(editor, monaco);
  }, [onEditorMount]);

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

  // Watch for refresh trigger from parent
  useEffect(() => {
    if (endpointsNeedRefresh && onEndpointsRefreshed) {
      onEndpointsRefreshed();
    }
  }, [endpointsNeedRefresh, onEndpointsRefreshed]);

 
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

  const handleDownloadProjectForModal = useCallback(async (customTitle: string, customDescription: string) => {
    try {
      const files = collectSubmissionFiles();
      const normalized = normalizeCodeForDownload(files);
      const projectName = taskName || 'VibeJam Project';
      const titleArg = customTitle.trim() || undefined;
      const descArg = customDescription.trim() || undefined;

      await downloadProjectAsRepository(
        normalized,
        projectName,
        taskName ?? 'project',
        undefined,
        titleArg,
        descArg
      );

      showSnackbar('Thanks for downloading! Unzip the file to see a GitHub repo with steps to run your website locally or host it online for free!');

      if (userId && projectId) {
        try {
          await fetch(`${ENV.BACKEND_URL}/api/code-logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
  }, [collectSubmissionFiles, normalizeCodeForDownload, taskName, showSnackbar, userId, projectId, task_id]);


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
      const skipTimer = setTimeout(() => setShowTimer(true), skipTime);
      setShowTimer(false);
      if (chatRef.current) {
        chatRef.current.clearThrottle();
      }

      return () => clearTimeout(skipTimer);
    }
  }, [taskIndex]);

  // Callback to handle file content changes in multi-file mode
  const handleFileContentChange = useCallback(() => {
    try { onFileContentChange && onFileContentChange(); } catch (e) {}
  }, [onFileContentChange]);

  const handleSaveShortcut = useCallback((fileId?: string) => {
    try { onSaveShortcut && onSaveShortcut(fileId); } catch (e) {}
  }, [onSaveShortcut]);

  // Listen for global request to open submit modal from page-level button
  useEffect(() => {
    const openSubmit = () => setShowSubmitModal(true);
    window.addEventListener('open-submit-modal', openSubmit as EventListener);
    return () => window.removeEventListener('open-submit-modal', openSubmit as EventListener);
  }, []);

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
              onClearPlan={onClearPlan}
              onBuildPlan={onBuildPlan}
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

      <SubmitProjectModal
        open={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        sidebarOpen={sidebarOpen}
        taskName={taskName}
        userId={userId}
        projectId={projectId}
        task_id={task_id}
        taskLabel={taskLabel}
        createPreviewScreenshot={createPreviewScreenshot}
        collectSubmissionFiles={collectSubmissionFiles}
        onProjectSubmitted={onProjectSubmitted}
        onSuccess={handleProjectSubmit}
        showSnackbar={showSnackbar}
        onDownloadProject={handleDownloadProjectForModal}
        onProjectInfoChange={onProjectInfoChange}
        editor={editor}
        taskIndex={taskIndex}
        setTelemetry={setTelemetry}
      />


    </div>
  );
};

export default CodingEditor;