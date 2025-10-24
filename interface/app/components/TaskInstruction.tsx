"use client";
import React from 'react';
import Markdown from "react-markdown";
import { BsBoxArrowUpRight, BsX } from 'react-icons/bs';

interface TaskInstructionProps {
  taskDescription: string;
  onHide?: () => void;
}

const TaskInstruction: React.FC<TaskInstructionProps> = ({ taskDescription, onHide }) => {
  // Check if content is HTML (starts with <!DOCTYPE or <html)
  const raw = taskDescription || "";
  const trimmed = raw.trim();
  const isHTML = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');

  // If HTML, prepare an iframe document that wraps the raw content and applies
  // a minimal stylesheet (accent is handled by outer container)
  const buildIframeDoc = (html: string) => {
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root { color-scheme: dark; }\n    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    body { background: #20232a; color: #d6dde6; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }\n    .ti-root { max-width: 900px; margin: 0 auto; padding: 12px; }\n    h1 { color:#e6f6ff; border-bottom:2px solid rgba(86,156,214,.5); padding-bottom:6px; margin:0 0 12px 0; font-size:1.8em; }\n    h2 { color:#a3d1ff; margin:20px 0 10px 0; font-size:1.3em; }\n    h3 { color:#ffe082; margin:10px 0 6px 0; font-size:1.1em; }\n    p { margin:6px 0; }\n    ul, ol { margin: 8px 0; padding-left: 20px; }\n    code { background:#1b2130; color:#ffb4a3; padding:2px 6px; border-radius:3px; }\n    pre { background:#1b2130; color:#e6edf3; padding:10px; border-radius:4px; overflow:auto; border-left:3px solid #7fd8c7; margin:8px 0; }\n    img, video, canvas { max-width: 50%; height: auto; display: block; margin: 20px auto; }\n    hr { border: none; border-top: 1px solid rgba(86,156,214,.3); margin: 24px 0; }\n    .endpoint { background:#2f3644; border-left:3px solid #7fd8c7; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:12px; border-radius:4px; margin:10px 0; }\n    .endpoint h3 { color:#9be5d8; margin:0 0 6px 0; }\n    .example { background:#252c3a; border-left:2px solid #ffe082; padding:8px; border-radius:3px; margin:8px 0; }\n    .file-tag { display:inline-block; background:#0e639c; color:#fff; padding:2px 8px; border-radius:3px; font-size:.85em; font-weight:700; margin-right:8px; }\n    .requirement { background:#2f3644; border-left:3px solid #8ac4ff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:10px; border-radius:4px; margin:10px 0; }\n    .requirement h3 { color:#8ac4ff; margin:0 0 12px 0; }\n    .requirement p { margin:0 0 12px 0; }\n    .requirement p:last-of-type { margin-bottom:0; }\n    .requirement pre { margin-top:6px; margin-bottom:0; }\n    .requirement pre code { padding:0; background:transparent; }\n    .text-primary { color:#8ac4ff; font-weight:600; }\n    .text-accent { color:#7fd8c7; font-weight:600; }\n  </style>\n  <base target=\"_blank\" />\n</head>\n<body>\n  <div class=\"ti-root\">${html}</div>\n  <script>\n    // Prevent copy, cut, and paste operations\n    document.addEventListener('copy', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('cut', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('paste', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Prevent selection via keyboard shortcuts\n    document.addEventListener('keydown', function(e) {\n      // Prevent Ctrl+C, Cmd+C, Ctrl+X, Cmd+X, Ctrl+A, Cmd+A\n      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {\n        e.preventDefault();\n        return false;\n      }\n    });\n    // Prevent right-click context menu\n    document.addEventListener('contextmenu', function(e) {\n      e.preventDefault();\n      return false;\n    });\n  </script>\n</body>\n</html>`;
  };

  const handlePopOut = () => {
    if (!isHTML) return;
    
    // Open in new tab (no window features parameter)
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(buildIframeDoc(trimmed));
      newWindow.document.close();
    }
  };

  return (
    <div className="task-instruction">
      <div className="task-instruction-header">
        <h3 style={{ margin: 0 }}>Task Instructions</h3>
        <div style={{ display: 'flex', gap: '0px', alignItems: 'center' }}>
          {isHTML && (
            <button 
              className="open-preview-btn"
              onClick={handlePopOut}
              title="Open task instructions in new tab"
            >
              <BsBoxArrowUpRight className="icon" />
              Pop Out
            </button>
          )}
          {onHide && (
            <button 
              className="hide-btn"
              onClick={onHide}
              title="Hide task instructions"
            >
              <BsX className="icon" />
            </button>
          )}
        </div>
      </div>
      <div className="task-instruction-content">
        {isHTML ? (
          <iframe
            title="Task Instructions"
            srcDoc={buildIframeDoc(trimmed)}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            sandbox="allow-same-origin allow-scripts"
          />
        ) : (
          <Markdown>
            {raw || "No task description available."}
          </Markdown>
        )}
      </div>
    </div>
  );
};

export default TaskInstruction;
