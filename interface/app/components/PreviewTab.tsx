"use client";
import React, { useMemo, useRef, useState, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import PreviewIframe from './PreviewIframe';
import PreviewDebugPanel, { PreviewDebugPanelRef } from './PreviewDebugPanel';
import { FileNode } from './FileManager';
import { RefreshCw, Bug, Terminal, X, Columns, Rows } from 'lucide-react';

interface PreviewTabProps {
  files: FileNode[];
  className?: string;
  taskName?: string;
  refreshKey?: number;
  actualEditorRef?: React.RefObject<any>;
}

export interface PreviewTabRef {
  refreshPreview: () => void;
  addConsoleMessage: (message: any, level: string) => void;
}

const PreviewTab = forwardRef<PreviewTabRef, PreviewTabProps>(({ files, className = '', taskName = 'preview', refreshKey = 0, actualEditorRef }, ref) => {
  const previewRef = useRef<any>(null);
  const debugPanelRef = useRef<PreviewDebugPanelRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalRefreshKey, setInternalRefreshKey] = useState(0);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [url, setUrl] = useState(`https://vibecode.io/${taskName.toLowerCase().replace(/\s+/g, '-')}`);
  
  // Console placement and dragging state
  const [consolePlacement, setConsolePlacement] = useState<'side' | 'bottom'>('side');
  const [splitterPosition, setSplitterPosition] = useState(50); // Percentage for side placement
  const [consoleHeight, setConsoleHeight] = useState(200); // Pixels for bottom placement
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Update URL when taskName changes
  React.useEffect(() => {
    const formattedTaskName = taskName.toLowerCase().replace(/\s+/g, '-');
    setUrl(`https://vibecode.io/${formattedTaskName}`);
  }, [taskName]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    refreshPreview: () => {
      setInternalRefreshKey(prev => prev + 1);
    },
    addConsoleMessage: (message: any, level: string) => {
      debugPanelRef.current?.addConsoleMessage(message, level);
    }
  }));

  // Extract HTML, CSS, and JS content; prefer live editor contents when available
  const { htmlContent, cssContent, jsContent } = useMemo(() => {
    let html = '';
    let css = '';
    let js = '';

    // Attempt to read live contents from the active editor (if provided)
    if (actualEditorRef?.current?.getAllFileContents) {
      try {
        const live = actualEditorRef.current.getAllFileContents() as Record<string, string>;
        const entries = Object.entries(live);
        const findByExt = (exts: string[]) => entries.find(([id]) => exts.some(ext => id.toLowerCase().endsWith(ext)));
        const htmlLive = findByExt(['.html', 'index.html']);
        const cssLive = findByExt(['.css', 'style.css', 'styles.css']);
        const jsLive = findByExt(['.js', 'script.js', 'frontend.js']);
        if (htmlLive && String(htmlLive[1]).trim()) html = String(htmlLive[1]);
        if (cssLive && String(cssLive[1]).trim()) css = String(cssLive[1]);
        if (jsLive && String(jsLive[1]).trim()) js = String(jsLive[1]);
      } catch (_) {}
    }

    // Helper function to flatten file tree
    const flattenFiles = (nodes: FileNode[]): FileNode[] => {
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

    const flatFiles = flattenFiles(files);

    // If live content not found, fall back to saved files by name patterns
    const htmlFile = html ? null : flatFiles.find(file => 
      file.name.toLowerCase().endsWith('.html') || 
      file.name.toLowerCase() === 'index.html'
    );
    
    const cssFile = css ? null : flatFiles.find(file => 
      file.name.toLowerCase().endsWith('.css') || 
      file.name.toLowerCase() === 'style.css' ||
      file.name.toLowerCase() === 'styles.css'
    );
    
    const jsFile = js ? null : flatFiles.find(file => 
      file.name.toLowerCase().endsWith('.js') || 
      file.name.toLowerCase() === 'script.js' ||
      file.name.toLowerCase() === 'frontend.js'
    );

    // Extract content (saved) only if not already filled from live
    if (htmlFile) {
      html = htmlFile.content || '';
    }
    if (cssFile) {
      css = cssFile.content || '';
    }
    if (jsFile) {
      js = jsFile.content || '';
    }

    return { htmlContent: html, cssContent: css, jsContent: js };
  }, [files, refreshKey, actualEditorRef]);

  // Handle console logs from the iframe
  const handleConsoleLog = (message: any, level: string = 'log', source?: string) => {
    // Forward to debug panel with optional source for errors
    debugPanelRef.current?.addConsoleMessage(message, level, source);
  };

  // Handle refresh
  const handleRefresh = () => {
    setInternalRefreshKey(prev => prev + 1);
  };

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
    <div ref={containerRef} className={`preview-tab h-full w-full flex flex-col bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 overflow-hidden ${className}`}>
      {/* Drag overlay to capture mouse events over iframe */}
      {isDragging && (
        <div 
          className="fixed inset-0 z-[9999] cursor-col-resize"
          style={{ cursor: consolePlacement === 'side' ? 'col-resize' : 'row-resize' }}
        />
      )}
      
      {/* Horizontal Toolbar */}
      <div className="bg-gray-800/30 border-b border-gray-700/50 px-4 py-2 flex items-center space-x-3 flex-shrink-0">
        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          className="p-2 hover:bg-gray-700 rounded-md transition-colors flex-shrink-0"
          title="Refresh Preview"
        >
          <RefreshCw size={16} className="text-gray-300" />
        </button>
        
        {/* URL Bar */}
        <div className="flex-1 flex items-center bg-gray-700 rounded-md px-3 py-1.5">
          <div className="text-gray-400 text-sm mr-2">🔒</div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm outline-none"
            placeholder="https://vibecode.io/preview"
            readOnly
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
          <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            Pop out preview
            <div className="absolute right-0 top-1/2 transform -translate-y-1/2 -mr-2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-gray-900"></div>
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
          <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            Toggle Console
            <div className="absolute right-0 top-1/2 transform -translate-y-1/2 -mr-2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-gray-900"></div>
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
                  className="w-full"
                  key={`${refreshKey}-${internalRefreshKey}`}
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
                  onRefresh={handleRefresh}
                  onConsoleLog={handleConsoleLog}
                  className="h-full"
                  taskName={taskName}
                  placement={consolePlacement}
                  onTogglePlacement={handleTogglePlacement}
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
                  className="w-full"
                  key={`${refreshKey}-${internalRefreshKey}`}
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
                  onRefresh={handleRefresh}
                  onConsoleLog={handleConsoleLog}
                  className="h-full"
                  taskName={taskName}
                  placement={consolePlacement}
                  onTogglePlacement={handleTogglePlacement}
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
