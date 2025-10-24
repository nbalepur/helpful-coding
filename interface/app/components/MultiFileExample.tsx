"use client";
import React, { useState } from 'react';
import CodingEditor from './CodingEditor';

/**
 * Example component showing how to enable multi-file support in the CodeEditor
 * 
 * To enable multi-file support in your application:
 * 1. Import CodingEditor
 * 2. Set enableMultiFile={true} prop
 * 3. The editor will automatically switch to MultiFileEditor mode
 */
const MultiFileExample: React.FC = () => {
  const [code, setCode] = useState('# Multi-File Editor Example\nprint("Hello from main.py!")');
  
  // All the required props for CodingEditor
  const editorProps = {
    onEditorMount: () => {},
    contextLength: 1000,
    wait_time_for_sug: 2000,
    setSuggestionIdx: () => {},
    setTelemetry: () => {},
    modelAutocomplete: 'gpt-4',
    taskIndex: 0,
    setLogprobsCompletion: () => {},
    logProbs: null,
    suggestionIdx: 0,
    messageAIIndex: 0,
    setIsSpinning: () => {},
    proactive_refresh_time_inactive: 5000,
    chatRef: { current: null },
    actualEditorRef: { current: null },
    setTaskDescriptions: () => {},
    setFunctionSignatures: () => {},
    setUnitTests: () => {},
    setExpCondition: () => {},
    setModel: () => {},
    setMaxTokensTask: () => {},
    editor: null,
    unit_tests: [],
    setMessages: () => {},
    exp_condition: 'test',
    response_id: 'test',
    worker_id: 'test',
    setTaskIndex: () => {},
    function_signatures: [],
    task_id: 'test',
    telemetry: [],
    skipTime: 0,
    editorHeight: 400,
    onEditorMouseDown: () => {},
    code,
    setCode,
    // Enable multi-file support
    enableMultiFile: true
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px', background: '#2a2a2a', color: 'white' }}>
        <h1>Multi-File Editor Example</h1>
        <p>This demonstrates the multi-file support in the CodeEditor. You can:</p>
        <ul>
          <li>Create new files and folders</li>
          <li>Switch between files using tabs</li>
          <li>Edit multiple files simultaneously</li>
          <li>Files are automatically saved to localStorage</li>
        </ul>
      </div>
      
      <div style={{ flex: 1 }}>
        <CodingEditor {...editorProps} />
      </div>
    </div>
  );
};

export default MultiFileExample;
