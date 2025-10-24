"use client";

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';

export type AssistantType = 'user' | 'assistant' | 'tool' | 'message' | 'action';

export interface AssistantItem {
  message?: string;
  text?: string;
  type?: AssistantType;
}

interface AssistantTerminalPaneProps {
  items?: AssistantItem[];
  className?: string;
  title?: string;
  onClearMessages?: () => void;
  inputValue?: string;
  onInputChange?: (value: string) => void;
}

const AssistantTerminalPane: React.FC<AssistantTerminalPaneProps> = ({
  items,
  className = '',
  title = 'AI Assistant',
  onClearMessages,
  inputValue: controlledInputValue,
  onInputChange
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // container inside terminal-content; used only for width/border
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localInputValue, setLocalInputValue] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(32);
  
  // Use controlled value if provided, otherwise use local state
  const inputValue = controlledInputValue !== undefined ? controlledInputValue : localInputValue;
  const setInputValue = onInputChange || setLocalInputValue;

  const srcDoc = useMemo(() => {
    const demoItems: AssistantItem[] = [];

    const data = (items && items.length ? items : demoItems);
    const normalized = data.map((m) => {
      const text = String(m.message ?? m.text ?? '');
      const t = (m.type || 'assistant') as AssistantType;
      let role: 'user' | 'assistant' | 'tool';
      if (t === 'user') role = 'user';
      else if (t === 'tool') role = 'tool';
      else role = 'assistant';
      return { text, role } as { text: string; role: 'user' | 'assistant' | 'tool' };
    });

    const messagesHTML = normalized
      .map(({ text, role }) => {
        const content = escapeHtml(text);
        if (role === 'user') {
          return `<div class="msg user">${content}</div>`;
        } else if (role === 'tool') {
          return `<div class="msg tool"><span class="spinner"></span><span class="tool-text">${content}</span></div>`;
        }
        return `<div class="msg assistant">${content}</div>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: #0a0a0a;
      --panel: #0f1115;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --border: #1f2937;
      --accent: #60a5fa;
      --assistant: #a78bfa;
      --tool: #f59e0b;
    }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      font-size: 12px;
      line-height: 1.4;
      overflow-y: auto; /* show scrollbar only when content overflows */
    }
    .wrap { padding: 0; }
    .msg { margin: 8px 8px 0; padding: 6px 10px; color: var(--text); white-space: pre-wrap; word-break: break-word; border-radius: 6px; line-height: 1.35; }
    .msg:first-child { margin-top: 0; } /* Remove top margin from first message */
    .msg.user { background: rgba(255,255,255,0.06); border: 1px solid var(--border); }
    .msg.assistant { background: transparent; }
    .msg.tool { display: inline-flex; gap: 8px; align-items: center; background: #0c0e13; border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 0 6px 6px 0; padding: 3px 8px; margin: 4px 8px 0; }
    .msg.tool:first-child { margin-top: 0; } /* Remove top margin from first tool message */
    /* Tighter spacing between assistant and tool messages since both are assistant-originated */
    .msg.assistant + .msg.tool { margin-top: 2px; }
    .msg.tool + .msg.assistant { margin-top: 2px; }
    .spinner { width: 12px; height: 12px; border: 1px solid rgba(255,255,255,0.25); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    /* Custom scrollbar styling */
    ::-webkit-scrollbar {
      width: 8px;
    }
    ::-webkit-scrollbar-track {
      background: #1a1a1a;
    }
    ::-webkit-scrollbar-thumb {
      background: #555;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #777;
    }
  </style>
</head>
<body>
  <div class="wrap">${messagesHTML || '<div class="msg assistant" style="color: var(--muted);">No messages yet.</div>'}</div>
  <script>
    // Check if scrolling is needed and hide scrollbar if not
    function checkScrollbar() {
      const body = document.body;
      const html = document.documentElement;
      
      // Check if content height exceeds viewport height
      const needsScroll = body.scrollHeight > html.clientHeight;
      
      if (!needsScroll) {
        body.style.overflowY = 'hidden';
      } else {
        body.style.overflowY = 'auto';
      }
    }
    
    // Check on load and when content changes
    checkScrollbar();
    
    // Also check when window resizes
    window.addEventListener('resize', checkScrollbar);
    
    // Use MutationObserver to detect content changes
    const observer = new MutationObserver(checkScrollbar);
    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      attributes: true 
    });
  </script>
</body>
</html>`;
  }, [items]);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    
    const scrollToBottom = () => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        try {
          // Use body.scrollHeight if documentElement doesn't work
          const body = doc.body;
          const html = doc.documentElement;
          const maxScroll = Math.max(
            body.scrollHeight, body.offsetHeight,
            html.clientHeight, html.scrollHeight, html.offsetHeight
          );
          html.scrollTop = maxScroll;
          body.scrollTop = maxScroll;
        } catch (e) {
          console.warn('Failed to scroll iframe:', e);
        }
      }
    };

    // Scroll to bottom after content loads
    const onLoad = () => {
      // Small delay to ensure content is rendered
      setTimeout(scrollToBottom, 10);
    };
    iframe.addEventListener('load', onLoad);
    
    // Also scroll immediately if content is already loaded
    setTimeout(scrollToBottom, 50);

    return () => {
      iframe.removeEventListener('load', onLoad);
    };
  }, [srcDoc, items?.length]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Reset height to get accurate scrollHeight
    textarea.style.height = 'auto';
    
    // Set new height based on content (max 6 lines)
    const newHeight = Math.min(textarea.scrollHeight, 160); // ~6 lines
    setTextareaHeight(newHeight);
    textarea.style.height = `${newHeight}px`;
  }, [inputValue]);

  // Scroll iframe down when textarea expands
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    
    const scrollToBottom = () => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        try {
          const body = doc.body;
          const html = doc.documentElement;
          const maxScroll = Math.max(
            body.scrollHeight, body.offsetHeight,
            html.clientHeight, html.scrollHeight, html.offsetHeight
          );
          html.scrollTop = maxScroll;
          body.scrollTop = maxScroll;
        } catch (e) {
          console.warn('Failed to scroll iframe:', e);
        }
      }
    };
    
    // Small delay to ensure layout has updated
    setTimeout(scrollToBottom, 10);
  }, [textareaHeight]);

  return (
    <div className={`w-full h-full flex flex-col ${className}`}>
      <iframe
        ref={iframeRef}
        className="w-full border-0 bg-black"
        style={{ flex: 1, minHeight: 0 }}
        srcDoc={srcDoc}
        title="AI Assistant Output"
        sandbox="allow-same-origin"
      />
      {/* Toolbar outside the iframe, inside the assistant terminal */}
      <div className="flex flex-col gap-2 p-2 bg-gray-800/50 border-t border-gray-700/50">
        <div className="flex gap-2 items-center">
          <Bot size={16} className="flex-shrink-0 text-gray-400" />
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your next instruction..."
            className="flex-1 text-sm rounded px-2 py-1 text-white placeholder-gray-400 focus:outline-none resize-none overflow-hidden"
            style={{ 
              background: 'rgba(59, 130, 246, 0.1)', 
              border: '1px solid #374151',
              minHeight: '32px',
              maxHeight: '160px',
              height: `${textareaHeight}px`
            }}
            rows={1}
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default AssistantTerminalPane;


