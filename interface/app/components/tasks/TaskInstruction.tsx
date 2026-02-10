"use client";
import React, { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { BsBoxArrowUpRight, BsX } from "react-icons/bs";
import { Video, List } from "lucide-react";
import { ENV } from "@/app/config/env";
import { useIframeTheme } from "@/app/context/IframeThemeContext";
import { buildStructuredContent } from "./instructionContent";
import { isFunctionCodingTaskLabel, isTutorialTaskLabel } from "@/app/utils/taskLabels";

// Module-level cache that persists across component remounts
const htmlCache = new Map<string, string>();

interface TaskInstructionProps {
  taskDescription?: string;
  requirements?: string[];
  videoDemo?: string;
  instructionsFile?: string;
  example?: string;
  taskName?: string;
  taskLabel?: string;
  onHide?: () => void;
  showHeader?: boolean;
  compact?: boolean;
}

const TaskInstruction: React.FC<TaskInstructionProps> = ({ 
  taskDescription, 
  requirements, 
  videoDemo, 
  instructionsFile,
  example,
  taskName,
  taskLabel,
  onHide, 
  showHeader = true,
  compact = false 
}) => {
  const { isLightMode, toggleLightMode } = useIframeTheme();
  
  // Listen for postMessage from iframe to toggle theme
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'toggleIframeTheme') {
        toggleLightMode();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [toggleLightMode]);
  
  // Check if content is HTML (starts with <!DOCTYPE, <html, or HTML tags like <p>, <div>, etc.)
  const raw = taskDescription || "";
  const trimmed = raw.trim();
  const isHTML = trimmed.startsWith('<!DOCTYPE') || 
                 trimmed.startsWith('<html') || 
                 /^<[a-z][\s\S]*>/.test(trimmed); // Check if starts with HTML tag

  // Extract content from HTML, handling various formats
  const extractDescriptionContent = (html: string): string => {
    // If it's a full HTML document, extract body content
    if (html.includes('<body>')) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch && bodyMatch[1]) {
        let content = bodyMatch[1];
        // Remove wrapper divs but keep the actual content
        content = content.replace(/<div[^>]*class="ti-root"[^>]*>|<\/div>/gi, '').trim();
        if (content) return content;
      }
    }
    
    // If it's wrapped in HTML document tags, try to extract
    if (html.includes('<!DOCTYPE') || html.includes('<html')) {
      // Remove HTML structure but keep content
      let content = html
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<html[^>]*>|<\/html>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<body[^>]*>|<\/body>/gi, '')
        .replace(/<div[^>]*class="ti-root"[^>]*>|<\/div>/gi, '')
        .trim();
      if (content) return content;
    }
    
    // Otherwise, return as-is (HTML fragments like <p>...</p> are fine as-is)
    return html.trim();
  };

  // If HTML, prepare an iframe document that wraps the raw content and applies
  // a minimal stylesheet (accent is handled by outer container)
  const buildIframeDoc = (html: string, useStructured: boolean = false) => {
    let content = html;
    
    if (useStructured) {
      const descriptionContent = extractDescriptionContent(html);
      content = buildStructuredContent({
        descriptionHtml: descriptionContent,
        exampleHtml: example,
        label: taskLabel,
        taskName,
        lightMode: isLightMode,
      });
    }
    
    // Use lowercase for image path - tutorial has name "Tutorial" but file is tutorial.png
    // write_function and debug_function tasks use python.png
    const imageName =
      isFunctionCodingTaskLabel(taskLabel)
        ? 'python'
        : isTutorialTaskLabel(taskLabel)
          ? 'tutorial'
          : taskName;
    const taskImagePath = imageName ? `/task_images/${imageName}.png` : undefined;
    const sunIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
    const moonIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    const toggleButton = `<button id="theme-toggle" style="position: absolute; top: 6px; ${taskImagePath ? 'right: 48px;' : 'right: 6px;'} width: 36px; height: 36px; border-radius: 4px; border: 1px solid rgba(107, 114, 128, 0.3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); z-index: 1000; background: ${isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 24, 39, 0.9)'}; cursor: pointer; display: flex; align-items: center; justify-content: center; color: ${isLightMode ? '#1f2937' : '#d1d5db'}; transition: all 0.2s;" title="${isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}">${isLightMode ? sunIcon : moonIcon}</button>`;
    
    // Light mode styles
    if (isLightMode) {
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root { color-scheme: light; }\n    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; overflow-y: auto; }\n    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    /* Thin scrollbar styling */\n    ::-webkit-scrollbar { width: 4px; }\n    ::-webkit-scrollbar-track { background: transparent; }\n    ::-webkit-scrollbar-thumb { background: rgba(107, 114, 128, 0.4); border-radius: 2px; }\n    ::-webkit-scrollbar-thumb:hover { background: rgba(107, 114, 128, 0.6); }\n    /* Firefox scrollbar styling */\n    * { scrollbar-width: thin; scrollbar-color: rgba(107, 114, 128, 0.4) transparent; }\n    body { background: #ffffff; color: #1f2937; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }\n    .ti-root { max-width: 900px; margin: 0 auto; padding: 12px; position: relative; }\n    h1 { color:#111827; border-bottom:2px solid rgba(37,99,235,.4); padding-bottom:6px; margin:0 0 12px 0; font-size:1.8em; }\n    h2 { color:#2563eb; margin:24px 0 8px 0; font-size:1.3em; }\n    h3 { color:#d97706; margin:10px 0 6px 0; font-size:1.1em; }\n    p { margin:6px 0; color: #1f2937; }\n    ul, ol { margin: 8px 0; padding-left: 20px; color: #1f2937; }\n    li { color: #1f2937; }\n    code { background:#f3f4f6; color:#dc2626; padding:2px 6px; border-radius:3px; }\n    pre { background:#f3f4f6; color:#111827; padding:10px; border-radius:4px; overflow:auto; border-left:3px solid #059669; margin:8px 0; }\n    img, video, canvas { max-width: 50%; height: auto; display: block; margin: 20px auto; }\n    hr { border: none; border-top: 1px solid rgba(37,99,235,.3); margin: 24px 0; }\n    .endpoint { background:#f9fafb; border-left:3px solid #059669; box-shadow: inset 0 0 0 1px rgba(0,0,0,.05); padding:12px; border-radius:4px; margin:10px 0; }\n    .endpoint h3 { color:#047857; margin:0 0 6px 0; }\n    .example { background:#fef3c7; border-left:2px solid #d97706; padding:8px; border-radius:3px; margin:8px 0; color: #1f2937; }\n    .file-tag { display:inline-block; background:#16a34a; color:#fff; padding:2px 8px; border-radius:0; font-size:.85em; font-weight:700; margin-right:8px; }\n    .requirement { background:#f9fafb; border-left:3px solid #2563eb; box-shadow: inset 0 0 0 1px rgba(0,0,0,.05); padding:10px; border-radius:4px; margin:10px 0; }\n    .requirement h3 { color:#2563eb; margin:0 0 12px 0; }\n    .requirement p { margin:0 0 12px 0; color: #1f2937; }\n    .requirement p:last-of-type { margin-bottom:0; }\n    .requirement pre { margin-top:6px; margin-bottom:0; }\n    .requirement pre code { padding:0; background:transparent; }\n    .text-primary { color:#2563eb; font-weight:600; }\n    .text-accent { color:#059669; font-weight:600; }\n    em { color: #4b5563; font-style: italic; }\n    a { color: #1e40af; text-decoration: underline; cursor: pointer; }\n    a:hover { color: #2563eb; }\n    strong { color: #111827; }\n    #theme-toggle:hover { background: ${isLightMode ? 'rgba(243, 244, 246, 1)' : 'rgba(31, 41, 55, 1)'} !important; }\n  </style>\n  <base target=\"_blank\" />\n</head>\n<body>\n  <div class=\"ti-root\">${toggleButton}${taskImagePath ? `<div style="position: absolute; top: 6px; right: 6px; width: 36px; height: 36px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(107, 114, 128, 0.3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); z-index: 1000; background: rgba(255, 255, 255, 0.95); pointer-events: none; display: flex; align-items: center; justify-content: center;"><img src="${taskImagePath}" alt="Task preview" style="width: 100%; height: 100%; object-fit: cover; display: block; margin: 0; padding: 0; min-width: 100%; min-height: 100%;" onerror="this.parentElement.style.display='none';" /></div>` : ''}${content}</div>\n  <script>\n    // Theme toggle button handler\n    document.getElementById('theme-toggle')?.addEventListener('click', function(e) {\n      e.preventDefault();\n      e.stopPropagation();\n      if (window.parent) {\n        window.parent.postMessage({ type: 'toggleIframeTheme' }, '*');\n      }\n    });\n    // Prevent copy, cut, and paste operations\n    document.addEventListener('copy', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('cut', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('paste', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Prevent selection via keyboard shortcuts\n    document.addEventListener('keydown', function(e) {\n      // Prevent Ctrl+C, Cmd+C, Ctrl+X, Cmd+X, Ctrl+A, Cmd+A\n      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {\n        e.preventDefault();\n        return false;\n      }\n    });\n    // Prevent right-click context menu\n    document.addEventListener('contextmenu', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Handle link clicks to open in new window\n    document.addEventListener('click', function(e) {\n      const link = e.target.closest('a');\n      if (link && link.href) {\n        e.preventDefault();\n        window.open(link.href, '_blank', 'noopener,noreferrer');\n        return false;\n      }\n    }, true);\n  </script>\n</body>\n</html>`;
    }
    
    // Dark mode styles (original)
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root { color-scheme: dark; }\n    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; overflow-y: auto; }\n    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    /* Thin scrollbar styling */\n    ::-webkit-scrollbar { width: 4px; }\n    ::-webkit-scrollbar-track { background: transparent; }\n    ::-webkit-scrollbar-thumb { background: rgba(107, 114, 128, 0.5); border-radius: 2px; }\n    ::-webkit-scrollbar-thumb:hover { background: rgba(107, 114, 128, 0.7); }\n    /* Firefox scrollbar styling */\n    * { scrollbar-width: thin; scrollbar-color: rgba(107, 114, 128, 0.5) transparent; }\n    body { background: transparent; color: #d6dde6; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }\n    .ti-root { max-width: 900px; margin: 0 auto; padding: 12px; position: relative; }\n    h1 { color:#e6f6ff; border-bottom:2px solid rgba(86,156,214,.5); padding-bottom:6px; margin:0 0 12px 0; font-size:1.8em; }\n    h2 { color:#8ac4ff; margin:24px 0 8px 0; font-size:1.3em; }\n    h3 { color:#ffe082; margin:10px 0 6px 0; font-size:1.1em; }\n    p { margin:6px 0; }\n    ul, ol { margin: 8px 0; padding-left: 20px; }\n    code { background:#1b2130; color:#ffb4a3; padding:2px 6px; border-radius:3px; }\n    pre { background:#1b2130; color:#e6edf3; padding:10px; border-radius:4px; overflow:auto; border-left:3px solid #7fd8c7; margin:8px 0; }\n    img, video, canvas { max-width: 50%; height: auto; display: block; margin: 20px auto; }\n    hr { border: none; border-top: 1px solid rgba(86,156,214,.3); margin: 24px 0; }\n    .endpoint { background:#2f3644; border-left:3px solid #7fd8c7; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:12px; border-radius:4px; margin:10px 0; }\n    .endpoint h3 { color:#9be5d8; margin:0 0 6px 0; }\n    .example { background:#252c3a; border-left:2px solid #ffe082; padding:8px; border-radius:3px; margin:8px 0; }\n    .file-tag { display:inline-block; background:#22c55e; color:#fff; padding:2px 8px; border-radius:0; font-size:.85em; font-weight:700; margin-right:8px; }\n    .requirement { background:#2f3644; border-left:3px solid #8ac4ff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:10px; border-radius:4px; margin:10px 0; }\n    .requirement h3 { color:#8ac4ff; margin:0 0 12px 0; }\n    .requirement p { margin:0 0 12px 0; }\n    .requirement p:last-of-type { margin-bottom:0; }\n    .requirement pre { margin-top:6px; margin-bottom:0; }\n    .requirement pre code { padding:0; background:transparent; }\n    .text-primary { color:#8ac4ff; font-weight:600; }\n    .text-accent { color:#7fd8c7; font-weight:600; }\n    em { color: #94a3b8; font-style: italic; }\n    a { color: #ffffff; text-decoration: underline; cursor: pointer; }\n    a:hover { color: #8ac4ff; }\n    #theme-toggle:hover { background: ${isLightMode ? 'rgba(243, 244, 246, 1)' : 'rgba(31, 41, 55, 1)'} !important; }\n  </style>\n  <base target=\"_blank\" />\n</head>\n<body>\n  <div class=\"ti-root\">${toggleButton}${taskImagePath ? `<div style="position: absolute; top: 6px; right: 6px; width: 36px; height: 36px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(107, 114, 128, 0.3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); z-index: 1000; background: rgba(17, 24, 39, 0.9); pointer-events: none; display: flex; align-items: center; justify-content: center;"><img src="${taskImagePath}" alt="Task preview" style="width: 100%; height: 100%; object-fit: cover; display: block; margin: 0; padding: 0; min-width: 100%; min-height: 100%;" onerror="this.parentElement.style.display='none';" /></div>` : ''}${content}</div>\n  <script>\n    // Theme toggle button handler\n    document.getElementById('theme-toggle')?.addEventListener('click', function(e) {\n      e.preventDefault();\n      e.stopPropagation();\n      if (window.parent) {\n        window.parent.postMessage({ type: 'toggleIframeTheme' }, '*');\n      }\n    });\n    // Prevent copy, cut, and paste operations\n    document.addEventListener('copy', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('cut', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('paste', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Prevent selection via keyboard shortcuts\n    document.addEventListener('keydown', function(e) {\n      // Prevent Ctrl+C, Cmd+C, Ctrl+X, Cmd+X, Ctrl+A, Cmd+A\n      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {\n        e.preventDefault();\n        return false;\n      }\n    });\n    // Prevent right-click context menu\n    document.addEventListener('contextmenu', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Handle link clicks to open in new window\n    document.addEventListener('click', function(e) {\n      const link = e.target.closest('a');\n      if (link && link.href) {\n        e.preventDefault();\n        window.open(link.href, '_blank', 'noopener,noreferrer');\n        return false;\n      }\n    }, true);\n  </script>\n</body>\n</html>`;
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

  const contentToRender = instructionsFile || taskDescription;

  const headerActions = [
    {
      show: isHTML,
      className: "open-preview-btn",
      onClick: handlePopOut,
      title: "Open task instructions in new tab",
      icon: BsBoxArrowUpRight,
      label: "Pop Out",
    },
    {
      show: !!onHide,
      className: "hide-btn",
      onClick: onHide ?? (() => {}),
      title: "Hide task instructions",
      icon: BsX,
      label: null as string | null,
    },
  ].filter((a) => a.show);

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 w-full min-w-0 flex flex-col h-full">
      {showHeader && (
        <div className="bg-gray-800/30 border-b border-gray-700/50 px-4 py-3 flex justify-between items-center">
          <h3 className="text-base font-medium text-white m-0">Task Instructions</h3>
          <div className="flex gap-0 items-center">
            {headerActions.map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={i}
                  className={action.className}
                  onClick={action.onClick}
                  title={action.title}
                >
                  <Icon className="icon" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden ${contentToRender && (instructionsUrl || taskDescription) ? '' : 'p-3'}`}>
        {/* Video Demo Section */}
        {videoDemo && !compact && (
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Video className="h-4 w-4 text-blue-400" />
              <h4 className="text-sm font-medium text-gray-200">Video Demo</h4>
            </div>
            <div className="relative bg-gray-700 overflow-hidden">
              <video 
                className="w-full h-auto"
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
                key={`${instructionsUrl}-${isLightMode}`}
                title="Task Instructions"
                srcDoc={buildIframeDoc(fetchedHtml, true)}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <div className="text-gray-400 text-sm">
                {htmlError ? `Failed to load instructions: ${htmlError}` : 'Loading instructions...'}
              </div>
            )
          ) : taskDescription ? (
            // Always use structured format when we have a task description
            <iframe
              key={`structured-${trimmed.substring(0, 100)}-${isLightMode}`}
              title="Task Instructions"
              srcDoc={buildIframeDoc(trimmed, true)}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
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

export default TaskInstruction;
