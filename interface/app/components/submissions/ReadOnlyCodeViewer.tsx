"use client";

import React, { useState, useMemo } from "react";
import MonacoEditor from "@monaco-editor/react";

export interface ReadOnlyCodeViewerProps {
  /** Map of filename -> content. For function tasks often a single key like "py" or "solution.py". */
  files: Record<string, string>;
  className?: string;
}

function getLanguageFromFileName(filename: string): string {
  if (!filename) return "plaintext";
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "ts":
      return "typescript";
    case "html":
      return "html";
    case "css":
    case "scss":
      return "css";
    case "py":
      return "python";
    case "json":
      return "json";
    default:
      return "plaintext";
  }
}

const FILE_ORDER = ["solution.py", "py", "index.js", "index.ts", "script.js", "index.html"];

function sortFileEntries(entries: [string, string][]): [string, string][] {
  return [...entries].sort(([a], [b]) => {
    const ai = FILE_ORDER.indexOf(a);
    const bi = FILE_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

export default function ReadOnlyCodeViewer({ files, className = "" }: ReadOnlyCodeViewerProps) {
  const entries = useMemo(
    () => sortFileEntries(Object.entries(files).filter(([, v]) => v != null && String(v).trim() !== "")),
    [files]
  );

  const [activeKey, setActiveKey] = useState<string>(() => entries[0]?.[0] ?? "");

  const activeEntry = useMemo(() => {
    if (!activeKey) return entries[0];
    const found = entries.find(([k]) => k === activeKey);
    return found ?? entries[0];
  }, [entries, activeKey]);

  if (entries.length === 0) {
    return (
      <div className={`flex items-center justify-center text-gray-400 text-sm ${className}`}>
        No code to display.
      </div>
    );
  }

  const [activeFileName, activeContent] = activeEntry ?? ["", ""];
  const language = getLanguageFromFileName(activeFileName);

  return (
    <div className={`flex flex-col h-full min-h-0 bg-[#1e1e1e] ${className}`}>
      {entries.length > 1 && (
        <div className="flex-shrink-0 flex gap-1 px-2 py-1.5 border-b border-gray-700/60 bg-gray-800/50 overflow-x-auto">
          {entries.map(([key]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveKey(key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                activeKey === key
                  ? "bg-gray-600 text-white"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/70"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={language}
          value={activeContent}
          options={{
            readOnly: true,
            domReadOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            folding: true,
            wordWrap: "on",
            fontSize: 13,
            renderLineHighlight: "line",
          }}
          loading={null}
        />
      </div>
    </div>
  );
}
