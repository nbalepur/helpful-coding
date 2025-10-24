"use client";
import React, { useState, useRef } from 'react';
import MonacoEditor from "@monaco-editor/react";

interface SimpleCodingTerminalProps {
  taskName: string;
  onClose: () => void;
}

const SimpleCodingTerminal: React.FC<SimpleCodingTerminalProps> = ({ 
  taskName, 
  onClose 
}) => {
  const [code, setCode] = useState(`// Welcome to ${taskName}!
// Start coding here...

function hello() {
    console.log("Hello, World!");
}

hello();
`);
  const [language, setLanguage] = useState("javascript");
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    
    // Set up a custom dark theme
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1a1a1a',
        'editor.foreground': '#e5e5e5',
        'editorLineNumber.foreground': '#888888',
        'editorLineNumber.activeForeground': '#e5e5e5',
        'editorCursor.foreground': '#e5e5e5',
        'editor.selectionBackground': '#404040',
        'editor.inactiveSelectionBackground': '#404040',
      }
    });
    
    monaco.editor.setTheme('custom-dark');
  };

  const runCode = () => {
    // Simple code execution simulation
    console.log("Running code:", code);
    // In a real implementation, this would execute the code
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Terminal Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-white">{taskName}</h2>
            <div className="flex items-center space-x-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="typescript">TypeScript</option>
              </select>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={language}
          theme="custom-dark"
          value={code}
          onChange={(value) => setCode(value || '')}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            minimap: { enabled: false },
            wordWrap: 'on',
            tabSize: 2,
          }}
        />
      </div>

      {/* Terminal Footer */}
      <div className="p-3 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <span>Ready to code!</span>
          </div>
          <button
            onClick={runCode}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8a2 2 0 012-2z" />
            </svg>
            <span>Run Code</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimpleCodingTerminal;
