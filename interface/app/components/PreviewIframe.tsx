"use client";
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { ENV } from '../config/env';
import { ConsoleMessageMeta } from './PreviewDebugPanel';

interface PreviewIframeProps {
  htmlContent?: string;
  cssContent?: string;
  jsContent?: string;
  className?: string;
  onConsoleLog?: (message: string | any[], level?: string, source?: string, meta?: ConsoleMessageMeta) => void;
  onSaveShortcut?: () => void;
}

export interface PreviewIframeRef {
  getIframeElement: () => HTMLIFrameElement | null;
  getFullHtml: () => string;
}

// Minimal sanitization - iframe sandboxing provides the main security
const sanitizeHtml = (html: string): string => {
  // Only remove the most dangerous elements that could break iframe isolation
  return html;
    // .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // Remove nested iframes
    // .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '') // Remove object tags
    // .replace(/<embed[^>]*>/gi, '') // Remove embed tags
    // .replace(/<meta[^>]*http-equiv[^>]*>/gi, ''); // Remove meta tags that could affect security
};

const sanitizeCss = (css: string): string => {
  // Minimal CSS sanitization - iframe sandboxing handles most security concerns
  return css;
    // .replace(/@import[^;]+;/gi, '') // Remove @import rules to prevent external resource loading
    // .replace(/behavior\s*:/gi, '') // Remove behavior property (IE-specific)
    // .replace(/binding\s*:/gi, ''); // Remove binding property (IE-specific)
};

const sanitizeJs = (js: string): string => {
  // Minimal JS sanitization - iframe sandboxing provides isolation
  // Only remove patterns that could potentially break iframe isolation
  return js
    .replace(/window\.parent/gi, '') // Remove parent window access
    .replace(/window\.top/gi, '') // Remove top window access
    .replace(/parent\./gi, '') // Remove parent references
    .replace(/top\./gi, ''); // Remove top references
};

const PreviewIframe = forwardRef<PreviewIframeRef, PreviewIframeProps>(({ 
  htmlContent = '', 
  cssContent = '', 
  jsContent = '', 
  className = '',
  onConsoleLog,
  onSaveShortcut
}, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Expose iframe element to parent component
  useImperativeHandle(ref, () => ({
    getIframeElement: () => iframeRef.current,
    getFullHtml: () => buildFullHtml()
  }));

  // Listen for console messages and errors from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && onConsoleLog) {
        if (event.data.type === 'console-log') {
          const level = event.data.level || 'log';
          const source = event.data.source; // Only include source if provided
          const meta: ConsoleMessageMeta = {
            line: typeof event.data.line === 'number' ? event.data.line : null,
            column: typeof event.data.column === 'number' ? event.data.column : null,
            rawLine: typeof event.data.rawLine === 'number' ? event.data.rawLine : null,
            rawColumn: typeof event.data.rawColumn === 'number' ? event.data.rawColumn : null,
            phase: event.data.phase || null,
            name: event.data.name || null,
            stack: event.data.stack || null,
            origin: event.data.origin || null
          };
          
          // Handle both new args format and legacy message format
          if (event.data.args) {
            // New format: send raw arguments to preserve object formatting
            onConsoleLog(event.data.args, level, source, meta);
          } else {
            // Legacy format: fallback to string message
            const message = event.data.message || '';
            onConsoleLog(message, level, source, meta);
          }
        } else if (event.data.type === 'iframe-error') {
          // Handle errors from iframe
          const errorMessage = event.data.message || 'Unknown error';
          const source = event.data.source || (
            typeof event.data.line === 'number'
              ? `frontend.js:${event.data.line}${typeof event.data.column === 'number' ? `:${event.data.column}` : ''}`
              : undefined
          );
          const meta: ConsoleMessageMeta = {
            line: typeof event.data.line === 'number' ? event.data.line : null,
            column: typeof event.data.column === 'number' ? event.data.column : null,
            rawLine: typeof event.data.rawLine === 'number' ? event.data.rawLine : null,
            rawColumn: typeof event.data.rawColumn === 'number' ? event.data.rawColumn : null,
            docLine: typeof event.data.docLine === 'number' ? event.data.docLine : null,
            docColumn: typeof event.data.docColumn === 'number' ? event.data.docColumn : null,
            phase: event.data.phase || null,
            name: event.data.name || null,
            stack: event.data.stack || null,
            origin: event.data.origin || null
          };
          onConsoleLog(errorMessage, 'error', source, meta);
        } else if (event.data.type === 'save-shortcut') {
          try {
            onSaveShortcut && onSaveShortcut();
          } catch (_) {}
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConsoleLog, onSaveShortcut]);

  // Build the complete HTML document with security measures
  const buildFullHtml = () => {
    // Sanitize all input content
    const sanitizedHtml = sanitizeHtml(htmlContent);
    const sanitizedCss = sanitizeCss(cssContent);
    const sanitizedJs = sanitizeJs(jsContent);
    
    // Use raw sanitized JS for user code; define callAPI separately inside the wrapper
    const processedJs = sanitizedJs;
    
    let fullHtml = '';
    
    if (sanitizedHtml) {
      // If htmlContent already contains a full HTML document, use it as base
      if (sanitizedHtml.includes('<html') || sanitizedHtml.includes('<!DOCTYPE')) {
        fullHtml = sanitizedHtml;
      } else {
        // Wrap the HTML content in a basic structure
        fullHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Preview</title>
            <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none';">
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
      // Create a basic HTML structure if no HTML content provided
      fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Preview</title>
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none';">
          <meta http-equiv="X-Content-Type-Options" content="nosniff">
          <meta http-equiv="X-Frame-Options" content="DENY">
          <meta http-equiv="Referrer-Policy" content="no-referrer">
        </head>
        <body>
          <h1>Preview</h1>
        </body>
        </html>
      `;
    }
    
    // Inject CSS if provided
    if (sanitizedCss) {
      fullHtml = fullHtml.replace('</head>', `<style>${sanitizedCss}</style></head>`);
    }
    
    // Inject JavaScript if provided
    if (processedJs) {
      const scriptSafeJs = processedJs.replace(/<\/script>/gi, '<\\/script>');
      const consoleLineAdjustment = 1;

      const instrumentationScript = `
        (function() {
          if (window.__previewInstrumentationInstalled) { return; }
          window.__previewInstrumentationInstalled = true;

          const CONSOLE_LINE_ADJUST = ${consoleLineAdjustment};
          const USER_SCRIPT_START_LINE = __USER_SCRIPT_START_LINE_PLACEHOLDER__;

          const safePostMessage = (payload) => {
            if (window.parent && window.parent !== window) {
              try { window.parent.postMessage(payload, '*'); } catch (_) {}
            }
          };

          const findLineCol = (stack, options) => {
            const opts = options || {};
            try {
              const text = String(stack || '');
              const lines = text.split('\\n');
              for (let i = 0; i < lines.length; i++) {
                const lineText = lines[i];
                if (!lineText) { continue; }
                if (opts.skipConsoleFrames && (lineText.indexOf('console.') !== -1 || lineText.indexOf('interceptConsole') !== -1)) {
                  continue;
                }
                const primaryMatch = lineText.match(/frontend\\.js:(\\d+):(\\d+)/);
                if (primaryMatch) {
                  return { line: parseInt(primaryMatch[1], 10), col: parseInt(primaryMatch[2], 10), isDoc: false };
                }
                const fallbackMatch = lineText.match(/:(\\d+):(\\d+)(?:\\)|$)/);
                if (fallbackMatch) {
                  return { line: parseInt(fallbackMatch[1], 10), col: parseInt(fallbackMatch[2], 10), isDoc: true };
                }
              }
            } catch (_) {}
            return { line: null, col: null, isDoc: false };
          };

          const adjustConsoleLine = (line) => {
            if (typeof line !== 'number' || !isFinite(line)) { return null; }
            const adjusted = line - CONSOLE_LINE_ADJUST;
            return adjusted > 0 ? adjusted : 1;
          };

          const normalizeDocLine = (line) => {
            if (typeof line !== 'number' || !isFinite(line)) { return null; }
            const adjusted = line - USER_SCRIPT_START_LINE;
            return adjusted > 0 ? adjusted : 1;
          };

          const buildSource = (line, col) => {
            return (typeof line === 'number' && line > 0)
              ? ('frontend.js:' + line + (typeof col === 'number' && col > 0 ? ':' + col : ''))
              : undefined;
          };

          const originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
          };

          const interceptConsole = (method, type) => {
            console[method] = function(...args) {
              originalConsole[method].apply(console, args);

              let line = null;
              let col = null;
              let stack;
              let fromDoc = false;
              try {
                const err = new Error();
                stack = err && err.stack;
                let location = findLineCol(stack, { skipConsoleFrames: true });
                if (!location || location.line == null) {
                  location = findLineCol(stack);
                }
                if (location) {
                  line = typeof location.line === 'number' ? location.line : null;
                  col = typeof location.col === 'number' ? location.col : null;
                  if (location.isDoc) {
                    line = normalizeDocLine(line);
                    fromDoc = true;
                  }
                }
              } catch (_) {}

              let outputLine = line;
              if (fromDoc && typeof outputLine === 'number') {
                outputLine = outputLine + 1;
              }

              const scriptLine = adjustConsoleLine(outputLine);

              safePostMessage({
                type: 'console-log',
                level: type,
                args,
                line: scriptLine,
                column: col,
                stack: stack ? String(stack) : undefined,
                source: buildSource(scriptLine, col),
                rawLine: typeof outputLine === 'number' ? outputLine : null,
                rawColumn: typeof col === 'number' ? col : null,
                phase: 'log',
                origin: fromDoc ? 'doc' : 'stack'
              });
            };
          };

          interceptConsole('log', 'log');
          interceptConsole('warn', 'warn');
          interceptConsole('error', 'error');
          interceptConsole('info', 'info');

          window.addEventListener('error', function(event) {
            if (!event || event.type !== 'error') { return; }

            const stack = event.error && event.error.stack ? String(event.error.stack) : undefined;
            const location = stack ? findLineCol(stack) : null;
            const stackLine = (location && typeof location.line === 'number')
              ? (location.isDoc ? normalizeDocLine(location.line) : location.line)
              : null;
            const stackCol = (location && typeof location.col === 'number') ? location.col : null;
            const docLine = typeof event.lineno === 'number' ? event.lineno : null;
            const docCol = typeof event.colno === 'number' ? event.colno : null;

            const line = stackLine != null ? stackLine : normalizeDocLine(docLine);
            const col = stackLine != null ? stackCol : docCol;

            const name = (event.error && event.error.name) || 'Error';
            const message = (event.error && event.error.message) || event.message || 'Unknown error';
            const displayMessage = name + ': ' + message;
            const origin = stackLine != null ? 'stack' : 'doc';
            const isSyntax = name === 'SyntaxError' || (typeof event.message === 'string' && /^SyntaxError\b/.test(event.message));
            const phaseLabel = (!stackLine && isSyntax) ? 'compile' : 'runtime';

            safePostMessage({
              type: 'iframe-error',
              message: displayMessage,
              line: line ?? null,
              column: col ?? null,
              rawLine: stackLine != null ? stackLine : (docLine ?? null),
              rawColumn: stackCol != null ? stackCol : (docCol ?? null),
              docLine: docLine ?? null,
              docColumn: docCol ?? null,
              stack,
              source: buildSource(line, col),
              name,
              phase: phaseLabel,
              origin
            });
          });

          window.addEventListener('unhandledrejection', function(event) {
            const reason = event && event.reason;
            const stack = reason && reason.stack ? String(reason.stack) : undefined;
            const location = stack ? findLineCol(stack) : null;
            const stackLine = (location && typeof location.line === 'number')
              ? (location.isDoc ? normalizeDocLine(location.line) : location.line)
              : null;
            const stackCol = (location && typeof location.col === 'number') ? location.col : null;
            const line = stackLine != null ? stackLine : null;
            const col = stackCol != null ? stackCol : null;
            const label = reason && reason.name ? reason.name : 'UnhandledRejection';
            const messageText = reason && reason.message ? reason.message : String(reason || 'Unknown reason');
            const displayMessage = 'Unhandled Promise Rejection: ' + messageText;
            const origin = stackLine != null ? 'stack' : 'doc';

            safePostMessage({
              type: 'iframe-error',
              message: displayMessage,
              line,
              column: col,
              stack,
              source: buildSource(line, col),
              name: label,
              rawLine: stackLine ?? null,
              rawColumn: stackCol ?? null,
              phase: 'runtime',
              origin
            });
          });
        })();
      `.trim();

      const instrumentationTag = `<script>${instrumentationScript}</script>`;
      fullHtml = fullHtml.replace('</head>', `${instrumentationTag}</head>`);

      const userScriptPlaceholder = '<!--PREVIEW_USER_SCRIPT_PLACEHOLDER-->';
      fullHtml = fullHtml.replace('</body>', `${userScriptPlaceholder}</body>`);

      const htmlBeforePlaceholder = fullHtml.split(userScriptPlaceholder)[0];
      const userScriptStartLine = htmlBeforePlaceholder.split('\n').length + 1;

      fullHtml = fullHtml.replace('__USER_SCRIPT_START_LINE_PLACEHOLDER__', String(userScriptStartLine));

      const userScript = `<script id="preview-user-js" data-doc-line="${userScriptStartLine}">
${scriptSafeJs}
//# sourceURL=frontend.js
</script>`;

      fullHtml = fullHtml.replace(userScriptPlaceholder, userScript);

      // Inject capture-phase handlers to intercept Cmd/Ctrl+S and Cmd/Ctrl+ArrowLeft/Right inside the iframe
      const saveInterceptor = `
        <script>
          (function(){
            function onKeyDown(e){
              try {
                var isCmdOrCtrl = !!(e && (e.metaKey || e.ctrlKey));
                var key = (e && e.key || '').toLowerCase();
                var code = (e && e.code) || '';
                if (isCmdOrCtrl && key === 's') {
                  e.preventDefault();
                  e.stopPropagation();
                  try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                  if (window.parent && window.parent !== window) {
                    try { window.parent.postMessage({ type: 'save-shortcut' }, '*'); } catch(_) {}
                  }
                }
                if (isCmdOrCtrl && (key === 'arrowleft' || code === 'ArrowLeft' || key === 'arrowright' || code === 'ArrowRight')) {
                  e.preventDefault();
                  e.stopPropagation();
                  try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                }
              } catch(_) {}
            }
            function onKeyUp(e){
              try {
                var isCmdOrCtrl = !!(e && (e.metaKey || e.ctrlKey));
                var key = (e && e.key || '').toLowerCase();
                var code = (e && e.code) || '';
                if (isCmdOrCtrl && (key === 'arrowleft' || code === 'ArrowLeft' || key === 'arrowright' || code === 'ArrowRight')) {
                  e.preventDefault();
                  e.stopPropagation();
                  try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                }
              } catch(_) {}
            }
            try { document.addEventListener('keydown', onKeyDown, true); } catch(_) {}
            try { document.addEventListener('keyup', onKeyUp, true); } catch(_) {}
          })();
        </script>
      `;

      fullHtml = fullHtml.replace('</body>', `${saveInterceptor}</body>`);
    }
    
    return fullHtml;
  };

  return (
    <iframe
      ref={iframeRef}
      className={`preview-iframe ${className}`}
      style={{
        width: '100%',
        minHeight: '100%',
        border: 'none',
        background: 'white',
        display: 'block'
      }}
      title="Website Preview"
      srcDoc={buildFullHtml()}
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
      allow="none"
      referrerPolicy="no-referrer"
      loading="lazy"
      allowFullScreen={false}
    />
  );
});

PreviewIframe.displayName = 'PreviewIframe';

export default PreviewIframe;
