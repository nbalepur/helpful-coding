"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import FileManager, { FileNode } from './FileManager';
import { Bot, Check, X } from 'lucide-react';

interface MultiFileEditorProps {
  // Editor props
  onEditorMount: (editor: any, monaco: any) => void;
  contextLength: number;
  wait_time_for_sug: number;
  setSuggestionIdx: React.Dispatch<React.SetStateAction<number>>;
  setTelemetry: React.Dispatch<React.SetStateAction<any[]>>;
  modelAutocomplete: string;
  taskIndex: number;
  setLogprobsCompletion: React.Dispatch<React.SetStateAction<any>>;
  logProbs: any;
  suggestionIdx: number;
  messageAIIndex: number;
  setIsSpinning: React.Dispatch<React.SetStateAction<boolean>>;
  proactive_refresh_time_inactive: number;
  chatRef: any;
  actualEditorRef: any;
  // Code props
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  // Resize props
  editorHeight: number;
  onEditorMouseDown: (e: React.MouseEvent) => void;
  // Multi-file config
  initialFiles?: FileNode[];
  readOnly?: boolean;
  // Save shortcut callback (e.g., to refresh preview)
  onSaveShortcut?: (fileId?: string) => void;
  // Bubble content changes up to parent (for live preview)
  onContentChange?: () => void;
  // Assistant visibility (to style AI Help button)
  isAIAssistantVisible?: boolean;
  // Agent changes for diff view
  pendingAgentChanges?: any;
  onAcceptAgentChanges?: (fileType?: string, content?: string) => void;
  onRejectAgentChanges?: () => void;
}

// Helper function to determine language from filename
const getLanguageFromFileName = (filename: string): string => {
  if (!filename) return 'plaintext';
  
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    // Web technologies
    case 'js': return 'javascript';
    case 'jsx': return 'javascript';
    case 'ts': return 'typescript';
    case 'tsx': return 'typescript';
    case 'html': return 'html';
    case 'htm': return 'html';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'sass': return 'sass';
    case 'less': return 'less';
    case 'json': return 'json';
    case 'xml': return 'xml';
    case 'svg': return 'xml';
    
    // Backend languages
    case 'py': return 'python';
    case 'java': return 'java';
    case 'cpp': return 'cpp';
    case 'cc': return 'cpp';
    case 'cxx': return 'cpp';
    case 'c': return 'c';
    case 'cs': return 'csharp';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'swift': return 'swift';
    case 'kt': return 'kotlin';
    case 'scala': return 'scala';
    case 'r': return 'r';
    case 'jl': return 'julia';
    
    // Database and config
    case 'sql': return 'sql';
    case 'yaml': case 'yml': return 'yaml';
    case 'toml': return 'toml';
    case 'ini': return 'ini';
    case 'cfg': return 'ini';
    case 'conf': return 'ini';
    
    // Documentation
    case 'md': return 'markdown';
    case 'rst': return 'restructuredtext';
    case 'tex': return 'latex';
    
    // Shell and scripts
    case 'sh': return 'shell';
    case 'bash': return 'shell';
    case 'zsh': return 'shell';
    case 'fish': return 'shell';
    case 'ps1': return 'powershell';
    case 'bat': return 'bat';
    case 'cmd': return 'bat';
    
    // Container and deployment
    case 'dockerfile': return 'dockerfile';
    case 'dockerignore': return 'plaintext';
    case 'gitignore': return 'plaintext';
    case 'gitattributes': return 'plaintext';
    
    // Data formats
    case 'csv': return 'csv';
    case 'tsv': return 'csv';
    case 'log': return 'log';
    
    // Other
    case 'txt': return 'plaintext';
    case 'rtf': return 'rtf';
    case 'diff': return 'diff';
    case 'patch': return 'diff';
    
    default: return 'plaintext';
  }
};

const MultiFileEditor: React.FC<MultiFileEditorProps> = ({
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
  actualEditorRef,
  code,
  setCode,
  editorHeight,
  onEditorMouseDown,
  initialFiles,
  readOnly = false,
  onSaveShortcut,
  onContentChange,
  isAIAssistantVisible,
  pendingAgentChanges,
  onAcceptAgentChanges,
  onRejectAgentChanges,
}: MultiFileEditorProps) => {
  const [isAIVisible, setIsAIVisible] = useState(false);
  const [files, setFiles] = useState<FileNode[]>(initialFiles && initialFiles.length > 0 ? initialFiles : []);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [openTabs, setOpenTabs] = useState<Array<{ id: string; fileId: string; name: string }>>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [showFileManager, setShowFileManager] = useState(true);
  
  // Track edited modified content in diff view
  const [editedModifiedContent, setEditedModifiedContent] = useState<Record<string, string>>({});

  // Track the live Monaco editor instance for the active file
  const liveMonacoEditorRef = useRef<any>(null);
  const diffEditorsRef = useRef<Record<string, any>>({});

  // Update files when initialFiles change (async loading)
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      setFiles(initialFiles);

      // Open all files by default
      const flattenFiles = (nodes: any[]): any[] => {
        const out: any[] = [];
        const stack = [...nodes];
        while (stack.length) {
          const node = stack.shift();
          if (!node) continue;
          if (node.type === 'file') out.push(node);
          if (node.children && Array.isArray(node.children)) {
            stack.unshift(...node.children);
          }
        }
        return out;
      };

      const flattenedFiles = flattenFiles(initialFiles).filter((f: any) => f.type === 'file');
      const tabs = flattenedFiles.map((f: any) => ({ id: `tab_${f.id}`, fileId: f.id, name: f.name }));
      setOpenTabs(tabs);

      // Prefer an HTML file as the active file if present, else the first file
      const preferred = flattenedFiles.find((f: any) => typeof f.name === 'string' && f.name.toLowerCase().endsWith('.html')) || flattenedFiles[0];
      if (preferred) {
        setActiveFileId(preferred.id);
        setActiveTab(`tab_${preferred.id}`);
      } else {
        setActiveFileId('');
        setActiveTab('');
      }
    } else {
      // No files provided; reset state
      setFiles([]);
      setOpenTabs([]);
      setActiveFileId('');
      setActiveTab('');
    }
  }, [initialFiles]);

  // Don't automatically open any files on mount - keep them closed

  // Keyboard shortcuts: Cmd/Ctrl + B toggles file sidebar, Cmd/Ctrl + S saves file
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      
      // Cmd/Ctrl + S: Save current file (fallback for Monaco command)
      if (isCmdOrCtrl && (e.key?.toLowerCase?.() === 's' || e.code === 'KeyS')) {
        e.preventDefault();
        e.stopPropagation();
        try {
          onSaveShortcut && onSaveShortcut(activeFileId || undefined);
        } catch (err) {
          console.warn('Save shortcut handler failed:', err);
        }
        return;
      }
      
      // Cmd/Ctrl + B: Toggle file sidebar
      if (isCmdOrCtrl && (e.key?.toLowerCase?.() === 'b' || e.code === 'KeyB')) {
        e.preventDefault();
        e.stopPropagation();
        setShowFileManager(prev => !prev);
        return;
      }
    };
    
    // Use capture phase to intercept before browser default
    document.addEventListener('keydown', handleKeydown, true);
    return () => document.removeEventListener('keydown', handleKeydown, true);
  }, [activeTab, openTabs, activeFileId, onSaveShortcut]);

  // Listen for AI assistant visibility updates from the parent page
  useEffect(() => {
    const handleVisibility = (e: Event) => {
      try {
        const ce = e as CustomEvent<{ visible: boolean }>;
        setIsAIVisible(!!ce.detail?.visible);
      } catch (err) {
        // no-op
      }
    };
    window.addEventListener('ai-assistant-visibility', handleVisibility as EventListener);
    return () => window.removeEventListener('ai-assistant-visibility', handleVisibility as EventListener);
  }, []);

  // Sync from prop when provided
  useEffect(() => {
    if (typeof isAIAssistantVisible !== 'undefined') {
      setIsAIVisible(!!isAIAssistantVisible);
    }
  }, [isAIAssistantVisible]);

  // Do not persist when readOnly; otherwise persist
  useEffect(() => {
    if (!readOnly) {
      localStorage.setItem('multiFileEditor_files', JSON.stringify(files));
    }
  }, [files, readOnly]);

  // Clean up editedModifiedContent when files no longer have pending agent changes
  // Also initialize edited content when switching to a file that needs it
  useEffect(() => {
    if (!pendingAgentChanges || !pendingAgentChanges.modified) {
      // Clear all edited content when there are no pending changes
      setEditedModifiedContent({});
      return;
    }
    
    // Clean up edited content for files that are no longer in the modified list
    const modifiedFileIds = Object.keys(pendingAgentChanges.modified || {});
    setEditedModifiedContent(prev => {
      const newState = { ...prev };
      let changed = false;
      
      Object.keys(newState).forEach(fileId => {
        if (!modifiedFileIds.includes(fileId)) {
          delete newState[fileId];
          changed = true;
        }
      });
      
      return changed ? newState : prev;
    });
  }, [pendingAgentChanges]);

  // Initialize edited content for the active file when switching to a file with pending changes
  useEffect(() => {
    if (!pendingAgentChanges || !pendingAgentChanges.modified || !activeFileId) {
      return;
    }
    
    // Check if this file has pending changes
    const hasPendingChanges = pendingAgentChanges.modified[activeFileId];
    
    if (hasPendingChanges && !editedModifiedContent[activeFileId]) {
      // Initialize with the modified content from pendingAgentChanges
      const modifiedContent = pendingAgentChanges.modified[activeFileId] || '';
      console.log('🔧 Initializing editedModifiedContent for file:', {
        fileId: activeFileId,
        contentLength: modifiedContent.length,
        hasExistingEdit: !!editedModifiedContent[activeFileId]
      });
      setEditedModifiedContent(prev => ({
        ...prev,
        [activeFileId]: modifiedContent
      }));
    }
  }, [activeFileId, pendingAgentChanges]); // Removed editedModifiedContent from deps to avoid re-initialization

  // Update code prop when active file changes
  useEffect(() => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (activeFile && activeFile.content !== code) {
      console.log('Updating code for active file:', activeFileId, 'new content length:', (activeFile.content || '').length);
      setCode(activeFile.content || '');
    } else if (!activeFileId || activeFileId === '') {
      // If no active file, set code to empty
      setCode('');
    }
  }, [activeFileId, files]);

  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  const handleFileSelect = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.type !== 'file') return;

    setActiveFileId(fileId);
    
    // Add to open tabs if not already open
    const existingTab = openTabs.find(tab => tab.fileId === fileId);
    if (!existingTab) {
      const newTab = {
        id: `tab_${fileId}`,
        fileId: fileId,
        name: file.name
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTab(newTab.id);
    } else {
      setActiveTab(existingTab.id);
    }
  };


  const handleFileContentChange = (fileId: string, content: string) => {
    // Only update if content actually changed
    const currentFile = files.find(f => f.id === fileId);
    if (currentFile && currentFile.content === content) {
      return; // No change, skip update
    }

    setFiles(prev => prev.map(file => 
      file.id === fileId ? { ...file, content } : file
    ));

    // Notify parent about content changes (for live preview updates)
    try { onContentChange && onContentChange(); } catch (e) {}
  };

  const handleFolderToggle = (folderId: string) => {
    setFiles(prev => prev.map(file => {
      if (file.id === folderId && file.type === 'folder') {
        return { ...file, isOpen: !file.isOpen };
      }
      if (file.type === 'folder' && file.children) {
        return {
          ...file,
          children: file.children.map(child => 
            child.id === folderId && child.type === 'folder' 
              ? { ...child, isOpen: !child.isOpen }
              : child
          )
        };
      }
      return file;
    }));
  };

  const handleTabClose = (tabId: string) => {
    const tabToClose = openTabs.find(tab => tab.id === tabId);
    if (!tabToClose) return;

    const newOpenTabs = openTabs.filter(tab => tab.id !== tabId);
    setOpenTabs(newOpenTabs);

    // If this was the active tab, switch to another tab
    if (activeTab === tabId) {
      if (newOpenTabs.length > 0) {
        // Switch to the last opened tab (most recent)
        const lastTab = newOpenTabs[newOpenTabs.length - 1];
        setActiveTab(lastTab.id);
        setActiveFileId(lastTab.fileId);
      } else {
        setActiveTab('');
        setActiveFileId('');
      }
    }
  };

  const handleTabSelect = (tabId: string) => {
    setActiveTab(tabId);
    const tab = openTabs.find(t => t.id === tabId);
    if (tab) {
      setActiveFileId(tab.fileId);
    }
  };

  const handleOpenAI = () => {
    try {
      window.dispatchEvent(new CustomEvent('open-ai-assistant'));
    } catch (e) {
      // no-op
    }
  };

  // Function to get current content of a file from the editor
  const getCurrentFileContent = (fileId: string): string => {
    const file = files.find(f => f.id === fileId);
    const fileContent = file?.content;
    
    // Check if this file has pending agent changes (should show edited content)
    const hasPendingChanges = pendingAgentChanges && pendingAgentChanges.modified && 
                               pendingAgentChanges.modified[fileId];
    
    // If this is the currently active file in diff view, get content from diff editor
    if (fileId === activeFileId && hasPendingChanges) {
      const diffEditorInstance = diffEditorsRef.current[fileId];
      if (diffEditorInstance?.getModifiedEditor) {
        const modifiedEditorInstance = diffEditorInstance.getModifiedEditor();
        if (modifiedEditorInstance) {
          const diffEditorContent = modifiedEditorInstance.getValue();
          console.log('📄 getCurrentFileContent: active file in diff view, returning content from diff editor for', fileId, 'length:', diffEditorContent.length);
          return diffEditorContent;
        }
      }
      
      // Fallback: If in diff view but editor not mounted yet, use edited content
      const editedContent = editedModifiedContent[fileId];
      if (editedContent) {
        console.log('📄 getCurrentFileContent: active file in diff view, returning editedModifiedContent for', fileId, 'length:', editedContent.length);
        return editedContent;
      }
      
      // Last fallback: return the modified content from pendingAgentChanges
      const pendingContent = pendingAgentChanges.modified[fileId] || '';
      console.log('📄 getCurrentFileContent: active file in diff view, returning pendingAgentChanges for', fileId, 'length:', pendingContent.length);
      return pendingContent;
    }
    
    // If this file has pending changes but is NOT the active file, use the tracked edited content
    if (hasPendingChanges) {
      const editedContent = editedModifiedContent[fileId];
      if (editedContent) {
        console.log('📄 getCurrentFileContent: non-active file with pending changes, returning editedModifiedContent for', fileId, 'length:', editedContent.length);
        return editedContent;
      }
      
      // Fallback to modified content from pendingAgentChanges
      const pendingContent = pendingAgentChanges.modified[fileId] || '';
      console.log('📄 getCurrentFileContent: non-active file with pending changes, returning pendingAgentChanges for', fileId, 'length:', pendingContent.length);
      return pendingContent;
    }

    // If this is the currently active file, prefer the live editor value when it is available
    if (fileId === activeFileId) {
      if (liveMonacoEditorRef.current && typeof liveMonacoEditorRef.current.getValue === 'function') {
        const editorValue = liveMonacoEditorRef.current.getValue();
        if (typeof editorValue === 'string') {
          console.log('📄 getCurrentFileContent: active file using Monaco editor value', fileId, 'length:', editorValue.length);
          return editorValue;
        }
      }

      const editorValue = typeof code === 'string' ? code : '';

      if (typeof fileContent === 'string') {
        console.log('📄 getCurrentFileContent: active file using tracked state', fileId, 'length:', fileContent.length);
        return fileContent;
      }

      if (editorValue) {
        console.log('📄 getCurrentFileContent: active file fallback to editor value', fileId, 'length:', editorValue.length);
        return editorValue;
      }

      return '';
    }

    if (typeof fileContent === 'string') {
      console.log('📄 getCurrentFileContent: returning file.content for', fileId, 'length:', fileContent.length);
      return fileContent;
    }

    console.log('📄 getCurrentFileContent: no content found for', fileId, 'defaulting to empty string');
    return '';
  };

  // Function to get all file contents for external access
  const getAllFileContents = (): Record<string, string> => {
    const contents: Record<string, string> = {};
    files.forEach(file => {
      if (file.type === 'file') {
        contents[file.id] = getCurrentFileContent(file.id);
      }
    });
    console.log('📄 getAllFileContents:', {
      fileIds: Object.keys(contents),
      hasEditedContent: Object.keys(editedModifiedContent),
      hasPendingChanges: pendingAgentChanges ? Object.keys(pendingAgentChanges.modified || {}) : [],
      activeFileId,
      contentsLengths: Object.fromEntries(Object.entries(contents).map(([k, v]) => [k, v.length]))
    });
    return contents;
  };

  // Function to update file content
  const updateFileContent = (fileId: string, newContent: string) => {
    setFiles(prevFiles => {
      return prevFiles.map(file => {
        if (file.id === fileId && file.type === 'file') {
          return { ...file, content: newContent };
        }
        return file;
      });
    });
    
    // If this is the active file, update the editor code
    if (fileId === activeFileId) {
      setCode(newContent);
    }
  };

  const layoutAllEditors = useCallback(() => {
    try {
      liveMonacoEditorRef.current?.layout?.();
    } catch (error) {
      // no-op
    }

    try {
      Object.values(diffEditorsRef.current || {}).forEach(diffEditor => {
        if (!diffEditor) return;
        try {
          diffEditor.layout?.();
        } catch (error) {
          // no-op
        }
        try {
          diffEditor.getOriginalEditor?.()?.layout?.();
        } catch (error) {
          // no-op
        }
        try {
          diffEditor.getModifiedEditor?.()?.layout?.();
        } catch (error) {
          // no-op
        }
      });
    } catch (error) {
      // no-op
    }
  }, []);

  const clearDiffEditor = useCallback(() => {
    setEditedModifiedContent({});
    diffEditorsRef.current = {};
    try {
      onRejectAgentChanges && onRejectAgentChanges();
    } catch (error) {
      // no-op
    }
  }, [onRejectAgentChanges]);

  // Expose methods to parent component via ref
  React.useImperativeHandle(actualEditorRef, () => ({
    getAllFileContents,
    updateFileContent,
    layout: layoutAllEditors,
    clearDiffEditor,
    getMonacoEditor: () => liveMonacoEditorRef.current,
  }), [files, activeFileId, code, editedModifiedContent, pendingAgentChanges, layoutAllEditors, clearDiffEditor]);

  return (
    <div className="multi-file-editor h-full flex min-h-0">
      {/* File Manager Sidebar */}
      {/* <div className={`file-manager-sidebar transition-all duration-300 ${showFileManager ? 'w-40' : 'w-12'} flex flex-col flex-shrink-0 min-h-0`}>
        <FileManager
          files={files}
          activeFileId={activeFileId}
          onFileSelect={handleFileSelect}
          onFileContentChange={handleFileContentChange}
          onFolderToggle={handleFolderToggle}
          readOnly={readOnly}
          onToggleSidebar={() => setShowFileManager(!showFileManager)}
          isSidebarOpen={showFileManager}
        />
      </div> */}

      {/* Editor Area */}
      <div className="editor-area flex-1 flex flex-col min-h-0" style={{ borderRight: 'none' }}>
        {/* Tab Bar */}
        <div className="tab-bar bg-transparent border-b border-gray-700/50 flex items-stretch">
          <div className="flex-1 flex overflow-x-auto items-stretch">
            {openTabs.map(tab => (
              <div
                key={tab.id}
                className={`tab flex items-center px-3 text-sm cursor-pointer border-r border-gray-600/30 transition-all duration-200 ${
                  activeTab === tab.id 
                    ? 'text-white bg-gray-800/50 relative after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-blue-400' 
                    : 'bg-transparent text-gray-400 hover:text-white hover:bg-gray-700/30'
                }`}
                onClick={() => handleTabSelect(tab.id)}
              >
                <span className="mr-2 flex items-center">
                  {tab.name}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center px-2 border-l border-gray-700/50 bg-gray-950">
            <div className="relative group">
              <button
                onClick={handleOpenAI}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-700/50 hover:bg-gray-600/50 transition-colors text-gray-300 hover:text-white"
                title="Open AI Help (⌘+I)"
                aria-pressed={isAIVisible}
              >
                <Bot size={16} className={isAIVisible ? 'text-blue-400' : 'text-gray-300'} />
              </button>
              <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                AI Help (⌘+I)
                <div className="absolute right-0 top-1/2 transform -translate-y-1/2 -mr-2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-gray-900"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="editor-container flex-1 min-h-0 relative">
          <div style={{
            display: openTabs.length > 0 ? 'block' : 'none',
            height: '100%'
          }}>
            {(() => {
              const activeFile = files.find(f => f.id === activeFileId);
              
              // Check if there are pending agent changes for this file
              const hasAgentChanges = pendingAgentChanges && activeFile;
              let agentFileType = '';
              let originalContent = '';
              let modifiedContent = '';
              
              if (hasAgentChanges) {
                // Look up content by fileId, not by type
                originalContent = pendingAgentChanges.original[activeFile.id] || '';
                modifiedContent = pendingAgentChanges.modified[activeFile.id] || '';
                agentFileType = activeFile.id; // Use fileId as the key for edited content too
                
                console.log('🔍 DiffEditor content lookup:', {
                  fileId: activeFile.id,
                  fileName: activeFile.name,
                  originalLength: originalContent.length,
                  modifiedLength: modifiedContent.length,
                  availableFileIds: {
                    original: Object.keys(pendingAgentChanges.original),
                    modified: Object.keys(pendingAgentChanges.modified)
                  },
                  editedContentLength: editedModifiedContent[agentFileType]?.length || 0
                });
              }
              
              // Only show diff if this file has pending changes (is in the modified list)
              const showDiff = hasAgentChanges && agentFileType && modifiedContent && 
                               pendingAgentChanges.modified && pendingAgentChanges.modified[activeFile.id];
              
              // Use edited content if available, otherwise use the original modified content
              // Make sure we're using the content for THIS file, not a stale one
              const currentModifiedContent = (agentFileType && editedModifiedContent[agentFileType]) || modifiedContent;
              
              if (showDiff) {
                return (
                  <div className="h-full flex flex-col relative">
                    <DiffEditor
                      height="100%"
                      language={getLanguageFromFileName(activeFile?.name || '')}
                      original={originalContent}
                      modified={currentModifiedContent}
                      onMount={(editor, monaco) => {
                        monaco.editor.setTheme('vs-dark');
                        onEditorMount(editor, monaco);

                        if (agentFileType) {
                          diffEditorsRef.current[agentFileType] = editor;
                        }
                        
                        // Track changes to the modified content and apply them in real-time
                        let disposeListener: (() => void) | null = null;
                        if (editor.getModifiedEditor && !readOnly) {
                          const modifiedEditor = editor.getModifiedEditor();
                          
                          const listener = modifiedEditor.onDidChangeModelContent(() => {
                            const content = modifiedEditor.getValue();
                            // Use agentFileType from the closure at the time of mount
                            // This will be updated when the DiffEditor re-mounts for a different file
                            console.log('📝 DiffEditor content changed:', {
                              fileId: activeFile?.id,
                              agentFileType,
                              contentLength: content.length
                            });
                            setEditedModifiedContent(prev => ({
                              ...prev,
                              [agentFileType]: content
                            }));
                            
                            // Apply the changes to the file in real-time
                            // Note: We don't call updateFileContent because we're tracking in editedModifiedContent
                            // Instead, getCurrentFileContent will return editedModifiedContent content
                          });
                          disposeListener = () => listener.dispose();
                        }
                        
                        // Return cleanup function
                        return () => {
                          if (disposeListener) {
                            disposeListener();
                          }
                          if (agentFileType && diffEditorsRef.current[agentFileType] === editor) {
                            delete diffEditorsRef.current[agentFileType];
                          }
                        };
                      }}
                      key={`diff-${activeFileId}`}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 14,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        automaticLayout: true,
                        readOnly: readOnly,
                        cursorBlinking: 'blink',
                        cursorSmoothCaretAnimation: 'on',
                        smoothScrolling: true,
                        mouseWheelZoom: true,
                        contextmenu: true,
                        selectOnLineNumbers: true,
                        roundedSelection: false,
                        renderLineHighlight: 'line',
                        folding: true,
                        foldingStrategy: 'indentation',
                        showFoldingControls: 'always',
                        bracketPairColorization: { enabled: true },
                        guides: {
                          indentation: true,
                        },
                        renderSideBySide: false,
                        enableSplitViewResizing: false,
                      }}
                    />
                    {/* Accept/Reject buttons */}
                    <div className="absolute bottom-4 right-4 flex gap-2 z-10">
                      <button
                        onClick={() => {
                          // Restore the original content for this file
                          if (activeFile && updateFileContent) {
                            updateFileContent(activeFile.id, originalContent);
                            setCode(originalContent);
                          }
                          // Clear edited content and agent changes for this file type
                          setEditedModifiedContent(prev => {
                            const newState = { ...prev };
                            delete newState[agentFileType];
                            return newState;
                          });
                          // Clear agent changes from parent
                          if (onRejectAgentChanges) {
                            onRejectAgentChanges();
                          }
                        }}
                        className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white transition-colors flex items-center gap-2"
                      >
                        <X size={16} />
                        Reject
                      </button>
                      <button
                        onClick={() => {
                          console.log('✅ Accept clicked:', {
                            activeFileId: activeFile?.id,
                            agentFileType,
                            contentLength: currentModifiedContent.length,
                            hasEdit: !!editedModifiedContent[agentFileType]
                          });
                          
                          // Accept the changes for this file and persist them
                          if (activeFile) {
                            const fileId = activeFile.id;
                            const acceptedContent = currentModifiedContent;

                            updateFileContent(fileId, acceptedContent);

                            // Ensure Monaco editor reflects the accepted content immediately
                            setCode(acceptedContent);

                            // Clear edited content for this file
                            setEditedModifiedContent(prev => {
                              const next = { ...prev };
                              delete next[fileId];
                              return next;
                            });

                            // Notify parent so diff view can be cleared for this file
                            if (onAcceptAgentChanges) {
                              onAcceptAgentChanges(agentFileType, acceptedContent);
                            }
                          }
                        }}
                        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
                      >
                        <Check size={16} />
                        Accept
                      </button>
                    </div>
                  </div>
                );
              }
              
              return (
                <MonacoEditor
                  height="100%"
                  language={getLanguageFromFileName(activeFile?.name || '')}
                  value={code}
                  onChange={(value) => {
                    setCode(value || '');
                    // Track file modification for unsaved indicator
                    if (activeFile) {
                      handleFileContentChange(activeFile.id, value || '');
                    }
                  }}
                  onMount={(editor, monaco) => {
                    // Set up the editor with proper theme and configuration
                    monaco.editor.setTheme('vs-dark');
                    liveMonacoEditorRef.current = editor;
                    onEditorMount(editor, monaco);
                  }}
                  options={{
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    automaticLayout: true,
                    readOnly: readOnly,
                    theme: 'vs-dark',
                    cursorBlinking: 'blink',
                    cursorSmoothCaretAnimation: 'on',
                    smoothScrolling: true,
                    mouseWheelZoom: true,
                    contextmenu: true,
                    selectOnLineNumbers: true,
                    roundedSelection: false,
                    renderLineHighlight: 'line',
                    folding: true,
                    foldingStrategy: 'indentation',
                    showFoldingControls: 'always',
                    bracketPairColorization: { enabled: true },
                    guides: {
                      indentation: true,
                    },
                  }}
                />
              );
            })()}
          </div>
          {openTabs.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">No files open</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiFileEditor;