"use client";
import React, { useRef, useState, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import PreviewIframe from './PreviewIframe';
import PreviewDebugPanel, { PreviewDebugPanelRef, ConsoleSourceClickPayload, ConsoleMessageMeta } from './PreviewDebugPanel';
import { FileNode } from './FileManager';
import { RefreshCw, Bug, Terminal, X, Columns, Rows } from 'lucide-react';
import { getUserSettingsCookie, updateUserSetting } from '../utils/cookies';

type PreviewRefreshSource = 'toolbar' | 'debug-panel' | 'iframe-shortcut' | 'external';

interface PreviewTabProps {
  files: FileNode[];
  className?: string;
  taskName?: string;
  actualEditorRef?: React.RefObject<any>;
  onRefresh?: (source: PreviewRefreshSource) => void;
}

export interface PreviewTabRef {
  refreshPreview: () => void;
  addConsoleMessage: (message: any, level: string, source?: string, meta?: ConsoleMessageMeta) => void;
}

const PreviewTab = forwardRef<PreviewTabRef, PreviewTabProps>(({ files, className = '', taskName = 'preview', actualEditorRef, onRefresh }, ref) => {
  const previewRef = useRef<any>(null);
  const debugPanelRef = useRef<PreviewDebugPanelRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalRefreshKey, setInternalRefreshKey] = useState(0);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [url, setUrl] = useState(`https://vibecode.io/${taskName.toLowerCase().replace(/\s+/g, '-')}`);
  
  // Console placement and dragging state - load from cookies
  const [consolePlacement, setConsolePlacement] = useState<'side' | 'bottom'>(() => {
    if (typeof window === 'undefined') return 'bottom';
    const settings = getUserSettingsCookie();
    return settings.debugConsolePlacement;
  });
  const [splitterPosition, setSplitterPosition] = useState(50); // Percentage for side placement
  const [consoleHeight, setConsoleHeight] = useState(200); // Pixels for bottom placement
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const isInitialMountRef = useRef(true);
  const filesRef = useRef<FileNode[]>(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Update URL when taskName changes
  React.useEffect(() => {
    const formattedTaskName = taskName.toLowerCase().replace(/\s+/g, '-');
    setUrl(`https://vibecode.io/${formattedTaskName}`);
  }, [taskName]);

  // Mark initial mount as complete
  useEffect(() => {
    isInitialMountRef.current = false;
  }, []);

  // Save debug console placement to cookies when it changes
  useEffect(() => {
    if (!isInitialMountRef.current) {
      updateUserSetting('debugConsolePlacement', consolePlacement);
    }
  }, [consolePlacement]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    refreshPreview: () => {
      triggerRefresh('external');
    },
    addConsoleMessage: (message: any, level: string, source?: string, meta?: Record<string, any>) => {
      debugPanelRef.current?.addConsoleMessage(message, level, source, meta);
    }
  }));

  const getPreviewContents = useCallback(() => {
    let html = '';
    let css = '';
    let js = '';

    let allFileContents: Record<string, string> = {};
    if (actualEditorRef?.current?.getAllFileContents) {
      try {
        allFileContents = actualEditorRef.current.getAllFileContents() || {};
      } catch (error) {
        console.error('Error getting file contents from editor:', error);
      }
    }

    const currentFiles = filesRef.current || [];

    if (Object.keys(allFileContents).length > 0) {
      Object.entries(allFileContents).forEach(([fileId, content]) => {
        const matchingFile = currentFiles.find(f => f.id === fileId);
        const fileName = matchingFile?.name || fileId || '';

        if (fileName.toLowerCase().endsWith('.html') ||
            fileName.toLowerCase() === 'index.html' ||
            fileId.toLowerCase().endsWith('.html')) {
          html = String(content);
        } else if (fileName.toLowerCase().endsWith('.css') ||
                   fileName.toLowerCase() === 'style.css' ||
                   fileName.toLowerCase() === 'styles.css' ||
                   fileId.toLowerCase().endsWith('.css')) {
          css = String(content);
        } else if (fileName.toLowerCase().endsWith('.js') ||
                   fileName.toLowerCase() === 'script.js' ||
                   fileName.toLowerCase() === 'frontend.js' ||
                   fileId.toLowerCase().endsWith('.js')) {
          js = String(content);
        }
      });
    } else {
      const flattenFiles = (nodes: FileNode[] = []): FileNode[] => {
        const result: FileNode[] = [];
        const stack = [...nodes];

        while (stack.length > 0) {
          const node = stack.shift();
          if (!node) continue;

          if (node.type === 'file') {
            result.push(node);
          }

          if (node.children && Array.isArray(node.children)) {
            stack.unshift(...node.children);
          }
        }

        return result;
      };

      const flatFiles = flattenFiles(currentFiles);

      const htmlFile = flatFiles.find(file =>
        file.name.toLowerCase().endsWith('.html') ||
        file.name.toLowerCase() === 'index.html'
      );

      const cssFile = flatFiles.find(file =>
        file.name.toLowerCase().endsWith('.css') ||
        file.name.toLowerCase() === 'style.css' ||
        file.name.toLowerCase() === 'styles.css'
      );

      const jsFile = flatFiles.find(file =>
        file.name.toLowerCase().endsWith('.js') ||
        file.name.toLowerCase() === 'script.js' ||
        file.name.toLowerCase() === 'frontend.js'
      );

      if (htmlFile) {
        html = htmlFile.content || '';
      }
      if (cssFile) {
        css = cssFile.content || '';
      }
      if (jsFile) {
        js = jsFile.content || '';
      }
    }

    return { htmlContent: html, cssContent: css, jsContent: js };
  }, [actualEditorRef]);

  const [previewContents, setPreviewContents] = useState(() => getPreviewContents());

  useEffect(() => {
    setPreviewContents(getPreviewContents());
  }, [taskName, getPreviewContents]);

  const { htmlContent, cssContent, jsContent } = previewContents;

  // Handle console logs from the iframe
  const handleConsoleLog = (message: any, level: string = 'log', source?: string, meta?: ConsoleMessageMeta) => {
    // Forward to debug panel with optional source for errors
    debugPanelRef.current?.addConsoleMessage(message, level, source, meta);
  };

  const handleConsoleSourceClick = useCallback((payload: ConsoleSourceClickPayload) => {
    try {
      const editorApi = actualEditorRef?.current;
      if (!editorApi) return;

      const preferredSource = payload.source || payload.originalSource || '';
      if (!preferredSource) return;

      const match = preferredSource.match(/^(.*?):(\d+)(?::(\d+))?$/);
      let fileIdentifier = preferredSource;
      let lineNumber = 1;
      let columnNumber: number | undefined;

      if (match) {
        fileIdentifier = match[1];
        lineNumber = parseInt(match[2], 10) || 1;
        columnNumber = match[3] ? (parseInt(match[3], 10) || undefined) : undefined;
      }

      const normalizedFileName = fileIdentifier.split(/[\\/]/).pop() || fileIdentifier;

      if (typeof editorApi.revealLocation === 'function') {
        editorApi.revealLocation(normalizedFileName, lineNumber, columnNumber, {
          originalPath: fileIdentifier,
          level: payload.level,
          message: payload.message,
          meta: payload.meta
        });
      } else if (typeof editorApi.selectFileByName === 'function') {
        editorApi.selectFileByName(normalizedFileName);
      }
    } catch (error) {
      console.error('Failed to navigate to source from console output:', error);
    }
  }, [actualEditorRef]);

  // Handle refresh
  const triggerRefresh = useCallback((source: PreviewRefreshSource) => {
    onRefresh?.(source);
    setPreviewContents(getPreviewContents());
    setInternalRefreshKey(prev => prev + 1);
  }, [onRefresh, getPreviewContents]);

  // Handle debug toggle
  const handleToggleDebug = () => {
    setIsDebugOpen(prev => !prev);
  };

  // Handle console placement toggle
  const handleTogglePlacement = () => {
    setConsolePlacement(prev => prev === 'side' ? 'bottom' : 'side');
  };

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  // Handle drag move
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    if (consolePlacement === 'side') {
      // Calculate new position as percentage
      const containerWidth = containerRef.current.offsetWidth;
      const movePercent = (deltaX / containerWidth) * 100;
      const newPosition = Math.max(20, Math.min(80, splitterPosition + movePercent));
      setSplitterPosition(newPosition);
    } else {
      // Calculate new height in pixels
      const newHeight = Math.max(100, Math.min(600, consoleHeight - deltaY));
      setConsoleHeight(newHeight);
    }
    
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragStart, consolePlacement, splitterPosition, consoleHeight]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Set up drag listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      document.body.style.cursor = consolePlacement === 'side' ? 'col-resize' : 'row-resize';
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd, consolePlacement]);

  // Handle popout to new window
  const handlePopout = () => {
    try {
      const fullHtml = previewRef.current?.getFullHtml?.();
      if (!fullHtml) return;
      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener');
      if (!win) {
        console.warn('Popup blocked by the browser. Please allow popups for this site.');
      }
    } catch (e) {
      console.error('Failed to open popout window', e);
    }
  };

  return (
    <div ref={containerRef} className={`preview-tab h-full w-full flex flex-col bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 overflow-visible ${className}`}>
      {/* Drag overlay to capture mouse events over iframe */}
      {isDragging && (
        <div 
          className="fixed inset-0 z-[9999] cursor-col-resize"
          style={{ cursor: consolePlacement === 'side' ? 'col-resize' : 'row-resize' }}
        />
      )}
      
      {/* Horizontal Toolbar */}
      <div className="bg-gray-800/30 border-gray-900/50 px-4 py-2 flex items-center space-x-3 flex-shrink-0">
        {/* Refresh Button */}
        <div className="relative group">
          <button
            onClick={() => triggerRefresh('toolbar')}
            className="p-2 hover:bg-gray-700 rounded-md transition-colors flex-shrink-0"

          >
            <RefreshCw size={16} className="text-gray-300" />
          </button>
          <div className="absolute left-1/2 top-full mt-2 transform -translate-x-1/2 px-2 py-1 bg-white text-black text-xs rounded border border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            Refresh (⌘+S)
          </div>
        </div>
        
        {/* URL Bar */}
        <div className="flex-1 min-w-0 flex items-center bg-gray-700 rounded-md px-3 py-1.5">
          <div className="text-gray-400 text-sm mr-2 flex-shrink-0">🔒</div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-white text-sm outline-none truncate"
            placeholder="https://vibecode.io/preview"
            readOnly
            title={url}
          />
        </div>
        
        {/* Popout Button */}
        <div className="relative group">
          <button
            onClick={handlePopout}
            className="p-2 hover:bg-gray-700 rounded-md transition-colors flex-shrink-0"
          >
            {/* Use an external/open icon fallback if Popout isn't available */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300">
              <path d="M14 3h7v7" />
              <path d="M10 14 21 3" />
              <path d="M21 14v7h-7" />
              <path d="M3 10 14 21" />
            </svg>
          </button>
          {/* Tooltip */}
          <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 px-2 py-1 bg-white text-black text-xs rounded border border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            Pop out preview
          </div>
        </div>

        {/* Debug Toggle Button */}
        <div className="relative group">
          <button
            onClick={handleToggleDebug}
            className={`p-2 rounded-md transition-colors flex-shrink-0 ${
              isDebugOpen ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-gray-700'
            }`}
          >
            <Bug size={16} className="text-white" />
          </button>
          {/* Tooltip */}
          <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 px-2 py-1 bg-white text-black text-xs rounded border border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            Toggle Console
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {consolePlacement === 'side' ? (
        /* Horizontal Layout (Side by Side) */
        <div className="flex-1 flex overflow-hidden">
          {/* Left Side - Preview */}
          <div 
            className="flex flex-col overflow-hidden"
            style={{ width: `${isDebugOpen ? splitterPosition : 100}%` }}
          >
            {htmlContent || cssContent || jsContent ? (
              <div className="h-full w-full overflow-hidden">
                <PreviewIframe
                  ref={previewRef}
                  htmlContent={htmlContent}
                  cssContent={cssContent}
                  jsContent={jsContent}
                  onConsoleLog={handleConsoleLog}
                  onSaveShortcut={() => triggerRefresh('iframe-shortcut')}
                  className="w-full"
                  key={internalRefreshKey}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">No Preview Available</h3>
                </div>
              </div>
            )}
          </div>

          {/* Splitter */}
          {isDebugOpen && (
            <div
              className="w-1 cursor-col-resize bg-gray-600 hover:bg-gray-500 transition-colors flex-shrink-0"
              onMouseDown={handleDragStart}
            >
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-0.5 h-8 bg-gray-400 rounded-full"></div>
              </div>
            </div>
          )}

          {/* Right Side - Debug Panel */}
          {isDebugOpen && (
            <div 
              className="border-l border-gray-600 flex flex-col"
              style={{ width: `${100 - splitterPosition}%` }}
            >
              <div className="flex-1 overflow-hidden">
                <PreviewDebugPanel
                  ref={debugPanelRef}
                  onRefresh={() => triggerRefresh('debug-panel')}
                  onConsoleLog={handleConsoleLog}
                  className="h-full"
                  taskName={taskName}
                  placement={consolePlacement}
                  onTogglePlacement={handleTogglePlacement}
                  onSourceClick={handleConsoleSourceClick}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Vertical Layout (Stacked) */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top - Preview */}
          <div 
            className="flex flex-col overflow-hidden"
            style={{ height: `${isDebugOpen ? `calc(100% - ${consoleHeight}px)` : '100%'}` }}
          >
            {htmlContent || cssContent || jsContent ? (
              <div className="h-full w-full overflow-hidden">
                <PreviewIframe
                  ref={previewRef}
                  htmlContent={htmlContent}
                  cssContent={cssContent}
                  jsContent={jsContent}
                  onConsoleLog={handleConsoleLog}
                  onSaveShortcut={() => triggerRefresh('iframe-shortcut')}
                  className="w-full"
                  key={internalRefreshKey}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">No Preview Available</h3>
                </div>
              </div>
            )}
          </div>

          {/* Splitter */}
          {isDebugOpen && (
            <div
              className="h-1 cursor-row-resize bg-gray-600 hover:bg-gray-500 transition-colors flex-shrink-0"
              onMouseDown={handleDragStart}
            >
              <div className="h-full w-full flex items-center justify-center">
                <div className="h-0.5 w-8 bg-gray-400 rounded-full"></div>
              </div>
            </div>
          )}

          {/* Bottom - Debug Panel */}
          {isDebugOpen && (
            <div 
              className="border-t border-gray-600 flex flex-col"
              style={{ height: `${consoleHeight}px` }}
            >
              <div className="flex-1 overflow-hidden">
                <PreviewDebugPanel
                  ref={debugPanelRef}
                  onRefresh={() => triggerRefresh('debug-panel')}
                  onConsoleLog={handleConsoleLog}
                  className="h-full"
                  taskName={taskName}
                  placement={consolePlacement}
                  onTogglePlacement={handleTogglePlacement}
                  onSourceClick={handleConsoleSourceClick}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

PreviewTab.displayName = 'PreviewTab';

export default PreviewTab;
