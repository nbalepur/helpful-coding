"use client";
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { ENV } from '../config/env';

interface PreviewIframeProps {
  htmlContent?: string;
  cssContent?: string;
  jsContent?: string;
  className?: string;
  onConsoleLog?: (message: string | any[], level?: string, source?: string) => void;
}

export interface PreviewIframeRef {
  getIframeElement: () => HTMLIFrameElement | null;
  getFullHtml: () => string;
}

// Minimal sanitization - iframe sandboxing provides the main security
const sanitizeHtml = (html: string): string => {
  // Only remove the most dangerous elements that could break iframe isolation
  return html
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // Remove nested iframes
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '') // Remove object tags
    .replace(/<embed[^>]*>/gi, '') // Remove embed tags
    .replace(/<meta[^>]*http-equiv[^>]*>/gi, ''); // Remove meta tags that could affect security
};

const sanitizeCss = (css: string): string => {
  // Minimal CSS sanitization - iframe sandboxing handles most security concerns
  return css
    .replace(/@import[^;]+;/gi, '') // Remove @import rules to prevent external resource loading
    .replace(/behavior\s*:/gi, '') // Remove behavior property (IE-specific)
    .replace(/binding\s*:/gi, ''); // Remove binding property (IE-specific)
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
  onConsoleLog
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
          
          // Handle both new args format and legacy message format
          if (event.data.args) {
            // New format: send raw arguments to preserve object formatting
            onConsoleLog(event.data.args, level, source);
          } else {
            // Legacy format: fallback to string message
            const message = event.data.message || '';
            onConsoleLog(message, level, source);
          }
        } else if (event.data.type === 'iframe-error') {
          // Handle errors from iframe
          const errorMessage = event.data.message || 'Unknown error';
          const source = event.data.source; // Do not inject a placeholder source
          onConsoleLog(errorMessage, 'error', source);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConsoleLog]);

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
            <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${ENV.EXECUTE_ENDPOINT_URL}; frame-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none';">
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
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${ENV.EXECUTE_ENDPOINT_URL}; frame-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none';">
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
      const escapedJs = processedJs
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');

      const interceptedJs = `
        (function() {
          const originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
          };

          const interceptConsole = (method, type) => {
            console[method] = function(...args) {
              originalConsole[method].apply(console, args);

              if (window.parent && window.parent !== window) {
                try {
                  window.parent.postMessage({
                    type: 'console-log',
                    level: type,
                    args
                  }, '*');
                } catch (e) {
                  // Ignore cross-origin errors
                }
              }
            };
          };

          interceptConsole('log', 'log');
          interceptConsole('warn', 'warn');
          interceptConsole('error', 'error');
          interceptConsole('info', 'info');

          (function(){
            function postErr(name, msg, line, col){
              const lineInfo = line ? (' (L' + line + (col ? ', C' + col : '') + ')') : '';
              const text = (name || 'Error') + lineInfo + ': ' + msg;
              if (window.parent && window.parent !== window) {
                try { window.parent.postMessage({ type: 'iframe-error', message: text }, '*'); } catch(_) {}
              }
            }
            function parseLineCol(stack){
              try {
                const m = String(stack || '').match(/frontend\\.js:(\\d+):(\\d+)/);
                if (m) { return { line: parseInt(m[1],10), col: parseInt(m[2],10) }; }
              } catch(_) {}
              return { line: null, col: null };
            }
            let fn;
            try {
              fn = new Function(` + "`" + `
${escapedJs}
//# sourceURL=frontend.js` + "`" + `);
            } catch (e) {
              const { line, col } = parseLineCol(e && e.stack);
              postErr((e && e.name) || 'Syntax Error', (e && e.message) ? e.message : String(e), line, col);
              return;
            }
            try {
              fn();
            } catch (e) {
              const { line, col } = parseLineCol(e && e.stack);
              postErr((e && e.name) || 'Runtime Error', (e && e.message) ? e.message : String(e), line, col);
            }
          })();
        })();
      `;

      const htmlBeforeScript = fullHtml.split('</body>')[0];
      const linesBeforeScript = htmlBeforeScript.split('\n').length;
      const scriptTagLine = 1;
      const totalOffset = linesBeforeScript + scriptTagLine;

      const globalErrorHandler = `
        <script>
          window.addEventListener('error', function(event) {
            if (event.type === 'error') {
              let errorMessage = '';

              const totalInjectedLines = ${totalOffset};
              const lineNo = event.lineno || 0;
              const adjustedLineNo = Math.max(1, lineNo - totalInjectedLines);
              const colNo = event.colno || 0;
              const colInfo = colNo ? ', C' + colNo : '';
              const lineInfo = lineNo > 0 ? ' (L' + adjustedLineNo + colInfo + ')' : '';

              if (event.error && event.error.name === 'SyntaxError') {
                errorMessage = 'Syntax Error' + lineInfo + ': ' + event.error.message;
              } else if (event.message) {
                errorMessage = 'Script Error' + lineInfo + ': ' + event.message;
              } else {
                errorMessage = 'Error' + lineInfo + ': ' + (event.error ? event.error.message : 'Unknown error');
              }

              if (window.parent && window.parent !== window) {
                try {
                  window.parent.postMessage({
                    type: 'iframe-error',
                    message: errorMessage
                  }, '*');
                } catch (e) {
                  // Ignore cross-origin errors
                }
              }
            }
          });

          window.addEventListener('unhandledrejection', function(event) {
            const errorMessage = 'Unhandled Promise Rejection: ' + event.reason;

            if (window.parent && window.parent !== window) {
              try {
                window.parent.postMessage({
                  type: 'iframe-error',
                  message: errorMessage
                }, '*');
              } catch (e) {
                // Ignore cross-origin errors
              }
            }
          });
        </script>
      `;

      fullHtml = fullHtml.replace('</head>', `${globalErrorHandler}</head>`);
      fullHtml = fullHtml.replace('</body>', `<script>${interceptedJs}</script></body>`);
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
      sandbox="allow-scripts allow-same-origin allow-forms"
      allow="none"
      referrerPolicy="no-referrer"
      loading="lazy"
      allowFullScreen={false}
    />
  );
});

PreviewIframe.displayName = 'PreviewIframe';

export default PreviewIframe;
