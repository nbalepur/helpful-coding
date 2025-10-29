'use client';

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Terminal, Columns, Rows, Trash2 } from 'lucide-react';

interface ConsoleMessage {
  id: string;
  message: any;
  level: string;
  timestamp: string;
  source?: string;
}

export interface PreviewDebugPanelRef {
  addConsoleMessage: (message: any, level: string, source?: string) => void;
}

interface PreviewDebugPanelProps {
  onRefresh?: () => void;
  onConsoleLog?: (message: any, level: string) => void;
  className?: string;
  taskName?: string;
  placement?: 'side' | 'bottom';
  onTogglePlacement?: () => void;
}

const PreviewDebugPanel = forwardRef<PreviewDebugPanelRef, PreviewDebugPanelProps>(({
  onRefresh,
  onConsoleLog,
  className = '',
  taskName = 'preview',
  placement = 'bottom',
  onTogglePlacement
}, ref) => {
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const consoleIframeRef = useRef<HTMLIFrameElement>(null);
  
  // Tooltip state
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipText, setTooltipText] = useState('');
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const [tooltipTop, setTooltipTop] = useState(0);
  const [tooltipPlaceAbove, setTooltipPlaceAbove] = useState(true);

  // Hide tooltip when placement changes
  useEffect(() => {
    setTooltipVisible(false);
  }, [placement]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    addConsoleMessage: (message: any, level: string = 'log', source?: string) => {
      const newMessage: ConsoleMessage = {
        id: `${Date.now()}-${Math.random()}`,
        message,
        level,
        timestamp: '',
        source: source
      };
      
      setConsoleMessages(prev => [...prev, newMessage]);
    }
  }));

  const clearConsole = () => {
    setConsoleMessages([]);
  };

  // Helper function to update iframe content
  const updateIframeContent = () => {
    if (consoleIframeRef.current) {
      const iframe = consoleIframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(generateConsoleHTML());
        iframeDoc.close();
      }
    }
  };

  // Helper function to scroll iframe to bottom
  const scrollIframeToBottom = () => {
    if (consoleIframeRef.current) {
      const iframe = consoleIframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.documentElement.scrollTop = iframeDoc.documentElement.scrollHeight;
      }
    }
  };

  // Safely stringify complex objects (handles circular refs and functions)
  const safeStringify = (value: any): string => {
    try {
      const seen = new WeakSet();
      return JSON.stringify(
        value,
        (key, val) => {
          // Handle primitives that JSON can't serialize directly
          if (typeof val === 'bigint') return `${val.toString()}n`;
          if (typeof val === 'symbol') return `[Symbol ${val.description || ''}]`;

          // Error objects
          if (val instanceof Error) {
            return { name: val.name, message: val.message, stack: val.stack };
          }

          // Date
          if (val instanceof Date) return val.toISOString();

          // Map / Set (serialize as arrays)
          if (val instanceof Map) return { __type: 'Map', entries: Array.from(val.entries()) };
          if (val instanceof Set) return { __type: 'Set', values: Array.from(val.values()) };

          // Circular refs
          if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
          }

          // Functions
          if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;

          return val;
        },
        2
      );
    } catch (e) {
      try { return String(value); } catch { return '[Unserializable]'; }
    }
  };

  // Escape HTML to prevent markup injection in iframe content
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  // Generate HTML content for the console iframe
  const generateConsoleHTML = (): string => {
    const messagesHTML = consoleMessages.length === 0 
      ? `
        <div style="text-align: center; padding: 20px; color: #888;">
          <div style="font-size: 12px;">No console messages</div>
        </div>
      `
      : consoleMessages.map((msg, index) => `
        <div style="padding: 2px 0; ${index > 0 ? 'border-top: 1px solid #333;' : ''}">
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <span style="${getLevelColor(msg.level)} font-size: 12px; line-height: 1.2;">
              ${escapeHtml(formatMessage(msg.message))}
            </span>
            ${msg.source ? `<span style="color: #6bcf7f; font-size: 12px; text-decoration: underline; cursor: pointer; flex-shrink: 0;">${escapeHtml(String(msg.source))}</span>` : ''}
          </div>
        </div>
      `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            margin: 0;
            padding: 8px;
            background-color: #000;
            color: #e5e5e5;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            line-height: 1.2;
            overflow-y: auto;
            height: 100vh;
            box-sizing: border-box;
          }
          * {
            box-sizing: border-box;
          }
        </style>
      </head>
      <body>
        ${messagesHTML}
      </body>
      </html>
    `;
  };

  const formatMessage = (message: any): string => {
    if (Array.isArray(message)) {
      return message.map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object') return safeStringify(item);
        return String(item);
      }).join(' ');
    }
    if (typeof message === 'string') return message;
    if (typeof message === 'object') return safeStringify(message);
    return String(message);
  };

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'error': return 'color: #ff6b6b; font-weight: bold;';
      case 'warn': return 'color: #ffd93d; font-weight: bold;';
      case 'info': return 'color: #6bcf7f; font-weight: bold;';
      case 'success': return 'color: #6bcf7f; font-weight: bold;';
      default: return 'color: #e5e5e5; font-weight: bold;';
    }
  };

  // Update iframe content whenever messages change and keep scroll at bottom
  React.useEffect(() => {
    updateIframeContent();
    scrollIframeToBottom();
  }, [consoleMessages]);

  return (
    <div className={`preview-debug-panel h-full flex flex-col ${className}`}>
      {/* Console Header */}
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between bg-gray-800 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <span className="text-gray-300 text-sm font-medium">Console</span>
        </div>
        <div className="flex items-center space-x-1.5">
          {onTogglePlacement && (
            <button
              onClick={onTogglePlacement}
              className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-all duration-300 flex items-center justify-center hover:scale-105"
              onMouseEnter={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const vw = window.innerWidth || document.documentElement.clientWidth;
                const vh = window.innerHeight || document.documentElement.clientHeight;
                const margin = 10;
                let left = rect.left + rect.width / 2;
                left = Math.min(Math.max(left, margin), vw - margin);
                const spaceAbove = rect.top;
                const spaceBelow = vh - rect.bottom;
                const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                const top = placeAbove ? rect.top : rect.bottom;
                setTooltipText(placement === 'side' ? 'Switch to bottom layout' : 'Switch to side layout');
                setTooltipLeft(left);
                setTooltipTop(top);
                setTooltipPlaceAbove(placeAbove);
                setTooltipVisible(true);
              }}
              onMouseLeave={() => {
                setTooltipVisible(false);
              }}
              onMouseMove={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const vw = window.innerWidth || document.documentElement.clientWidth;
                const vh = window.innerHeight || document.documentElement.clientHeight;
                const margin = 10;
                let left = rect.left + rect.width / 2;
                left = Math.min(Math.max(left, margin), vw - margin);
                const spaceAbove = rect.top;
                const spaceBelow = vh - rect.bottom;
                const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                const top = placeAbove ? rect.top : rect.bottom;
                setTooltipLeft(left);
                setTooltipTop(top);
                setTooltipPlaceAbove(placeAbove);
              }}
            >
              {placement === 'side' ? <Rows className="h-3.5 w-3.5" /> : <Columns className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            onClick={clearConsole}
            className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-all duration-300 flex items-center justify-center hover:scale-105"
            onMouseEnter={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const vw = window.innerWidth || document.documentElement.clientWidth;
              const vh = window.innerHeight || document.documentElement.clientHeight;
              const margin = 10;
              let left = rect.left + rect.width / 2;
              left = Math.min(Math.max(left, margin), vw - margin);
              const spaceAbove = rect.top;
              const spaceBelow = vh - rect.bottom;
              const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
              const top = placeAbove ? rect.top : rect.bottom;
              setTooltipText('Clear console');
              setTooltipLeft(left);
              setTooltipTop(top);
              setTooltipPlaceAbove(placeAbove);
              setTooltipVisible(true);
            }}
            onMouseLeave={() => {
              setTooltipVisible(false);
            }}
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const vw = window.innerWidth || document.documentElement.clientWidth;
              const vh = window.innerHeight || document.documentElement.clientHeight;
              const margin = 10;
              let left = rect.left + rect.width / 2;
              left = Math.min(Math.max(left, margin), vw - margin);
              const spaceAbove = rect.top;
              const spaceBelow = vh - rect.bottom;
              const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
              const top = placeAbove ? rect.top : rect.bottom;
              setTooltipLeft(left);
              setTooltipTop(top);
              setTooltipPlaceAbove(placeAbove);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      
      {/* Console Messages - Using iframe for proper scrolling */}
      <iframe
        ref={consoleIframeRef}
        className="flex-1 w-full border-none bg-black"
        style={{ minHeight: 0 }}
        srcDoc={generateConsoleHTML()}
        title="Console Output"
        sandbox="allow-same-origin"
      />
      
      {/* Tooltip */}
      {tooltipVisible && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: tooltipLeft,
            top: tooltipTop,
            transform: tooltipPlaceAbove ? 'translate(-50%, -100%) translateY(-8px)' : 'translate(-50%, 8px)',
            backgroundColor: '#111827',
            color: '#ffffff',
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid #374151',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
            zIndex: 100000,
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {tooltipText}
        </div>,
        document.body
      )}
    </div>
  );
});

PreviewDebugPanel.displayName = 'PreviewDebugPanel';

export default PreviewDebugPanel;