"use client";
import React, { useEffect, useState, useRef } from 'react';
import Markdown from "react-markdown";
import { BsBoxArrowUpRight, BsX } from 'react-icons/bs';
import { Video, List } from 'lucide-react';
import { ENV } from '@/app/config/env';

// Module-level cache that persists across component remounts
const htmlCache = new Map<string, string>();

interface TaskInstructionProps {
  taskDescription?: string;
  requirements?: string[];
  videoDemo?: string;
  instructionsFile?: string;
  onHide?: () => void;
  showHeader?: boolean;
  compact?: boolean;
}

const TaskInstructionNew: React.FC<TaskInstructionProps> = ({ 
  taskDescription, 
  requirements, 
  videoDemo, 
  instructionsFile,
  onHide, 
  showHeader = true,
  compact = false 
}) => {
  // Check if content is HTML (starts with <!DOCTYPE or <html)
  const raw = taskDescription || "";
  const trimmed = raw.trim();
  const isHTML = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');

  // If HTML, prepare an iframe document that wraps the raw content and applies
  // a minimal stylesheet (accent is handled by outer container)
  const buildIframeDoc = (html: string) => {
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root { color-scheme: dark; }\n    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    body { background: #20232a; color: #d6dde6; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }\n    .ti-root { max-width: 900px; margin: 0 auto; padding: 12px; }\n    h1 { color:#e6f6ff; border-bottom:2px solid rgba(86,156,214,.5); padding-bottom:6px; margin:0 0 12px 0; font-size:1.8em; }\n    h2 { color:#a3d1ff; margin:20px 0 10px 0; font-size:1.3em; }\n    h3 { color:#ffe082; margin:10px 0 6px 0; font-size:1.1em; }\n    p { margin:6px 0; }\n    ul, ol { margin: 8px 0; padding-left: 20px; }\n    code { background:#1b2130; color:#ffb4a3; padding:2px 6px; border-radius:3px; }\n    pre { background:#1b2130; color:#e6edf3; padding:10px; border-radius:4px; overflow:auto; border-left:3px solid #7fd8c7; margin:8px 0; }\n    img, video, canvas { max-width: 50%; height: auto; display: block; margin: 20px auto; }\n    hr { border: none; border-top: 1px solid rgba(86,156,214,.3); margin: 24px 0; }\n    .endpoint { background:#2f3644; border-left:3px solid #7fd8c7; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:12px; border-radius:4px; margin:10px 0; }\n    .endpoint h3 { color:#9be5d8; margin:0 0 6px 0; }\n    .example { background:#252c3a; border-left:2px solid #ffe082; padding:8px; border-radius:3px; margin:8px 0; }\n    .file-tag { display:inline-block; background:#0e639c; color:#fff; padding:2px 8px; border-radius:3px; font-size:.85em; font-weight:700; margin-right:8px; }\n    .requirement { background:#2f3644; border-left:3px solid #8ac4ff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:10px; border-radius:4px; margin:10px 0; }\n    .requirement h3 { color:#8ac4ff; margin:0 0 12px 0; }\n    .requirement p { margin:0 0 12px 0; }\n    .requirement p:last-of-type { margin-bottom:0; }\n    .requirement pre { margin-top:6px; margin-bottom:0; }\n    .requirement pre code { padding:0; background:transparent; }\n    .text-primary { color:#8ac4ff; font-weight:600; }\n    .text-accent { color:#7fd8c7; font-weight:600; }\n  </style>\n  <base target=\"_blank\" />\n</head>\n<body>\n  <div class=\"ti-root\">${html}</div>\n  <script>\n    // Prevent copy, cut, and paste operations\n    document.addEventListener('copy', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('cut', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('paste', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Prevent selection via keyboard shortcuts\n    document.addEventListener('keydown', function(e) {\n      // Prevent Ctrl+C, Cmd+C, Ctrl+X, Cmd+X, Ctrl+A, Cmd+A\n      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {\n        e.preventDefault();\n        return false;\n      }\n    });\n    // Prevent right-click context menu\n    document.addEventListener('contextmenu', function(e) {\n      e.preventDefault();\n      return false;\n    });\n  </script>\n</body>\n</html>`;
  };

  // Resolve instructions file path (repo-relative or absolute) to a URL we can load in an iframe
  const computeInstructionsUrl = (): string | null => {
    const pathOrUrl = instructionsFile || '';
    const desc = taskDescription || '';
    const candidate = pathOrUrl || desc;
    if (!candidate) return null;

    // If it's already an absolute URL, use as-is
    if (/^https?:\/\//i.test(candidate)) return candidate;

    // If it's likely a repo-relative path to an html file, load via backend /assets
    const looksLikeRepoPath = candidate.startsWith('data/') || candidate.startsWith('/data/');
    const isHtmlPath = candidate.toLowerCase().endsWith('.html');
    if (looksLikeRepoPath && isHtmlPath) {
      const cleanBase = (ENV.BACKEND_URL || '').replace(/\/$/, '');
      const cleanPath = candidate.replace(/^\//, '');
      return `${cleanBase}/assets/${cleanPath}`;
    }

    return null;
  };

  const instructionsUrl = computeInstructionsUrl();

  // Fetch HTML content when we have a URL so we can inject via srcDoc
  // Initialize state from cache if available to prevent loading flash
  const initialHtml = instructionsUrl ? htmlCache.get(instructionsUrl) || null : null;
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(initialHtml);
  const [isLoadingHtml, setIsLoadingHtml] = useState<boolean>(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    if (!instructionsUrl) {
      setFetchedHtml(null);
      setHtmlError(null);
      setIsLoadingHtml(false);
      return;
    }
    
    // Check cache first - synchronously
    const cached = htmlCache.get(instructionsUrl);
    if (cached) {
      // Only update if different to avoid unnecessary re-renders
      if (fetchedHtml !== cached) {
        setFetchedHtml(cached);
      }
      setIsLoadingHtml(false);
      setHtmlError(null);
      return;
    }
    
    // Only fetch if not in cache
    setFetchedHtml(null);
    setHtmlError(null);
    setIsLoadingHtml(true);
    fetch(instructionsUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!abort) {
          // Cache the fetched HTML
          htmlCache.set(instructionsUrl, text);
          setFetchedHtml(text);
        }
      })
      .catch((err) => {
        if (!abort) setHtmlError(String(err?.message || err));
      })
      .finally(() => {
        if (!abort) setIsLoadingHtml(false);
      });
    return () => {
      abort = true;
    };
  }, [instructionsUrl]);

  const handlePopOut = () => {
    if (!isHTML) return;
    
    // Open in new tab (no window features parameter)
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(buildIframeDoc(trimmed));
      newWindow.document.close();
    }
  };

  // If we have an instructions file, prioritize that
  const contentToRender = instructionsFile || taskDescription;

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 w-full min-w-0 flex flex-col h-full">
      {showHeader && (
        <div className="bg-gray-800/30 border-b border-gray-700/50 px-4 py-3 flex justify-between items-center">
          <h3 className="text-base font-medium text-white m-0">Task Instructions</h3>
          <div className="flex gap-0 items-center">
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
      )}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        {/* Video Demo Section */}
        {videoDemo && !compact && (
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Video className="h-4 w-4 text-blue-400" />
              <h4 className="text-sm font-medium text-gray-200">Video Demo</h4>
            </div>
            <div className="relative bg-gray-700 overflow-hidden">
              <video 
                className="w-full aspect-video object-cover"
                controls
                preload="metadata"
                muted
                disablePictureInPicture
              >
                <source src={videoDemo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        )}

        {/* Requirements Section */}
        {requirements && requirements.length > 0 && !compact && (
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <List className="h-4 w-4 text-green-400" />
              <h4 className="text-sm font-medium text-gray-200">Requirements</h4>
            </div>
            <div className="space-y-2">
              {requirements.map((requirement, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <div className="flex-shrink-0 w-1.5 h-1.5 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-300 leading-relaxed">{requirement}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content */}
        {contentToRender ? (
          instructionsUrl ? (
            fetchedHtml != null ? (
              <iframe
                key={instructionsUrl}
                title="Task Instructions"
                srcDoc={buildIframeDoc(fetchedHtml)}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                sandbox="allow-same-origin allow-scripts"
              />
            ) : (
              <div className="text-gray-400 text-sm">
                {htmlError ? `Failed to load instructions: ${htmlError}` : 'Loading instructions...'}
              </div>
            )
          ) : isHTML ? (
            <iframe
              key={`html-${trimmed.substring(0, 100)}`}
              title="Task Instructions"
              srcDoc={buildIframeDoc(trimmed)}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              sandbox="allow-same-origin allow-scripts"
            />
          ) : (
            <Markdown>
              {contentToRender || "No task description available."}
            </Markdown>
          )
        ) : (
          <div className="text-gray-400 text-sm">
            No task instructions available.
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskInstructionNew;
