import React, {
  RefObject,
  useEffect,
  useRef,
  useState,
  Dispatch,
  SetStateAction,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import {
  get_openai_response,
} from "../functions/cloud_functions_helper";
// CSS imported via globals.css
import { CursorPos } from "readline";

import MonacoEditor, {
  DiffEditor,
  useMonaco,
  loader,
} from "@monaco-editor/react";
import { get } from "http";
import { FileNode } from './FileManager';

interface EditorProps {
  onEditorMount: (editor: any, monaco: any) => void;
  contextLength: number;
  wait_time_for_sug: number;
  setSuggestionIdx: Dispatch<SetStateAction<number>>;
  setTelemetry: Dispatch<SetStateAction<any[]>>;
  modelAutocomplete: string;
  taskIndex: number;
  setLogprobsCompletion: Dispatch<SetStateAction<any>>;
  logProbs: any;
  suggestionIdx: number;
  messageAIIndex: number;
  setIsSpinning: Dispatch<SetStateAction<boolean>>;
  proactive_refresh_time_inactive: number;
  chatRef: any;
  code?: string;
  setCode?: Dispatch<SetStateAction<string>>;
  // Multi-file support
  files?: FileNode[];
  activeFileId?: string | null;
  onFileContentChange?: (fileId: string, content: string) => void;
  enableMultiFile?: boolean;
  onFileSave?: (fileId: string) => void;
  onContentChange?: () => void;
}

interface EditorRef {
  setEditorType: (isDiff: boolean, originalCode: string, newCode: string) => void;
  setEditorReadOnly: (isReadOnly: boolean) => void;
  getCodeValue: () => string;
  clearDiffEditor: () => void;
  scrollToBottom: () => void;
  // Multi-file support
  switchToFile: (fileId: string) => void;
  getActiveFileId: () => string | null;
  getAllFileContents: () => Record<string, string>;
  layout: () => void;
}

const Editor = forwardRef<EditorRef, EditorProps>(({
  onEditorMount,
  contextLength,
  wait_time_for_sug,
  setSuggestionIdx,
  setTelemetry,
  modelAutocomplete,
  taskIndex,
  setLogprobsCompletion,
  logProbs,
  suggestionIdx,
  messageAIIndex,
  setIsSpinning,
  proactive_refresh_time_inactive,
  chatRef,
  code,
  setCode,
  files = [],
  activeFileId,
  onFileContentChange,
  enableMultiFile = false,
  onFileSave,
  onContentChange,
}, ref) => {
  const monaco = useMonaco();
  const [language, setLanguage] = useState("html");
  const useTabs = false; // Disable internal tabs; MultiFileEditor manages tabs
  const [tabs, setTabs] = useState<Array<{ id: string; label: string; fileId?: string }>>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const editorRef: any = useRef(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const monacoRef: any = useRef(null);
  const decorationsCollection: any = useRef(null);
  // Add state variables to manage the editor type and read-only state
  const [isDiffEditor, setIsDiffEditor] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [originalCode, setOriginalCode] = useState("");
  const [modifiedCode, setModifiedCode] = useState("");
  const [codeValue, setCodeValue] = useState(code || "");
  // Multi-file state
  const [fileModels, setFileModels] = useState<Record<string, any>>({});
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [currentActiveFileId, setCurrentActiveFileId] = useState<string | null>(activeFileId || null);
  const saveCommandRegistered = useRef<string | null>(null);
  // const [isNewTask, setIsNewTask] = useState(true);
  const newTaskRef = useRef(true);
  const taskIndexRef = useRef(taskIndex);
  const prevTaskIndexRef = useRef(-1);
  const lastLanguageRef = useRef<string>('');

  // File management functions
  const getLanguageFromFileName = useCallback((fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'py':
        return 'python';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'html':
      case 'htm':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'xml':
        return 'xml';
      case 'sql':
        return 'sql';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'sh':
        return 'shell';
      case 'bash':
        return 'shell';
      default:
        return 'plaintext';
    }
  }, []);

  const switchToFileInternal = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.type !== 'file') return;

    setCurrentActiveFileId(fileId);
    
    // Create tab if it doesn't exist
    const existingTab = tabs.find(tab => tab.fileId === fileId);
    if (!existingTab) {
      const newTab = { 
        id: `tab_${fileId}`, 
        label: file.name, 
        fileId: fileId 
      };
      setTabs(prev => [...prev, newTab]);
      setOpenTabs(prev => [...prev, newTab.id]);
    }
    
    setActiveTab(`tab_${fileId}`);
    
    // Update language
    const fileLanguage = getLanguageFromFileName(file.name);
    setLanguage(fileLanguage);
    lastLanguageRef.current = fileLanguage;
    
    // Update code value
    setCodeValue(file.content || '');
  }, [files, getLanguageFromFileName]);

  const handleAcceptChangesEditor = () => {
    // get current modfiied code from the diff editor not the regular editor
    
    const modifiedValue = getModifiedValue();
    
    editorRef.current.pushUndoStop();
    setCodeValue(modifiedValue || modifiedCode); // Fallback to state if getModifiedValue returns null
    setIsDiffEditor(false);

    setTelemetry((prevTelemetry: any[]) => {
      return [
        ...prevTelemetry,
        {
          event_type: "accept_edit",
          timestamp: Date.now(),
        },
      ];
    });

  };
  const handleDeclineChangesEditor = () => {
    setCodeValue(originalCode);
    setIsDiffEditor(false);
    setTelemetry((prevTelemetry: any[]) => {
      return [
        ...prevTelemetry,
        {
          event_type: "reject_edit",
          timestamp: Date.now(),
        },
      ];
    });
  }

  const diffEditorRef = useRef(null);

  const handleDiffEditorDidMount = useCallback((editor: any, monaco: any) => {
    diffEditorRef.current = editor;
  }, []);

  const getModifiedValue = useCallback(() => {
    if (diffEditorRef.current) {
      const modifiedEditor = (diffEditorRef.current as any).getModifiedEditor();
      const value = modifiedEditor.getValue();
      return value;
    }
    return null;
  }, []);

  useEffect(() => {
    newTaskRef.current = true;
    taskIndexRef.current = taskIndex;
  }, [taskIndex]);

  // Update codeValue when code prop changes
  useEffect(() => {
    if (code !== undefined && code !== codeValue) {
      setCodeValue(code);
    }
  }, [code]);

  // Sync single-file content to fileContents for test case access
  useEffect(() => {
    if (!enableMultiFile && codeValue) {
      // Determine file extension based on current language
      let extension = '.txt';
      if (language === 'html') extension = '.html';
      else if (language === 'css') extension = '.css';
      else if (language === 'javascript') extension = '.js';
      else if (language === 'python') extension = '.py';
      else if (language === 'json') extension = '.json';
      
      const newFileContents = {
        [`index${extension}`]: codeValue
      };
      setFileContents(newFileContents);
    }
  }, [codeValue, language, enableMultiFile]);

  // Handle file changes
  useEffect(() => {
    if (enableMultiFile && files.length > 0) {
      // Initialize file contents
      const newFileContents: Record<string, string> = {};
      files.forEach(file => {
        if (file.type === 'file') {
          newFileContents[file.id] = file.content || '';
        }
      });
      setFileContents(newFileContents);

      // Do not auto-open first file; respect external selection
    } else {
      // No files available - ensure contents are cleared
      setFileContents({});
    }
  }, [enableMultiFile, files]);

  // Handle active file changes
  useEffect(() => {
    if (activeFileId && activeFileId !== currentActiveFileId) {
      // Get the file and update language immediately before switching
      const file = files.find(f => f.id === activeFileId);
      if (file && file.type === 'file') {
        const fileLanguage = getLanguageFromFileName(file.name);
        setLanguage(fileLanguage);
      }
      switchToFileInternal(activeFileId);
      setCurrentActiveFileId(activeFileId);
    }
  }, [activeFileId, currentActiveFileId, files, getLanguageFromFileName, language, switchToFileInternal]);

  // Update Monaco model language when language state changes
  useEffect(() => {
    if (editorRef.current && monaco && language !== lastLanguageRef.current) {
      const editor = editorRef.current;
      const model = editor.getModel();
      if (model) {
        const currentLanguage = model.getLanguageId();
        if (currentLanguage !== language) {
          monaco.editor.setModelLanguage(model, language);
          lastLanguageRef.current = language;
        }
      }
    }
  }, [language, monaco]);


  // Fix language when editor becomes ready for the current active file
  useEffect(() => {
    if (editorRef.current && monaco && currentActiveFileId && files.length > 0) {
      const file = files.find(f => f.id === currentActiveFileId);
      if (file && file.type === 'file') {
        const correctLanguage = getLanguageFromFileName(file.name);
        const editor = editorRef.current;
        const model = editor.getModel();
        
        if (model) {
          const currentLanguage = model.getLanguageId();
          if (currentLanguage !== correctLanguage) {
            setLanguage(correctLanguage);
            monaco.editor.setModelLanguage(model, correctLanguage);
          }
        }
      }
    }
  }, [editorRef.current, monaco, currentActiveFileId, files]);

  // Set up save command when active file changes
  useEffect(() => {
    if (enableMultiFile && activeFileId && editorRef.current && onFileSave && monaco) {
      const editor = editorRef.current;
      
      // Only register the command if it hasn't been registered for this file yet
      if (saveCommandRegistered.current !== activeFileId) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          if (onFileSave && activeFileId) {
            onFileSave(activeFileId);
          }
        });
        saveCommandRegistered.current = activeFileId;
      }
    }
  }, [activeFileId, enableMultiFile, onFileSave, monaco]);

  // Keyboard shortcuts for diff editor
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isDiffEditor) return;
      
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      
      if (isCtrlOrCmd && event.key === 'y') {
        event.preventDefault();
        handleAcceptChangesEditor();
      } else if (isCtrlOrCmd && event.key === 'n') {
        event.preventDefault();
        handleDeclineChangesEditor();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDiffEditor]);

  const getAvailableUnits = (variation: any): FileNode[] => {
    // Return available units for the variation
    return files.filter(f => f.type === 'file');
  };

  const getPriceForUnit = (variation: any, unit: any): string => {
    // Get price for specific unit
    const file = files.find(f => f.id === unit?.id);
    return file?.content || '';
  };

  const createMonacoModel = (file: FileNode, monaco: any) => {
    const language = getLanguageFromFileName(file.name);
    const model = monaco.editor.createModel(file.content || '', language);
    model.setValue(file.content || '');
    return model;
  };

  const handleAddTab = () => {
    const newTabId = `tab${tabs.length + 1}`;
    const newTab = { id: newTabId, label: `Tab ${tabs.length + 1}` };
    setTabs([...tabs, newTab]);
    setActiveTab(newTabId);
    setOpenTabs([...openTabs, newTabId]);
  };

  const handleDeleteTab = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.fileId) {
      // This is a file tab, don't allow deletion from here
      return;
    }
    
    const filteredTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(filteredTabs);
    if (activeTab === tabId) {
      const nextTab = filteredTabs[0];
      setActiveTab(nextTab?.id || "");
      setOpenTabs(openTabs.filter(t => t !== tabId));
    }
  };

  const selectTab = (tabId: string) => {
    setActiveTab(tabId);
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.fileId) {
      setCurrentActiveFileId(tab.fileId);
      const file = files.find(f => f.id === tab.fileId);
      if (file) {
        const fileLanguage = getLanguageFromFileName(file.name);
        setLanguage(fileLanguage);
        setCodeValue(file.content || '');
      }
    }
  };


  const modelAutocompleteRef = useRef(modelAutocomplete);
  modelAutocompleteRef.current = modelAutocomplete;

  const provideProactiveSuggestions = (
    model: any,
    source: string,
  ) => {
    // Proactive suggestions disabled
    return;
  }

  const manualProactiveSuggestions = () => {
    // Manual proactive suggestions disabled
    return;
  }

  const provideInlineAutocompleteSuggestions = async (
    model: any,
    position: any,
    context: any,
    token: any
  ) => {
    // Autocomplete functionality disabled - always return empty suggestions
    return Promise.resolve({ items: [] });
    // Get code input up to the current cursor position
    let prefix_code = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });

    // Get all code after the current cursor position
    let suffix_code = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: position.column + 1,
      endLineNumber: model.getLineCount(),
      endColumn: model.getLineLength(model.getLineCount()) + 1,
    });

    let maxPrefixLength = Math.floor((contextLength * 2) / 3);
    let maxSuffixLength = contextLength - maxPrefixLength;

    if (prefix_code.length < maxPrefixLength) {
      maxSuffixLength += maxPrefixLength - prefix_code.length;
      maxPrefixLength = prefix_code.length;
    } else if (suffix_code.length < maxSuffixLength) {
      maxPrefixLength += maxSuffixLength - suffix_code.length;
      maxSuffixLength = suffix_code.length;
    }

    if (prefix_code.length > maxPrefixLength) {
      prefix_code = prefix_code.substring(prefix_code.length - maxPrefixLength);
    }

    if (suffix_code.length > maxSuffixLength) {
      suffix_code = suffix_code.substring(0, maxSuffixLength);
    }

    let mean = 100,
      stdDev = 15,
      min = 10,
      max = 120;
    //var actual_max_tokens = sampleGaussianTruncated(mean, stdDev, min, max);

    prefix_code =
      "# file is main.py, ONLY CODE IN PYTHON IN THIS FILE\n" + prefix_code;

    let full_code = prefix_code;

    // Wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, wait_time_for_sug));

    if (token.isCancellationRequested) {
      return Promise.resolve({ items: [] });
    }

    // Replace with tabs.
    full_code = full_code.replace(new RegExp(" ".repeat(4), "g"), "\t");

    let newSuggIdx: any = null;
    setSuggestionIdx((prev) => {
      newSuggIdx = prev + 1;
      return newSuggIdx;
    });

    setTelemetry((prev) => [
      ...prev,
      {
        event_type: "before_shown",
        task_index: taskIndex,
        suggestion_id: newSuggIdx,
        prefix_code: prefix_code,
        suffix_code: suffix_code,
        timestamp: Date.now(),
      },
    ]);

    setIsSpinning(true);

    let suggestion = "";
    // Always use OpenAI for autocomplete
    suggestion = await get_openai_response(
      prefix_code,
      suffix_code,
      mean,
      setLogprobsCompletion
    );
    setIsSpinning(false);

    // Split full_code into each word/whitesapce

    // Clean up suggestion, leading spaces if new line
    if (full_code[full_code.length - 1] === "\t") {
      suggestion = suggestion.replace(/^ +/, "");
    }

    setTelemetry((prev) => [
      ...prev,
      {
        event_type: "shown",
        task_index: taskIndex,
        suggestion_id: newSuggIdx,
        suggestion: suggestion,
        logprobs: logProbs,
        timestamp: Date.now(),
      },
    ]);

    return Promise.resolve({
      items: [
        {
          insertText: suggestion,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          command: {
            id: "trackSuggestionAccept",
            title: "Suggestion Accepted",
            arguments: [suggestion, newSuggIdx, taskIndex],
          },
        },
      ],
    });
  };

  var interval: any = null;
  function startInactiveSuggestions(editor: any) {
    // Inactive suggestions disabled
    return;
  }

  const highlightLine = (lineNumber: any) => {
    if (editorRef.current && monacoRef.current && decorationsCollection.current) {
      const new_decorations =
        [
          {
            range: new monacoRef.current.Range(lineNumber, 1, lineNumber, 1),
            options: {
              isWholeLine: true,
              className: 'myLineHighlight'
            }
          }
        ];
      decorationsCollection.current.set(new_decorations);
      editorRef.current.revealLineInCenter(lineNumber);
    } else {
    }
  };

  useEffect(() => {
    // proactive_refresh_time changed
    if (editorRef.current) {
      clearInterval(interval);
      startInactiveSuggestions(editorRef.current);
    }
  }, [proactive_refresh_time_inactive]);

  function handleEditorDidMount(editor: any, monaco: any, activeTab: string) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Define custom dark theme with #2a2a2a background without overriding built-in themes
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#2a2a2a',
        'editor.foreground': '#e5e5e5',
        'editorLineNumber.foreground': '#888888',
        'editorLineNumber.activeForeground': '#e5e5e5',
        'editorCursor.foreground': '#e5e5e5',
        'editor.selectionBackground': '#404040',
        'editor.inactiveSelectionBackground': '#404040',
      }
    });
    
    // Set the custom theme
    monaco.editor.setTheme('custom-dark');
    
    // Set the correct language for the current file if in multi-file mode
    if (enableMultiFile && currentActiveFileId && files.length > 0) {
      const file = files.find(f => f.id === currentActiveFileId);
      if (file && file.type === 'file') {
        const correctLanguage = getLanguageFromFileName(file.name);
        setLanguage(correctLanguage);
        lastLanguageRef.current = correctLanguage;
        const model = editor.getModel();
        if (model) {
          monaco.editor.setModelLanguage(model, correctLanguage);
        }
      }
    } else {
      // Set initial language ref for single file mode
      lastLanguageRef.current = language;
    }
    
    onEditorMount(editor, monaco); // Pass the editor and monaco instances back to the parent if needed
    editor.updateOptions({
      renderIndentGuides: true, // Show indentation guides
      roundedSelection: false,
      cursorStyle: "line",
      automaticLayout: true,
      scrollBeyondLastLine: false, // This fixes the scrolling issue
      wordWrap: 'on', // Enable word wrapping
      scrollbar: {
        vertical: 'visible',
        horizontal: 'hidden', // Hide horizontal scrollbar
        verticalScrollbarSize: 12,
        horizontalScrollbarSize: 10,
        useShadows: false,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        handleMouseWheel: true,
        alwaysConsumeMouseWheel: false
      }
    });

    // Save command is handled in useEffect to ensure proper cleanup

    // Inline completions provider disabled
    // monaco.languages.registerInlineCompletionsProvider("python", {
    //   provideInlineCompletions: provideInlineAutocompleteSuggestions,
    //   freeInlineCompletions: (completions: any) => { },
    // });

    // Suggestion tracking command disabled
    // monaco.editor.addCommand({
    //   id: "trackSuggestionAccept",
    //   run: (_: any, suggestion: any, suggestion_id: any, task_index: any) => {
    //     setTelemetry((prev) => [
    //       ...prev,
    //       {
    //         event_type: "accept",
    //         task_index: task_index,
    //         suggestion_id: suggestion_id,
    //         suggestion: suggestion,
    //         timestamp: Date.now(),
    //       },
    //     ]);
    //     console.log("accepted suggestion");
    //   },
    // });

    // Keyboard shortcut for requesting suggestions disabled
    // editor.addAction({
    //   id: "requestSuggestion",
    //   label: "Request Suggestion",
    //   keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    //   run: async () => {
    //     // Suggestions disabled
    //   },
    // });

    // editor.onDidPaste((e: any) => {
    //   setTelemetry((prevState) => {
    //     return [
    //       ...prevState,
    //       {
    //         event_type: "paste_into_editor",
    //         task_index: taskIndex,
    //         messageAIindex: messageAIIndex,
    //         copied_text: editor.getModel().getValueInRange(e.range),
    //         timestamp: Date.now(),
    //       },
    //     ];
    //   });
    // });

    // // editor.onDidChangeCursorPosition((e: any) => {
    // editor.onDidChangeModelContent((e: any) => {

    //   // if (interval) {
    //   //   clearInterval(interval);
    //   // }
    //   // chatRef.current.cancelProactiveSuggestions();

    //   // if (newTaskRef.current) {
    //   //   console.log(taskIndexRef.current, "New task, not starting suggestions");
    //   //   newTaskRef.current = false;
    //   //   prevTaskIndexRef.current = taskIndexRef.current;
    //   //   return;
    //   // }
    //   // const position = editor.getPosition();
    //   // console.log('Cursor Position:', position);
    //   // startInactiveSuggestions(editor);
    // });

    decorationsCollection.current = editor.createDecorationsCollection();

    // Ensure layout recalculates when container size changes (e.g., drag-resize)
    try {
      if (containerRef.current && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (editorRef.current) {
            editorRef.current.layout();
          }
        });
        ro.observe(containerRef.current);
      } else {
        // Fallback: trigger layout on window resize
        const onResize = () => {
          if (editorRef.current) {
            editorRef.current.layout();
          }
        };
        window.addEventListener('resize', onResize);
      }
    } catch (e) {
      // no-op
    }

  }
  useImperativeHandle(ref, () => {
    return {

      setEditorType(isDiff: boolean, originalCode: string, newCode: string) {
        if (isDiff) {
          setOriginalCode(originalCode);
          setModifiedCode(newCode);
          setIsDiffEditor(isDiff);

        }
        else {
          setIsDiffEditor(isDiff);
          setCodeValue(originalCode);

        }
      },

      setEditorReadOnly(isReadOnly: boolean) {
        setIsReadOnly(isReadOnly);
      },

      getCodeValue() {
        return editorRef.current.getValue();
      },

      clearDiffEditor() {
        setOriginalCode("");
        setModifiedCode("");
        setIsDiffEditor(false);
      },

      scrollToBottom() {
        if (editorRef.current) {
          const model = editorRef.current.getModel();
          if (model) {
            const lineCount = model.getLineCount();
            const lastLine = model.getLineContent(lineCount);
            editorRef.current.setPosition({ lineNumber: lineCount, column: lastLine.length + 1 });
            editorRef.current.revealLineInCenter(lineCount);
          }
        }
      },

      // Multi-file support methods
      switchToFile(fileId: string) {
        switchToFileInternal(fileId);
      },

      getActiveFileId() {
        return currentActiveFileId;
      },

      getAllFileContents() {
        // In single-file mode, return the current code value as a default file
        if (!enableMultiFile || Object.keys(fileContents).length === 0) {
          // Determine file extension based on current language
          let extension = '.txt';
          if (language === 'html') extension = '.html';
          else if (language === 'css') extension = '.css';
          else if (language === 'javascript') extension = '.js';
          else if (language === 'python') extension = '.py';
          else if (language === 'json') extension = '.json';
          
          const result = {
            [`index${extension}`]: codeValue
          };
          return result;
        }
        return fileContents;
      },

      layout() {
        if (editorRef.current) {
          editorRef.current.layout();
        }
      }

    };

  }, [codeValue, currentActiveFileId, fileContents, switchToFileInternal]);


  return (
    <div ref={containerRef} className="editor-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {useTabs &&
        <div className="tabs">
          {tabs.map(tab => (
            <button style={{ height: "4vh" }} key={tab.id} onClick={() => selectTab(tab.id)} className={activeTab === tab.id ? "active" : ""}>
              {tab.label}
              {tab.id !== "tab1" && (
                <button onClick={() => handleDeleteTab(tab.id)}>x</button>
              )}
            </button>
          ))}
          <button onClick={handleAddTab}>+</button>
        </div>}
      <div className={isDiffEditor ? 'relative block' : 'hidden'} style={{ flex: 1, height: '100%' }}>
        <DiffEditor
          height="100%"
          language="html"
          theme="custom-dark"
          original={originalCode}
          modified={modifiedCode}
          onMount={handleDiffEditorDidMount}
          options={{
            readOnly: isReadOnly, 
            minimap: { enabled: false },
            enableSplitViewResizing: false,
            renderSideBySide: false,
            scrollBeyondLastLine: false,
            fontSize: 12,
            fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
            lineHeight: 22,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'line',
            renderWhitespace: 'selection',
            wordWrap: 'on',
            automaticLayout: true,
            // Diff editor specific options
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            originalEditable: false,
            // Force line-level highlighting
            diffWordWrap: 'on',
            diffCodeLens: false,
            scrollbar: {
              vertical: 'visible',
              horizontal: 'hidden',
              verticalScrollbarSize: 12,
              horizontalScrollbarSize: 10,
              useShadows: false,
              verticalHasArrows: false,
              horizontalHasArrows: false,
              handleMouseWheel: true,
              alwaysConsumeMouseWheel: false,
              arrowSize: 0
            }
          }}
        />
        {isDiffEditor && (
          <div className="absolute flex gap-1 z-50" style={{ bottom: '10px', left: '10px' }}>
            <button
              onClick={handleDeclineChangesEditor}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm opacity-80 hover:opacity-100 transition-opacity duration-200 shadow-lg"
            >
              Reject ⌘N
            </button>
            <button
              onClick={handleAcceptChangesEditor}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm opacity-80 hover:opacity-100 transition-opacity duration-200 shadow-lg"
            >
              Accept ⌘Y
            </button>
          </div>
        )}
      </div>
      <div className={`${isDiffEditor ? 'hidden' : 'block'} border-b border-gray-700/50`} style={{ flex: 1, height: '100%' }}>
        <MonacoEditor
          height="100%"
          language={language}
          value={codeValue || ""}
          theme="custom-dark"
          keepCurrentModel={true}
          onMount={(editor, monaco) => handleEditorDidMount(editor, monaco, activeTab)}
          onChange={(value) => {
            setCodeValue(value || "");
            if (setCode) {
              setCode(value || "");
            }
            // Update file content if in multi-file mode
            if (enableMultiFile && currentActiveFileId && onFileContentChange) {
              onFileContentChange(currentActiveFileId, value || "");
            }
          }}
          options={{ 
            minimap: { enabled: false }, 
            readOnly: isReadOnly,
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
            lineHeight: 22,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'line',
            renderWhitespace: 'selection',
            wordWrap: 'on',
            automaticLayout: true,
            scrollbar: {
              vertical: 'visible',
              horizontal: 'hidden',
              verticalScrollbarSize: 12,
              horizontalScrollbarSize: 10,
              useShadows: false,
              verticalHasArrows: false,
              horizontalHasArrows: false,
              handleMouseWheel: true,
              alwaysConsumeMouseWheel: false,
              arrowSize: 0
            }
          }}
        />
      </div>
    </div>
  );
});

export default Editor;
