"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from './Editor';
import FileManager, { FileNode } from './FileManager';
import { BsX, BsFolder } from 'react-icons/bs';
import { Bot } from 'lucide-react';

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
  // File save callback
  onFileSave?: (fileId: string) => void;
  // Bubble content changes up to parent (for live preview)
  onContentChange?: () => void;
  // Assistant visibility (to style AI Help button)
  isAIAssistantVisible?: boolean;
}

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
  onFileSave,
  onContentChange,
  isAIAssistantVisible,
}: MultiFileEditorProps) => {
  const [isAIVisible, setIsAIVisible] = useState(false);
  const [files, setFiles] = useState<FileNode[]>(initialFiles && initialFiles.length > 0 ? initialFiles : []);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [openTabs, setOpenTabs] = useState<Array<{ id: string; fileId: string; name: string }>>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [showFileManager, setShowFileManager] = useState(true);
  const [savedFileContents, setSavedFileContents] = useState<Record<string, string>>({});
  const [contentUpdateTrigger, setContentUpdateTrigger] = useState(0);
  const [fileModificationTimes, setFileModificationTimes] = useState<Record<string, number>>({});

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

  // Keyboard shortcuts: Cmd/Ctrl + B toggles file sidebar, Cmd/Ctrl + W closes active tab, Cmd/Ctrl + S saves file
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      
      // Cmd/Ctrl + S: Save current file (fallback for Monaco command)
      if (isCmdOrCtrl && (e.key?.toLowerCase?.() === 's' || e.code === 'KeyS')) {
        e.preventDefault();
        e.stopPropagation();
        if (activeFileId) {
          saveFile(activeFileId);
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
      
      // Cmd/Ctrl + W: Close active tab
      if (isCmdOrCtrl && (e.key?.toLowerCase?.() === 'w' || e.code === 'KeyW')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (activeTab && openTabs.length > 0) {
          handleTabClose(activeTab);
        }
        return;
      }
    };
    
    // Use capture phase to intercept before browser default
    document.addEventListener('keydown', handleKeydown, true);
    return () => document.removeEventListener('keydown', handleKeydown, true);
  }, [activeTab, openTabs, activeFileId]);

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

  // Update code prop when active file changes
  useEffect(() => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (activeFile && activeFile.content !== code) {
      setCode(activeFile.content || '');
    } else if (!activeFileId || activeFileId === '') {
      // If no active file, set code to empty
      setCode('');
    }
  }, [activeFileId, files, setCode]);

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

  const handleFileCreate = (name: string, type: 'file' | 'folder', parentId?: string) => {
    const newId = generateId();
    const newFile: FileNode = {
      id: newId,
      name: name,
      type: type,
      content: type === 'file' ? '' : undefined,
      language: type === 'file' ? 'plaintext' : undefined,
      children: type === 'folder' ? [] : undefined,
      isOpen: type === 'folder' ? false : undefined,
      parent: parentId
    };

    if (parentId) {
      // Add to parent folder
      setFiles(prev => prev.map(file => {
        if (file.id === parentId && file.type === 'folder') {
          return {
            ...file,
            children: [...(file.children || []), newFile]
          };
        }
        return file;
      }));
    } else {
      // Add to root
      setFiles(prev => [...prev, newFile]);
    }

    // If it's a file, open it
    if (type === 'file') {
      handleFileSelect(newId);
    }
  };

  const handleFileDelete = (fileId: string) => {
    // Remove from open tabs
    const tabToRemove = openTabs.find(tab => tab.fileId === fileId);
    if (tabToRemove) {
      const newOpenTabs = openTabs.filter(tab => tab.fileId !== fileId);
      setOpenTabs(newOpenTabs);
      
      // If this was the active tab, switch to another tab
      if (activeTab === tabToRemove.id) {
        if (newOpenTabs.length > 0) {
          setActiveTab(newOpenTabs[0].id);
          setActiveFileId(newOpenTabs[0].fileId);
        } else {
          setActiveTab('');
          setActiveFileId('');
        }
      }
    }

    // Remove from files
    setFiles(prev => prev.filter(file => {
      if (file.id === fileId) return false;
      if (file.type === 'folder' && file.children) {
        return {
          ...file,
          children: file.children.filter(child => child.id !== fileId)
        };
      }
      return true;
    }));
  };

  const handleFileRename = (fileId: string, newName: string) => {
    setFiles(prev => prev.map(file => {
      if (file.id === fileId) {
        return { ...file, name: newName };
      }
      if (file.type === 'folder' && file.children) {
        return {
          ...file,
          children: file.children.map(child => 
            child.id === fileId ? { ...child, name: newName } : child
          )
        };
      }
      return file;
    }));

    // Update open tabs
    setOpenTabs(prev => prev.map(tab => 
      tab.fileId === fileId ? { ...tab, name: newName } : tab
    ));
  };

  const handleFileContentChange = (fileId: string, content: string) => {
    // Track when this file was last modified
    setFileModificationTimes(prev => ({
      ...prev,
      [fileId]: Date.now()
    }));

    setFiles(prev => prev.map(file => {
      if (file.id === fileId) {
        return { ...file, content };
      }
      if (file.type === 'folder' && file.children) {
        return {
          ...file,
          children: file.children.map(child => 
            child.id === fileId ? { ...child, content } : child
          )
        };
      }
      return file;
    }));

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

  // Initialize saved file contents when files are loaded
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
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

      const flattened = flattenFiles(initialFiles);
      const initialSavedContents: Record<string, string> = {};
      const initialModificationTimes: Record<string, number> = {};
      flattened.forEach(file => {
        initialSavedContents[file.id] = file.content || '';
        // Initialize all files as "saved" (modification time = 0)
        initialModificationTimes[file.id] = 0;
      });
      setSavedFileContents(initialSavedContents);
      setFileModificationTimes(initialModificationTimes);
    }
  }, [initialFiles]);

  // Function to get current content of a file from the editor
  const getCurrentFileContent = (fileId: string): string => {
    if (actualEditorRef?.current?.getAllFileContents) {
      const allContents = actualEditorRef.current.getAllFileContents();
      return allContents[fileId] || '';
    }
    return '';
  };

  // Function to check if a file has unsaved changes
  const isFileUnsaved = (fileId: string) => {
    // Get the modification time for this file
    const lastModified = fileModificationTimes[fileId];
    
    // If modification time is 0 or undefined, file is saved (not modified since load)
    // Modification time > 0 means the file has been edited
    if (lastModified === undefined || lastModified === 0) {
      return false;
    }
    
    // File has been modified since it was loaded
    return true;
  };

  // Function to save the current content of a file
  const saveFile = (fileId: string) => {
    try {
      const currentContent = getCurrentFileContent(fileId);
      const savedContent = savedFileContents[fileId] || '';
      
      // Update the saved content state
      setSavedFileContents(prev => ({
        ...prev,
        [fileId]: currentContent
      }));

      // Reset the modification time since file is now saved
      setFileModificationTimes(prev => ({
        ...prev,
        [fileId]: 0 // 0 means saved
      }));
      
      // Call the onFileSave callback to trigger endpoint refresh and preview update
      if (onFileSave) {
        onFileSave(fileId);
      }
    } catch (error) {
      console.error('Error saving file:', fileId, error);
    }
  };

  // Function to trigger content update check
  const triggerContentUpdate = () => {
    setContentUpdateTrigger(prev => prev + 1);
  };

  // Periodically check for content changes to update white dots
  useEffect(() => {
    const interval = setInterval(() => {
      triggerContentUpdate();
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="multi-file-editor h-full flex min-h-0">
      {/* File Manager Sidebar */}
      <div className={`file-manager-sidebar transition-all duration-300 ${showFileManager ? 'w-40' : 'w-12'} flex flex-col flex-shrink-0 min-h-0`}>
        <FileManager
          files={files}
          activeFileId={activeFileId}
          onFileSelect={handleFileSelect}
          onFileCreate={handleFileCreate}
          onFileDelete={handleFileDelete}
          onFileRename={handleFileRename}
          onFileContentChange={handleFileContentChange}
          onFolderToggle={handleFolderToggle}
          readOnly={readOnly}
          onToggleSidebar={() => setShowFileManager(!showFileManager)}
          isSidebarOpen={showFileManager}
        />
      </div>

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
                {isFileUnsaved(tab.fileId) ? (
                  <div 
                    className="ml-1 w-3 h-3 flex items-center justify-center cursor-pointer group/close"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabClose(tab.id);
                    }}
                  >
                    <span className="w-2 h-2 bg-white rounded-full opacity-80 group-hover/close:opacity-0 transition-opacity"></span>
                    <BsX 
                      className="w-4 h-4 absolute opacity-0 group-hover/close:opacity-100 hover:text-red-400 transition-opacity"
                    />
                  </div>
                ) : (
                  <BsX 
                    className="ml-1 w-3 h-3 cursor-pointer hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabClose(tab.id);
                    }}
                  />
                )}
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
        <div className="editor-container flex-1 min-h-0">
          <div style={{
            display: openTabs.length > 0 ? 'block' : 'none',
            height: '100%'
          }}>
            <Editor
              onEditorMount={onEditorMount}
              contextLength={contextLength}
              wait_time_for_sug={wait_time_for_sug}
              setSuggestionIdx={setSuggestionIdx}
              setTelemetry={setTelemetry}
              modelAutocomplete={modelAutocomplete}
              taskIndex={taskIndex}
              setLogprobsCompletion={setLogprobsCompletion}
              logProbs={logProbs}
              suggestionIdx={suggestionIdx}
              messageAIIndex={messageAIIndex}
              setIsSpinning={setIsSpinning}
              proactive_refresh_time_inactive={proactive_refresh_time_inactive}
              chatRef={chatRef}
              code={code}
              setCode={setCode}
              ref={actualEditorRef}
              files={files}
              activeFileId={activeFileId}
              onFileContentChange={handleFileContentChange}
              enableMultiFile={true}
              onFileSave={saveFile}
              onContentChange={triggerContentUpdate}
            />
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