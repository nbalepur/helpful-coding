"use client";
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { ENV } from '../config/env';

interface PreviewIframeProps {
  htmlContent?: string;
  cssContent?: string;
  jsContent?: string;
  className?: string;
  onConsoleLog?: (message: string | any[], level?: string, source?: string) => void;
  backendCode?: string;
  backendPort?: number | null;
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
    .replace(/top\./gi, '') // Remove top references
};

// Function to prepend the callAPI function definition to the frontend code
const prependCallAPI = (js: string, backendPort: number | null, backendCode: string = ''): { code: string; injectedLines: number } => {
  let callAPIDefinition;
  
  if (!backendPort) {
    // If no backend port, provide a mock implementation
    callAPIDefinition = `function callAPI(endpoint, args = {}) {
  return {
    result: null,
    error: 'Backend server not connected'
  };
}`;
  } else {
    // If backend is available, provide the real implementation
    callAPIDefinition = `function callAPI(endpoint, args = {}) {
  // SECURITY: This is the ONLY allowed network access
  // CSP restricts all other network requests to this endpoint only
  const xhr = new XMLHttpRequest();
  const url = '${ENV.EXECUTE_ENDPOINT_URL}';
  
  xhr.open('POST', url, false); // false = synchronous
  xhr.setRequestHeader('Content-Type', 'application/json');
  
  const requestData = {
    endpoint: endpoint,
    args: args,
    pythonCode: \`${backendCode.replace(/`/g, '\\`')}\`
  };
  
  try {
    xhr.send(JSON.stringify(requestData));
    
    if (xhr.status >= 200 && xhr.status < 300) {
      const data = JSON.parse(xhr.responseText);
      
      // Return consistent format with success, data, and error fields
      if (data.error) {
        return { success: false, data: null, error: data.error };
      }
      return { success: true, data: data.result, error: null };
    } else {
      // Try to get detailed error from response body
      let errorMsg = \`HTTP \${xhr.status}: \${xhr.statusText}\`;
      try {
        const errorData = JSON.parse(xhr.responseText);
        if (errorData.error) {
          errorMsg = errorData.error;
        }
      } catch (e) {
        // If parsing fails, use the default error message
      }
      return { success: false, data: null, error: errorMsg };
    }
  } catch (error) {
    const errorMsg = 'Backend server not available';
    return { success: false, data: null, error: errorMsg };
  }
}`;
  }
  
  // Calculate the actual number of lines we're injecting within the JS code itself
  const errorHandlerCode = `
// Note: Line number adjustment happens in the global error handler
// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
});
`;

  // Prepend the callAPI function definition and error handling
  const finalCode = callAPIDefinition + '\n\n' + errorHandlerCode + '\n\n' + js;
  const injectedLines = callAPIDefinition.split('\n').length + errorHandlerCode.split('\n').length + 4; // +4 for blank lines
  
  return { code: finalCode, injectedLines };
};

const PreviewIframe = forwardRef<PreviewIframeRef, PreviewIframeProps>(({ 
  htmlContent = '', 
  cssContent = '', 
  jsContent = '', 
  className = '',
  onConsoleLog,
  backendCode = '',
  backendPort = null
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
      // Configure API base URL - extract hostname from ENV.BACKEND_URL and use custom port
      const backendUrl = new URL(ENV.BACKEND_URL);
      const port = backendPort || ENV.DEFAULT_BACKEND_PORT;
      const apiBaseUrl = `${backendUrl.protocol}//${backendUrl.hostname}:${port}`;
      
      // Build callAPI definition (same behavior as prependCallAPI)
      const callAPICode = (() => {
        if (!backendPort) {
          return `function callAPI(endpoint, args = {}) {\n  return {\n    result: null,\n    error: 'Backend server not connected'\n  };\n}`;
        } else {
          return `function callAPI(endpoint, args = {}) {\n  // SECURITY: This is the ONLY allowed network access\n  // CSP restricts all other network requests to this endpoint only\n  const xhr = new XMLHttpRequest();\n  const url = '${ENV.EXECUTE_ENDPOINT_URL}';\n  \n  xhr.open('POST', url, false); // false = synchronous\n  xhr.setRequestHeader('Content-Type', 'application/json');\n  \n  const requestData = {\n    endpoint: endpoint,\n    args: args,\n    pythonCode: \`${backendCode.replace(/`/g, '\\`')}\`\n  };\n  \n  try {\n    xhr.send(JSON.stringify(requestData));\n    \n    if (xhr.status >= 200 && xhr.status < 300) {\n      const data = JSON.parse(xhr.responseText);\n      \n      if (data.error) {\n        return { success: false, data: null, error: data.error };\n      }\n      return { success: true, data: data.result, error: null };\n    } else {\n      let errorMsg = \`HTTP ${'${'}xhr.status${'}'}: ${'${'}xhr.statusText${'}'}\`;\n      try {\n        const errorData = JSON.parse(xhr.responseText);\n        if (errorData.error) {\n          errorMsg = errorData.error;\n        }\n      } catch (e) {}\n      return { success: false, data: null, error: errorMsg };\n    }\n  } catch (error) {\n    const errorMsg = 'Backend server not available';\n    return { success: false, data: null, error: errorMsg };\n  }\n}`;
        }
      })();

      // Wrap the JavaScript with console interception and API setup
      const interceptedJs = `
        (function() {
          // Configure API base URL
          window.API_BASE_URL = '${apiBaseUrl}';
          
          // Store original console methods
          const originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
          };
          
          // Simple console interception - just pass through to parent
          const interceptConsole = (method, type) => {
            console[method] = function(...args) {
              // Always call original method first
              originalConsole[method].apply(console, args);
              
              // Send to parent window
              if (window.parent && window.parent !== window) {
                try {
                  window.parent.postMessage({
                    type: 'console-log',
                    level: type,
                    args: args
                  }, '*');
                } catch (e) {
                  // Ignore cross-origin errors
                }
              }
            };
          };
          
          // Intercept all console methods
          interceptConsole('log', 'log');
          interceptConsole('warn', 'warn');
          interceptConsole('error', 'error');
          interceptConsole('info', 'info');
          
          // Define callAPI in the global scope
          ${callAPICode}

          // Execute user JavaScript via Function to get clean sourceURL-based stack traces
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
              fn = new Function(` + "`" + `\n${processedJs.replace(/`/g, '\\`')}\n//# sourceURL=frontend.js` + "`" + `);
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
      
      // Calculate total offset: count all lines that will appear before user's JS code
      // This includes: HTML structure + CSS + this script tag opening + console wrapper + prepended JS
      const htmlBeforeScript = fullHtml.split('</body>')[0];
      const linesBeforeScript = htmlBeforeScript.split('\n').length;
      const scriptTagLine = 1; // The <script> tag itself
      const totalOffset = linesBeforeScript + scriptTagLine; // Only account for HTML and tag; syntax errors use sourceURL parsing above
      
      // Add a global error handler that runs immediately with accurate line calculation
      const globalErrorHandler = `
        <script>
          // Global error handler that runs immediately to catch syntax errors
          window.addEventListener('error', function(event) {
            // Check if this is a syntax error or script error
            if (event.type === 'error') {
              let errorMessage = '';
              
              // Calculate line number adjustment (all lines injected before user's JS)
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
              
              
              // Send to parent window
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
          
          // Handle unhandled promise rejections
          window.addEventListener('unhandledrejection', function(event) {
            const errorMessage = \`Unhandled Promise Rejection: \${event.reason}\`;
            
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
