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
  example?: string;
  taskName?: string;
  taskLabel?: string;
  onHide?: () => void;
  showHeader?: boolean;
  compact?: boolean;
}

const TaskInstructionNew: React.FC<TaskInstructionProps> = ({ 
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
  // Check if content is HTML (starts with <!DOCTYPE, <html, or HTML tags like <p>, <div>, etc.)
  const raw = taskDescription || "";
  const trimmed = raw.trim();
  const isHTML = trimmed.startsWith('<!DOCTYPE') || 
                 trimmed.startsWith('<html') || 
                 /^<[a-z][\s\S]*>/.test(trimmed); // Check if starts with HTML tag

  // Build structured HTML content with the new format
  const buildStructuredContent = (descriptionHtml: string, exampleHtml?: string, label?: string, taskNameParam?: string) => {
    const generalDescription = `
      <p style="margin: 12px 0; color: #d6dde6;">This interface provides you with everything you need to build your project. On the right side, you'll find the coding editor with an AI assistant that can help you implement features. There's also a preview tab where you can see your work in real-time as you code.</p>
      
      <p style="margin: 12px 0; color: #d6dde6;">To interact with the AI assistant, use the AI assistant tab to prompt it with your requests. The assistant will execute your request and show you a diff editor where you can review the proposed changes before accepting or rejecting them. After making changes, the assistant will suggest follow-up actions that you can optionally choose from to continue building your project.</p>
      
      <p style="margin: 12px 0; color: #d6dde6;">Once you're personally satisfied with your work, you can make a submission. Before submitting, you'll need to answer some questions about your project.</p>
    `;
    let taskDescription = descriptionHtml || '<p>No task description available.</p>';
    
    // For replication tasks, prepend the prefix to the description
    if (label === 'replication' && taskNameParam) {
      const prefix = '';
      const trimmedDesc = taskDescription.trim();
      taskDescription = trimmedDesc;
    }
    
    
    // Task type indicator
    let taskTypeInfo = '';
    if (label === 'replication') {
      taskTypeInfo = '<p style="margin: 0 0 12px 0; color: #d6dde6;">This is a <span style="color: #8ac4ff; font-weight: 600;">replication</span> task. You should try to recreate the game closely with some elements of personal flair.</p>';
    } else if (label === 'open-ended') {
      taskTypeInfo = '<p style="margin: 0 0 12px 0; color: #d6dde6;">This is an <span style="color: #8ac4ff; font-weight: 600;">open-ended</span> task. You have more freedom to create your own interpretation and design.</p>';
    }
    
    // Split examples by newline and create individual example divs
    let examples = '<p><em>[Examples to be filled in]</em></p>';
    if (exampleHtml) {
      const exampleLines = exampleHtml.split('\n').filter(line => line.trim() !== '');
      if (exampleLines.length > 0) {
        examples = exampleLines.map(line => `<div class="example">${line.trim()}</div>`).join('');
      }
    }
    
    const judgmentCriteria = `
      <p style="margin: 6px 0; color: #d6dde6;">Your submission will be evaluated by other users through voting. They will rate your work on the following criteria, each on a scale from 1 (needs work) to 5 (outstanding):</p>
      
      <ul style="margin: 12px 0; padding-left: 20px;">
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">Task Fulfillment:</strong> How well the interface adheres to the task requirements.</li>
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">Style:</strong> Quality of the visual design: layout, colors, typography, and polish.</li>
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">Enjoyment:</strong> How engaging and satisfying it feels to interact with the UI.</li>
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">Creativity:</strong> Original touches or mechanics that make the UI stand out.</li>
      </ul>
      
      <p style="margin: 6px 0; color: #d6dde6;">After the voting period, your code may go under expert review for additional evaluation.</p>
    `;
    const notes = `
      <p style="margin: 12px 0; color: #d6dde6;">Since you can only use raw HTML, CSS, and JavaScript, your UI will have some restrictions. These are not things that definitely won't work, but rather things you might have trouble trying to do:</p>
      
      <ul style="margin: 12px 0; padding-left: 20px;">
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">No External Libraries:</strong> You cannot use npm packages, CDN imports, or any external JavaScript frameworks (React, Vue, Angular, etc.). Only native browser APIs and vanilla JavaScript are available.</li>
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">No Build Tools:</strong> There are no compilers, bundlers, or transpilers available. You must write code that runs directly in the browser without preprocessing.</li>
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">No Backend Code:</strong> You cannot write server-side code or connect to databases. All logic must run client-side in the browser.</li>
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">Imports and Assets:</strong> Using imports or including external assets (images, fonts, etc.) might not work, but could. Since you cannot upload files, you'll need to use data URIs, external URLs, or create assets programmatically with CSS/Canvas. For custom SVG image assets, we recommend using <a href="https://www.svgrepo.com/" target="_blank" style="color: #8ac4ff;">SVGRepo</a>.</li>
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">Persistent Storage:</strong> Browser storage options like localStorage and sessionStorage are available, but they are limited and tied to the browser session. There is no backend storage available.</li>
        <li style="margin: 6px 0; color: #d6dde6;"><strong style="color: #ffffff;">CORS Restrictions:</strong> Fetching data from external APIs may be blocked by browser CORS policies. You can only reliably use publicly accessible APIs that allow cross-origin requests.</li>
      </ul>
      
      <p style="margin: 12px 0; color: #d6dde6;">⚠️ You will not receive compensation if you are found to submit offensive text or content.</p>
    `;

    // Only include examples section if there are actual examples
    const examplesSection = exampleHtml ? `
      <h2>Examples</h2>
      <p style="margin: 0 0 12px 0; color: #ffffff;">Here are some examples you can draw inspiration from. Note that these are professional games, so they will likely be more polished than what you create, but they can serve as good reference points.</p>
      ${examples}
    ` : '';

    return `
      <h2>Task Description</h2>
      ${taskTypeInfo}
      ${taskDescription}
      
      ${examplesSection}
      
      <hr />
      
      <p style="margin: 12px 0; color: #d6dde6;">Below is an abridged version of the instructions for coding with the AI assistant, but more information can be found on the <a href="/about">about page</a>.</p>
      
      <h2>Getting Started</h2>
      ${generalDescription}
      
      <h2>Judgment Criteria</h2>
      ${judgmentCriteria}
      
      <h2>Restrictions</h2>
      ${notes}
    `;
  };

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
    
    // If we should use structured format
    if (useStructured) {
      const descriptionContent = extractDescriptionContent(html);
      content = buildStructuredContent(descriptionContent, example, taskLabel, taskName);
    }
    
    const taskImagePath = taskName ? `/task_images/${taskName}.png` : undefined;
    
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root { color-scheme: dark; }\n    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; overflow-y: auto; }\n    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    /* Thin scrollbar styling */\n    ::-webkit-scrollbar { width: 4px; }\n    ::-webkit-scrollbar-track { background: transparent; }\n    ::-webkit-scrollbar-thumb { background: rgba(107, 114, 128, 0.5); border-radius: 2px; }\n    ::-webkit-scrollbar-thumb:hover { background: rgba(107, 114, 128, 0.7); }\n    /* Firefox scrollbar styling */\n    * { scrollbar-width: thin; scrollbar-color: rgba(107, 114, 128, 0.5) transparent; }\n    body { background: transparent; color: #d6dde6; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }\n    .ti-root { max-width: 900px; margin: 0 auto; padding: 12px; position: relative; }\n    h1 { color:#e6f6ff; border-bottom:2px solid rgba(86,156,214,.5); padding-bottom:6px; margin:0 0 12px 0; font-size:1.8em; }\n    h2 { color:#8ac4ff; margin:24px 0 8px 0; font-size:1.3em; }\n    h3 { color:#ffe082; margin:10px 0 6px 0; font-size:1.1em; }\n    p { margin:6px 0; }\n    ul, ol { margin: 8px 0; padding-left: 20px; }\n    code { background:#1b2130; color:#ffb4a3; padding:2px 6px; border-radius:3px; }\n    pre { background:#1b2130; color:#e6edf3; padding:10px; border-radius:4px; overflow:auto; border-left:3px solid #7fd8c7; margin:8px 0; }\n    img, video, canvas { max-width: 50%; height: auto; display: block; margin: 20px auto; }\n    hr { border: none; border-top: 1px solid rgba(86,156,214,.3); margin: 24px 0; }\n    .endpoint { background:#2f3644; border-left:3px solid #7fd8c7; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:12px; border-radius:4px; margin:10px 0; }\n    .endpoint h3 { color:#9be5d8; margin:0 0 6px 0; }\n    .example { background:#252c3a; border-left:2px solid #ffe082; padding:8px; border-radius:3px; margin:8px 0; }\n    .file-tag { display:inline-block; background:#22c55e; color:#fff; padding:2px 8px; border-radius:0; font-size:.85em; font-weight:700; margin-right:8px; }\n    .requirement { background:#2f3644; border-left:3px solid #8ac4ff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:10px; border-radius:4px; margin:10px 0; }\n    .requirement h3 { color:#8ac4ff; margin:0 0 12px 0; }\n    .requirement p { margin:0 0 12px 0; }\n    .requirement p:last-of-type { margin-bottom:0; }\n    .requirement pre { margin-top:6px; margin-bottom:0; }\n    .requirement pre code { padding:0; background:transparent; }\n    .text-primary { color:#8ac4ff; font-weight:600; }\n    .text-accent { color:#7fd8c7; font-weight:600; }\n    em { color: #94a3b8; font-style: italic; }\n    a { color: #ffffff; text-decoration: underline; cursor: pointer; }\n    a:hover { color: #8ac4ff; }\n  </style>\n  <base target=\"_blank\" />\n</head>\n<body>\n  <div class=\"ti-root\">${taskImagePath ? `<div style="position: absolute; top: 6px; right: 6px; width: 36px; height: 36px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(107, 114, 128, 0.3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); z-index: 1000; background: rgba(17, 24, 39, 0.9); pointer-events: none; display: flex; align-items: center; justify-content: center;"><img src="${taskImagePath}" alt="Task preview" style="width: 100%; height: 100%; object-fit: cover; display: block; margin: 0; padding: 0; min-width: 100%; min-height: 100%;" onerror="this.parentElement.style.display='none';" /></div>` : ''}${content}</div>\n  <script>\n    // Prevent copy, cut, and paste operations\n    document.addEventListener('copy', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('cut', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('paste', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Prevent selection via keyboard shortcuts\n    document.addEventListener('keydown', function(e) {\n      // Prevent Ctrl+C, Cmd+C, Ctrl+X, Cmd+X, Ctrl+A, Cmd+A\n      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {\n        e.preventDefault();\n        return false;\n      }\n    });\n    // Prevent right-click context menu\n    document.addEventListener('contextmenu', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Handle link clicks to open in new window\n    document.addEventListener('click', function(e) {\n      const link = e.target.closest('a');\n      if (link && link.href) {\n        e.preventDefault();\n        window.open(link.href, '_blank', 'noopener,noreferrer');\n        return false;\n      }\n    }, true);\n  </script>\n</body>\n</html>`;
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
                key={instructionsUrl}
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
              key={`structured-${trimmed.substring(0, 100)}`}
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

export default TaskInstructionNew;
