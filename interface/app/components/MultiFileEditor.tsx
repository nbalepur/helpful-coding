"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import FileManager, { FileNode } from './FileManager';
import { Bot, Check, X, ChevronRight } from 'lucide-react';

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
  onRejectAgentChanges?: (actionType?: 'keep_all' | 'reject_all') => void;
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
  // Use a ref to track the last task index to detect task changes (not just remounts)
  const lastTaskIndexRef = useRef<number | null>(null);
  const [files, setFiles] = useState<FileNode[]>(initialFiles && initialFiles.length > 0 ? initialFiles : []);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [openTabs, setOpenTabs] = useState<Array<{ id: string; fileId: string; name: string }>>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [showFileManager, setShowFileManager] = useState(true);
  const [highlightedFileId, setHighlightedFileId] = useState<string>('');
  
  // Track edited modified content in diff view
  const [editedModifiedContent, setEditedModifiedContent] = useState<Record<string, string>>({});
  
  // Helper function to check if a file has actual diffs
  const fileHasDiffs = useCallback((fileId: string): boolean => {
    if (!pendingAgentChanges || !pendingAgentChanges.original || !pendingAgentChanges.modified) {
      return false;
    }
    
    const original = pendingAgentChanges.original[fileId] || '';
    const modified = editedModifiedContent[fileId] || pendingAgentChanges.modified[fileId] || '';
    
    return original !== modified;
  }, [pendingAgentChanges, editedModifiedContent]);
  
  // Get list of file IDs that have diffs
  const getFilesWithDiffs = useCallback((): string[] => {
    if (!pendingAgentChanges || !pendingAgentChanges.modified) {
      return [];
    }
    
    return Object.keys(pendingAgentChanges.modified).filter(fileId => fileHasDiffs(fileId));
  }, [pendingAgentChanges, fileHasDiffs]);
  
  const handleFileSelect = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.type !== 'file') return;

    setActiveFileId(fileId);
    
    // Add to open tabs if not already open
    setOpenTabs(prev => {
      const existingTab = prev.find(tab => tab.fileId === fileId);
      if (!existingTab) {
        const newTab = {
          id: `tab_${fileId}`,
          fileId: fileId,
          name: file.name
        };
        return [...prev, newTab];
      }
      return prev;
    });
    
    setActiveTab(`tab_${fileId}`);
  }, [files]);
  
  const revealLocationInEditor = useCallback((fileId: string, line?: number, column?: number, attempt: number = 0) => {
    const MAX_ATTEMPTS = 8;
    const requestedLine = Math.round(typeof line === 'number' && Number.isFinite(line) ? line : 1);
    const requestedColumn = Math.round(typeof column === 'number' && Number.isFinite(column) ? column : NaN);

    const hasPending = !!(pendingAgentChanges && pendingAgentChanges.modified && pendingAgentChanges.modified[fileId]);
    const diffEditor = diffEditorsRef.current[fileId];
    const modifiedEditor = diffEditor?.getModifiedEditor?.();
    const baseEditor = editorsRef.current[fileId];
    const editorInstance = hasPending && modifiedEditor ? modifiedEditor : baseEditor;

    if (!editorInstance) {
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => revealLocationInEditor(fileId, requestedLine, requestedColumn, attempt + 1), 80);
      }
      return;
    }

    let effectiveLine = Math.max(1, requestedLine || 1);
    let effectiveColumn = requestedColumn;

    try {
      const model = typeof editorInstance.getModel === 'function' ? editorInstance.getModel() : null;
      if (model) {
        const lineCount = typeof model.getLineCount === 'function' ? model.getLineCount() : null;
        if (typeof lineCount === 'number' && Number.isFinite(lineCount)) {
          effectiveLine = Math.min(Math.max(1, effectiveLine), lineCount);
        }
        const maxColumn = typeof model.getLineMaxColumn === 'function' ? model.getLineMaxColumn(effectiveLine) : null;
        if (typeof maxColumn === 'number' && Number.isFinite(maxColumn)) {
          if (!Number.isFinite(effectiveColumn) || effectiveColumn <= 0) {
            effectiveColumn = maxColumn;
          } else {
            effectiveColumn = Math.min(Math.max(1, effectiveColumn), maxColumn);
          }
        } else if (!Number.isFinite(effectiveColumn) || effectiveColumn <= 0) {
          effectiveColumn = 1;
        }
      } else if (!Number.isFinite(effectiveColumn) || effectiveColumn <= 0) {
        effectiveColumn = 1;
      }
    } catch (error) {
      console.error('Failed to compute line/column for reveal:', error);
      if (!Number.isFinite(effectiveColumn) || effectiveColumn <= 0) {
        effectiveColumn = 1;
      }
    }

    try {
      if (typeof editorInstance.revealPositionInCenter === 'function') {
        editorInstance.revealPositionInCenter({ lineNumber: effectiveLine, column: effectiveColumn });
      } else if (typeof editorInstance.revealLineInCenter === 'function') {
        editorInstance.revealLineInCenter(effectiveLine);
      }

      if (typeof editorInstance.setPosition === 'function') {
        editorInstance.setPosition({ lineNumber: effectiveLine, column: effectiveColumn });
      }

      if (typeof editorInstance.focus === 'function') {
        editorInstance.focus();
      }
    } catch (error) {
      console.error('Failed to reveal location in editor:', error);
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => revealLocationInEditor(fileId, requestedLine, requestedColumn, attempt + 1), 120);
      }
    }
  }, [pendingAgentChanges]);

  // Navigate to next file with diffs
  const navigateToNextFileWithDiffs = useCallback(() => {
    const filesWithDiffs = getFilesWithDiffs();
    if (filesWithDiffs.length === 0) return;
    
    const currentIndex = filesWithDiffs.indexOf(activeFileId);
    const nextIndex = (currentIndex + 1) % filesWithDiffs.length;
    const nextFileId = filesWithDiffs[nextIndex];
    
    if (nextFileId) {
      handleFileSelect(nextFileId);
    }
  }, [activeFileId, getFilesWithDiffs, handleFileSelect]);
  
  // Navigate to previous file with diffs
  const navigateToPreviousFileWithDiffs = useCallback(() => {
    const filesWithDiffs = getFilesWithDiffs();
    if (filesWithDiffs.length === 0) return;
    
    const currentIndex = filesWithDiffs.indexOf(activeFileId);
    const prevIndex = currentIndex === 0 ? filesWithDiffs.length - 1 : currentIndex - 1;
    const prevFileId = filesWithDiffs[prevIndex];
    
    if (prevFileId) {
      handleFileSelect(prevFileId);
    }
  }, [activeFileId, getFilesWithDiffs, handleFileSelect]);

  // Listen for global navigate-next-file requests (fired from page-level Cmd/Ctrl+N)
  useEffect(() => {
    const handleNavigateNext = () => {
      const filesWithDiffs = getFilesWithDiffs();
      const isDiffViewActive = !!(pendingAgentChanges && pendingAgentChanges.modified && activeFileId && pendingAgentChanges.modified[activeFileId]);
      const hasNextCandidate = filesWithDiffs.length > 0;
      if (!isDiffViewActive || !hasNextCandidate) return;
      navigateToNextFileWithDiffs();
    };

    window.addEventListener('navigate-next-file', handleNavigateNext as EventListener);
    return () => {
      window.removeEventListener('navigate-next-file', handleNavigateNext as EventListener);
    };
  }, [activeFileId, pendingAgentChanges, getFilesWithDiffs, navigateToNextFileWithDiffs]);

  // Local capture listener for next file shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      try {
        const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
        const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey;
        const isKeyN = (e.key === 'n' || e.key === 'N' || (e as any).code === 'KeyN');
        const isCmdN = metaOrCtrl && !e.shiftKey && !e.altKey && isKeyN;
        const isCmdAltN = metaOrCtrl && e.altKey && !e.shiftKey && isKeyN;
        // Treat pressing the second modifier (Cmd/Ctrl + Shift) as the trigger
        const isModifierOnlyCombo = (
          metaOrCtrl && e.shiftKey && !e.altKey && (
            e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' ||
            (e as any).code === 'ShiftLeft' || (e as any).code === 'ShiftRight' ||
            (e as any).code === 'MetaLeft' || (e as any).code === 'MetaRight' ||
            (e as any).code === 'ControlLeft' || (e as any).code === 'ControlRight'
          )
        );
        if (!isCmdN && !isCmdAltN && !isModifierOnlyCombo) return;

        const filesWithDiffs = getFilesWithDiffs();
        const isDiffViewActive = !!(pendingAgentChanges && pendingAgentChanges.modified && activeFileId && pendingAgentChanges.modified[activeFileId]);
        const hasNextCandidate = filesWithDiffs.length > 0;
        if (!isDiffViewActive || !hasNextCandidate) return;

        e.preventDefault();
        e.stopPropagation();
        navigateToNextFileWithDiffs();
      } catch {}
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('keydown', onKeyDown as any, { capture: true } as any);
    return () => {
      window.removeEventListener('keydown', onKeyDown as any, { capture: true } as any);
      document.removeEventListener('keydown', onKeyDown as any, { capture: true } as any);
    };
  }, [activeFileId, pendingAgentChanges, getFilesWithDiffs, navigateToNextFileWithDiffs]);

  // Track the live Monaco editor instance for the active file
  const liveMonacoEditorRef = useRef<any>(null);
  const editorsRef = useRef<Record<string, any>>({});
  const diffEditorsRef = useRef<Record<string, any>>({});

  // Update files when initialFiles change (async loading)
  // Only reset if this is a new task (taskIndex changed), not just a remount
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      // Check if task has changed by comparing taskIndex
      const taskChanged = taskIndex !== lastTaskIndexRef.current;
      if (taskChanged) {
        // Task changed - reset to initial files
        setFiles(initialFiles);
        lastTaskIndexRef.current = taskIndex;

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
      }
      // If task hasn't changed, don't reset - preserve user's edits
    } else {
      // No files provided; reset state
      setFiles([]);
      setOpenTabs([]);
      setActiveFileId('');
      setActiveTab('');
      lastTaskIndexRef.current = null;
    }
  }, [initialFiles, taskIndex]);

  // Don't automatically open any files on mount - keep them closed

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

  // Listen for external tab highlight/select events from assistant tool messages
  useEffect(() => {
    const onHighlight = (e: Event) => {
      try {
        const ce = e as CustomEvent<{ fileName?: string }>;
        const name = String(ce.detail?.fileName || '').toLowerCase();
        if (!name) { setHighlightedFileId(''); return; }
        const target = files.find(f => f.type === 'file' && f.name.toLowerCase() === name);
        setHighlightedFileId(target?.id || '');
      } catch { setHighlightedFileId(''); }
    };
    const onUnhighlight = () => setHighlightedFileId('');
    const onSelect = (e: Event) => {
      try {
        const ce = e as CustomEvent<{ fileName?: string }>;
        const name = String(ce.detail?.fileName || '').toLowerCase();
        if (!name) return;
        const target = files.find(f => f.type === 'file' && f.name.toLowerCase() === name);
        if (target) handleFileSelect(target.id);
      } catch {}
    };
    window.addEventListener('editor-highlight-tab', onHighlight as EventListener);
    window.addEventListener('editor-unhighlight-tab', onUnhighlight as EventListener);
    window.addEventListener('editor-select-file', onSelect as EventListener);
    return () => {
      window.removeEventListener('editor-highlight-tab', onHighlight as EventListener);
      window.removeEventListener('editor-unhighlight-tab', onUnhighlight as EventListener);
      window.removeEventListener('editor-select-file', onSelect as EventListener);
    };
  }, [files, handleFileSelect]);

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

  // Listen for external requests to update a file's modified content in diff view (e.g., new AI round)
  useEffect(() => {
    const onUpdateDiffModified = (e: Event) => {
      try {
        const ce = e as CustomEvent<{ fileId: string; content: string }>;        
        const fileId = ce.detail?.fileId;
        const content = ce.detail?.content ?? '';
        if (!fileId) return;

        // Update local edited state so DiffEditor shows the latest modified content
        setEditedModifiedContent(prev => ({ ...prev, [fileId]: String(content) }));

        // If the diff editor is currently mounted for this file, also update the Monaco model directly
        try {
          const diffEditor = diffEditorsRef.current[fileId];
          const mod = diffEditor?.getModifiedEditor?.();
          const model = mod?.getModel?.();
          if (mod && model && typeof mod.executeEdits === 'function') {
            mod.executeEdits('apply-new-ai-diff', [{ range: model.getFullModelRange(), text: String(content) }]);
          }
        } catch {}
      } catch {}
    };

    window.addEventListener('editor-update-diff-modified', onUpdateDiffModified as EventListener);
    return () => window.removeEventListener('editor-update-diff-modified', onUpdateDiffModified as EventListener);
  }, []);

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
  
  // Accept current file with diffs
  const acceptCurrentFile = useCallback(() => {
    if (!pendingAgentChanges || !activeFileId) return;
    
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return;
    
    const original = pendingAgentChanges.original[activeFileId] || '';
    const modified = editedModifiedContent[activeFileId] || pendingAgentChanges.modified[activeFileId] || '';
    
    if (original === modified) return; // No diffs
    
    // Apply changes through Monaco editor to preserve undo history
    // We always update the regular Monaco editor (not the diff editor)
    const editor = editorsRef.current[activeFileId];
    if (editor && editor.getModel && !readOnly) {
      const model = editor.getModel();
      if (model) {
        // Use pushEditOperations to apply changes as an undoable action
        editor.executeEdits('accept-ai-changes', [{
          range: model.getFullModelRange(),
          text: modified
        }]);
        
        // Update file state to match
        updateFileContent(activeFileId, modified);
        setCode(modified);
      }
    } else {
      // Fallback for read-only mode or if editor not available
      updateFileContent(activeFileId, modified);
      setCode(modified);
    }
    
    setEditedModifiedContent(prev => {
      const next = { ...prev };
      delete next[activeFileId];
      return next;
    });
    
    if (onAcceptAgentChanges) {
      onAcceptAgentChanges(activeFileId, modified);
    }
    
    // Navigate to next file with diffs if available; do not forcibly clear global state here
    const remainingFiles = getFilesWithDiffs().filter(id => id !== activeFileId);
    if (remainingFiles.length > 0) {
      setTimeout(() => navigateToNextFileWithDiffs(), 100);
    }
  }, [activeFileId, files, pendingAgentChanges, editedModifiedContent, setCode, onAcceptAgentChanges, getFilesWithDiffs, navigateToNextFileWithDiffs, readOnly]);
  
  // Reject current file with diffs
  const rejectCurrentFile = useCallback(() => {
    if (!pendingAgentChanges || !activeFileId) return;
    
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return;
    
    const original = pendingAgentChanges.original[activeFileId] || '';
    
    // Apply changes through Monaco editor to preserve undo history
    // We always update the regular Monaco editor (not the diff editor)
    const editor = editorsRef.current[activeFileId];
    if (editor && editor.getModel && !readOnly) {
      const model = editor.getModel();
      if (model) {
        // Use pushEditOperations to apply changes as an undoable action
        editor.executeEdits('reject-ai-changes', [{
          range: model.getFullModelRange(),
          text: original
        }]);
        
        // Update file state to match
        updateFileContent(activeFileId, original);
        setCode(original);
      }
    } else {
      // Fallback for read-only mode or if editor not available
      updateFileContent(activeFileId, original);
      setCode(original);
    }
    
    setEditedModifiedContent(prev => {
      const next = { ...prev };
      delete next[activeFileId];
      return next;
    });
    
    if (onAcceptAgentChanges) {
      onAcceptAgentChanges(activeFileId, original);
    }
    
    // Navigate to next file with diffs if available; do not forcibly clear global state here
    const remainingFiles = getFilesWithDiffs().filter(id => id !== activeFileId);
    if (remainingFiles.length > 0) {
      setTimeout(() => navigateToNextFileWithDiffs(), 100);
    }
  }, [activeFileId, files, pendingAgentChanges, setCode, onAcceptAgentChanges, getFilesWithDiffs, navigateToNextFileWithDiffs, readOnly]);
  
  // Accept all files with diffs
  const acceptAllFiles = useCallback(() => {
    const filesWithDiffs = getFilesWithDiffs();
    filesWithDiffs.forEach(fileId => {
      const file = files.find(f => f.id === fileId);
      if (!file) return;
      
      const original = pendingAgentChanges?.original[fileId] || '';
      const modified = editedModifiedContent[fileId] || pendingAgentChanges?.modified[fileId] || '';
      
      if (original !== modified) {
        // Apply changes through Monaco editor to preserve undo history
        const editor = editorsRef.current[fileId];
        if (editor && editor.getModel && !readOnly) {
          const model = editor.getModel();
          if (model) {
            // Use pushEditOperations to apply changes as an undoable action
            editor.executeEdits('accept-all-ai-changes', [{
              range: model.getFullModelRange(),
              text: modified
            }]);
          }
        }
        
        updateFileContent(fileId, modified);
        setEditedModifiedContent(prev => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
        if (onAcceptAgentChanges) {
          onAcceptAgentChanges(fileId, modified);
        }
      }
    });
    
    setEditedModifiedContent({});
    if (onRejectAgentChanges) {
      onRejectAgentChanges('keep_all');
    }
  }, [getFilesWithDiffs, files, pendingAgentChanges, editedModifiedContent, onAcceptAgentChanges, onRejectAgentChanges, readOnly]);
  
  // Reject all files with diffs
  const rejectAllFiles = useCallback(() => {
    const filesWithDiffs = getFilesWithDiffs();
    filesWithDiffs.forEach(fileId => {
      const file = files.find(f => f.id === fileId);
      if (!file) return;
      
      const original = pendingAgentChanges?.original[fileId] || '';
      
      // Apply changes through Monaco editor to preserve undo history
      const editor = editorsRef.current[fileId];
      if (editor && editor.getModel && !readOnly) {
        const model = editor.getModel();
        if (model) {
          // Use pushEditOperations to apply changes as an undoable action
          editor.executeEdits('reject-all-ai-changes', [{
            range: model.getFullModelRange(),
            text: original
          }]);
        }
      }
      
      updateFileContent(fileId, original);
      
      setEditedModifiedContent(prev => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      
      if (onAcceptAgentChanges) {
        onAcceptAgentChanges(fileId, original);
      }
    });
    
    setEditedModifiedContent({});
    if (onRejectAgentChanges) {
      onRejectAgentChanges('reject_all');
    }
  }, [getFilesWithDiffs, files, pendingAgentChanges, onAcceptAgentChanges, onRejectAgentChanges, readOnly]);

  // Keyboard shortcuts: Cmd/Ctrl + B toggles file sidebar, Cmd/Ctrl + S saves file
  // Cmd/Ctrl + 1/2/3 navigates to index.html/styles.css/frontend.js
  // Diff review shortcuts: Cmd+K/R (keep/reject file), Cmd+Enter/Delete (keep/reject all), Cmd+Left/Right (navigate)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      
      // Cmd/Ctrl + 1/2/3: Navigate to specific files
      if (isCmdOrCtrl && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        e.stopPropagation();
        
        // Map keyboard numbers to file names
        const fileMap: Record<string, string> = {
          '1': 'index.html',
          '2': 'styles.css',
          '3': 'frontend.js'
        };
        
        const targetFileName = fileMap[e.key];
        if (targetFileName) {
          // Find the file in the files list (case-insensitive)
          const targetFile = files.find(f => 
            f.type === 'file' && f.name.toLowerCase() === targetFileName.toLowerCase()
          );
          
          if (targetFile) {
            setActiveFileId(targetFile.id);
            
            // Add to open tabs if not already open
            const existingTab = openTabs.find(tab => tab.fileId === targetFile.id);
            if (!existingTab) {
              const newTab = {
                id: `tab_${targetFile.id}`,
                fileId: targetFile.id,
                name: targetFile.name
              };
              setOpenTabs(prev => [...prev, newTab]);
              setActiveTab(newTab.id);
            } else {
              setActiveTab(existingTab.id);
            }

            // After activating, focus the correct Monaco editor instance
            // Defer to allow React state updates to apply visibility
            setTimeout(() => {
              try {
                const hasPending = !!(pendingAgentChanges && pendingAgentChanges.modified && pendingAgentChanges.modified[targetFile.id]);
                if (hasPending) {
                  const diffEditor = diffEditorsRef.current[targetFile.id];
                  const modified = diffEditor?.getModifiedEditor?.();
                  if (modified && typeof modified.focus === 'function') {
                    modified.focus();
                    return;
                  }
                }
                const editor = editorsRef.current[targetFile.id];
                if (editor && typeof editor.focus === 'function') {
                  editor.focus();
                }
              } catch {}
            }, 0);
          }
        }
        return;
      }
      
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
      
      
      
      // Diff review shortcuts - only work when there are files with diffs
      const filesWithDiffs = getFilesWithDiffs();
      const hasFilesWithDiffs = filesWithDiffs.length > 0;
      
      if (hasFilesWithDiffs) {
        // Cmd/Ctrl + K: Keep current file
        if (isCmdOrCtrl && (e.key?.toLowerCase() === 'k' || e.code === 'KeyK')) {
          // Check if we're not in an input/textarea to avoid conflicts
          const target = e.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            e.stopPropagation();
            acceptCurrentFile();
            return;
          }
        }
        
        // Cmd/Ctrl + R: Reject current file
        if (isCmdOrCtrl && (e.key?.toLowerCase() === 'r' || e.code === 'KeyR')) {
          const target = e.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            e.stopPropagation();
            rejectCurrentFile();
            return;
          }
        }
        
        // Cmd/Ctrl + Enter: Accept all files
        if (isCmdOrCtrl && e.key === 'Enter') {
          const target = e.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            e.stopPropagation();
            acceptAllFiles();
            return;
          }
        }
        
        // Cmd/Ctrl + Delete/Backspace: Reject all files
        if (isCmdOrCtrl && (e.key === 'Delete' || e.key === 'Backspace')) {
          const target = e.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !(target as any).isContentEditable) {
            e.preventDefault();
            e.stopPropagation();
            rejectAllFiles();
            return;
          }
        }
        
        // Cmd/Ctrl + N: Next file with diffs
        if (isCmdOrCtrl && (e.key?.toLowerCase() === 'n' || e.code === 'KeyN')) {
          const target = e.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            e.stopPropagation();
            try { console.log('⌘N pressed: navigating to next file with diffs'); } catch(_) {}
            navigateToNextFileWithDiffs();
            return;
          }
        }
      }
    };
    
    // Use capture phase to intercept before browser default
    document.addEventListener('keydown', handleKeydown, true);
    return () => document.removeEventListener('keydown', handleKeydown, true);
  }, [openTabs, files, activeFileId, getFilesWithDiffs, acceptCurrentFile, rejectCurrentFile, acceptAllFiles, rejectAllFiles, navigateToPreviousFileWithDiffs, navigateToNextFileWithDiffs, onSaveShortcut]);

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
    selectFileByName: (fileName: string) => {
      try {
        const target = files.find(f => f.type === 'file' && f.name.toLowerCase() === String(fileName || '').toLowerCase());
        if (!target) return;
        handleFileSelect(target.id);
        // Focus appropriate editor after selecting
        setTimeout(() => {
          try {
            const hasPending = !!(pendingAgentChanges && pendingAgentChanges.modified && pendingAgentChanges.modified[target.id]);
            if (hasPending) {
              const diffEditor = diffEditorsRef.current[target.id];
              const modified = diffEditor?.getModifiedEditor?.();
              if (modified && typeof modified.focus === 'function') {
                modified.focus();
                return;
              }
            }
            const editor = editorsRef.current[target.id];
            if (editor && typeof editor.focus === 'function') {
              editor.focus();
            }
          } catch {}
        }, 0);
      } catch {}
    },
    revealLocation: (fileName: string, lineNumber?: number, columnNumber?: number, options?: { originalPath?: string; level?: string; message?: any; meta?: any }) => {
      try {
        const normalizedName = String(fileName || '').toLowerCase();
        if (!normalizedName) return;

        const candidates = files.filter(f => f.type === 'file');
        const targetExact = candidates.find(f => f.name.toLowerCase() === normalizedName);

        let target = targetExact;
        if (!target && options?.originalPath) {
          const originalLower = String(options.originalPath).toLowerCase();
          target = candidates.find(f => originalLower.endsWith(`/${f.name.toLowerCase()}`) || originalLower.endsWith(`\\${f.name.toLowerCase()}`));
        }

        if (!target) {
          target = candidates.find(f => f.name.toLowerCase().includes(normalizedName));
        }
        if (!target) return;

        handleFileSelect(target.id);

        const safeLine = typeof lineNumber === 'number' && Number.isFinite(lineNumber) ? lineNumber : undefined;
        const safeColumn = typeof columnNumber === 'number' && Number.isFinite(columnNumber) ? columnNumber : undefined;

        setTimeout(() => {
          revealLocationInEditor(target.id, safeLine, safeColumn);
        }, 60);
      } catch (error) {
        console.error('Failed to reveal file location:', error);
      }
    },
    getMonacoEditor: () => liveMonacoEditorRef.current,
  }), [files, activeFileId, code, editedModifiedContent, pendingAgentChanges, layoutAllEditors, clearDiffEditor, handleFileSelect, revealLocationInEditor]);

  // Keep active editor ref in sync when switching files
  useEffect(() => {
    try {
      const active = activeFileId ? editorsRef.current[activeFileId] : null;
      if (active) {
        liveMonacoEditorRef.current = active;
        active.layout?.();
      }
    } catch {}
  }, [activeFileId, editorHeight]);

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
            {openTabs.map(tab => {
              // Map file names to shortcut numbers
              const getShortcutNumber = (fileName: string): number | null => {
                const fileNameLower = fileName.toLowerCase();
                if (fileNameLower === 'index.html') return 1;
                if (fileNameLower === 'styles.css') return 2;
                if (fileNameLower === 'frontend.js') return 3;
                return null;
              };
              
              const shortcutNum = getShortcutNumber(tab.name);
              const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
              const cmdSymbol = isMac ? '⌘' : 'Ctrl';
              const hasDiffs = fileHasDiffs(tab.fileId);
              
              return (
                <div
                  key={tab.id}
                  className={`tab flex items-center px-3 text-sm cursor-pointer border-r border-gray-600/30 transition-all duration-200 ${
                    activeTab === tab.id 
                      ? 'text-white bg-gray-800/50 relative after:content-["\""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-blue-400'
                      : (highlightedFileId === tab.fileId ? 'text-white bg-gray-700/30' : 'bg-transparent text-gray-400 hover:text-white hover:bg-gray-700/30') + (highlightedFileId === tab.fileId ? ' translate-y-[-1px]' : '')
                  }`}
                  onClick={() => handleTabSelect(tab.id)}
                >
                  <span className="mr-2 flex items-center gap-1.5">
                    {tab.name}
                    {hasDiffs && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" title="Modified - needs review" />
                    )}
                  </span>
                  {shortcutNum !== null && (
                    <span className="ml-2 text-xs text-gray-500 opacity-70">
                      {cmdSymbol}+{shortcutNum}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center px-2 border-l border-gray-700/50 bg-gray-950">
            <div className="relative group">
              <button
                onClick={handleOpenAI}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-700/50 hover:bg-gray-600/50 transition-colors text-gray-300 hover:text-white"
                aria-pressed={isAIVisible}
              >
                <Bot size={16} className={isAIVisible ? 'text-blue-400' : 'text-gray-300'} />
              </button>
            <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 px-2 py-1 bg-white text-black text-xs rounded border border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                AI Help (⌘+B)
              </div>
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="editor-container flex-1 min-h-0 relative">
          <div style={{ height: '100%', position: 'relative' }}>
            {openTabs.map(tab => {
              const file = files.find(f => f.id === tab.fileId);
              const isActive = activeFileId === tab.fileId;
              const containerStyle: React.CSSProperties = { display: isActive ? 'block' : 'none', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
              const hiddenStyle: React.CSSProperties = { display: 'none', height: '100%' };

              // Diff view setup
              const hasAgentChanges = !!(pendingAgentChanges && file);
              const originalContent = hasAgentChanges ? (pendingAgentChanges?.original[file?.id || ''] || '') : '';
              const modifiedContentRaw = hasAgentChanges ? (pendingAgentChanges?.modified[file?.id || ''] || '') : '';
              const editedKey = file?.id || '';
              const currentModifiedContent = (editedKey && editedModifiedContent[editedKey]) || modifiedContentRaw;
              const showDiff = !!(hasAgentChanges && editedKey && modifiedContentRaw && pendingAgentChanges?.modified && pendingAgentChanges.modified[file!.id]);
              const hasActualDiffs = showDiff && fileHasDiffs(file!.id);
              const renderDiff = showDiff && hasActualDiffs;
              const filesWithDiffs = getFilesWithDiffs();

              // Return both editors with appropriate visibility
              return (
                <React.Fragment key={tab.fileId}>
                  {/* Diff Editor - shown only when there are actual diffs */}
                  {renderDiff ? (
                    <div style={renderDiff && isActive ? containerStyle : hiddenStyle} className="h-full flex flex-col relative">
                      <DiffEditor
                      height="100%"
                      language={getLanguageFromFileName(file?.name || '')}
                      original={originalContent}
                      modified={currentModifiedContent}
                      onMount={(editor, monaco) => {
                        monaco.editor.setTheme('vs-dark');
                        onEditorMount(editor, monaco);
                        if (editedKey) {
                          diffEditorsRef.current[editedKey] = editor;
                        }
                        const escapeDisposable = editor.addAction({
                          id: 'escape-to-unfocus-diff',
                          label: 'Escape to Unfocus',
                          keybindings: [monaco.KeyCode.Escape],
                          run: () => {
                            setTimeout(() => {
                              document.body.focus();
                              const editorContainer = editor.getContainerDomNode();
                              if (editorContainer) {
                                const textArea = editorContainer.querySelector('textarea');
                                if (textArea) {
                                  (textArea as HTMLElement).blur();
                                }
                                try {
                                  const modifiedEditor = editor.getModifiedEditor();
                                  if (modifiedEditor) {
                                    const modContainer = modifiedEditor.getContainerDomNode();
                                    if (modContainer) {
                                      const modTextArea = modContainer.querySelector('textarea');
                                      if (modTextArea) {
                                        (modTextArea as HTMLElement).blur();
                                      }
                                    }
                                  }
                                } catch {}
                              }
                            }, 0);
                          }
                        });
                        const hasFilesWithDiffs = getFilesWithDiffs().length > 0;
                        const keybindingDisposables: Array<{ dispose: () => void }> = [escapeDisposable];
                        if (hasFilesWithDiffs) {
                          keybindingDisposables.push(
                            editor.addAction({ id: 'acceptCurrentFile', label: 'Keep', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK], run: () => { acceptCurrentFile(); } })
                          );
                          keybindingDisposables.push(
                            editor.addAction({ id: 'rejectCurrentFile', label: 'Reject', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR], run: () => { rejectCurrentFile(); } })
                          );
                          keybindingDisposables.push(
                            editor.addAction({ id: 'acceptAllFiles', label: 'Keep All', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => { acceptAllFiles(); } })
                          );
                          keybindingDisposables.push(
                            editor.addAction({ id: 'rejectAllFiles', label: 'Reject All', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Delete], run: () => { rejectAllFiles(); } })
                          );
                          keybindingDisposables.push(
                            editor.addAction({ id: 'navigateToNextFile', label: 'Next File', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyN], run: () => { navigateToNextFileWithDiffs(); } })
                          );
                        }
                        let disposeListener: (() => void) | null = null;
                        if (editor.getModifiedEditor && !readOnly) {
                          const modifiedEditor = editor.getModifiedEditor();
                          const listener = modifiedEditor.onDidChangeModelContent(() => {
                            const content = modifiedEditor.getValue();
                            setEditedModifiedContent(prev => ({ ...prev, [editedKey]: content }));
                          });
                          disposeListener = () => listener.dispose();
                        }
                        return () => {
                          if (disposeListener) disposeListener();
                          keybindingDisposables.forEach(d => d.dispose());
                          if (editedKey && diffEditorsRef.current[editedKey] === editor) delete diffEditorsRef.current[editedKey];
                        };
                      }}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 12,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        automaticLayout: true,
                        readOnly: readOnly,
                        cursorBlinking: 'blink',
                        cursorSmoothCaretAnimation: 'off',
                        smoothScrolling: true,
                        mouseWheelZoom: true,
                        mouseWheelScrollSensitivity: 0.7,
                        contextmenu: true,
                        selectOnLineNumbers: true,
                        roundedSelection: false,
                        renderLineHighlight: 'line',
                        folding: true,
                        foldingStrategy: 'indentation',
                        showFoldingControls: 'always',
                        bracketPairColorization: { enabled: true },
                        guides: { indentation: true },
                        renderSideBySide: false,
                        enableSplitViewResizing: false,
                        padding: { top: 0, bottom: 100 },
                      }}
                    />
                    {isActive && renderDiff && (() => {
                      const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                      const cmdSymbol = isMac ? '⌘' : 'Ctrl';
                      return (
                        <div className="absolute bottom-4 left-2 right-2 flex justify-center z-10 pointer-events-none">
                          <div className="inline-flex flex-wrap items-center justify-center gap-1.5 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-1 shadow-lg max-w-full pointer-events-auto">
                            <button onClick={acceptCurrentFile} disabled={!hasActualDiffs} className="px-2.5 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
                              <Check size={12} />
                              Keep
                              <span className="ml-1 text-[10px] opacity-70">{cmdSymbol}+K</span>
                            </button>
                            <button onClick={rejectCurrentFile} disabled={!hasActualDiffs} className="px-2.5 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-700">
                              <X size={12} />
                              Reject
                              <span className="ml-1 text-[10px] opacity-70">{cmdSymbol}+R</span>
                            </button>
                            <div className="w-px h-4 bg-gray-600 mx-0.5" />
                            <button onClick={acceptAllFiles} className="px-2.5 py-1.5 text-xs rounded bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center gap-1.5" title="Keep All (⌘Enter)">
                              Keep All
                              <span className="ml-1 text-[10px] opacity-70">{cmdSymbol}+Enter</span>
                            </button>
                            <button onClick={rejectAllFiles} className="px-2.5 py-1.5 text-xs rounded bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1.5" title="Reject All (⌘Delete)">
                              Reject All
                              <span className="ml-1 text-[10px] opacity-70">{cmdSymbol}+Delete</span>
                            </button>
                            <div className="w-px h-4 bg-gray-600 mx-0.5" />
                            <button onClick={navigateToNextFileWithDiffs} disabled={filesWithDiffs.length === 1 && filesWithDiffs.includes(activeFileId)} className="px-2.5 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-700">
                              <ChevronRight size={12} />
                              Next File
                              <span className="ml-1 text-[10px] opacity-70">{cmdSymbol}+⇧</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  ) : null}
                  
                  {/* Regular Monaco Editor - shown when not in diff or no diffs remain */}
                  <div style={(!renderDiff && isActive) ? containerStyle : hiddenStyle} className="h-full">
                    <MonacoEditor
                    height="100%"
                    language={getLanguageFromFileName(file?.name || '')}
                    value={(file && typeof file.content === 'string') ? file.content : ''}
                    onChange={(value) => {
                      // Update file content
                      handleFileContentChange(tab.fileId, value || '');
                      if (isActive) setCode(value || '');
                    }}
                    onMount={(editor, monaco) => {
                      monaco.editor.setTheme('vs-dark');
                      editorsRef.current[tab.fileId] = editor;
                      if (isActive) {
                        liveMonacoEditorRef.current = editor;
                      }
                      onEditorMount(editor, monaco);
                      editor.addAction({
                        id: 'escape-to-unfocus',
                        label: 'Escape to Unfocus',
                        keybindings: [monaco.KeyCode.Escape],
                        run: () => {
                          setTimeout(() => {
                            document.body.focus();
                            const editorContainer = editor.getContainerDomNode();
                            if (editorContainer) {
                              const textArea = editorContainer.querySelector('textarea');
                              if (textArea) {
                                (textArea as HTMLElement).blur();
                              }
                            }
                          }, 0);
                        }
                      });
                    }}
                    options={{
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 12,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      automaticLayout: true,
                      readOnly: readOnly,
                      theme: 'vs-dark',
                      cursorBlinking: 'blink',
                      cursorSmoothCaretAnimation: 'off',
                      smoothScrolling: true,
                      mouseWheelZoom: true,
                      mouseWheelScrollSensitivity: 0.7,
                      contextmenu: true,
                      selectOnLineNumbers: true,
                      roundedSelection: false,
                      renderLineHighlight: 'line',
                      folding: true,
                      foldingStrategy: 'indentation',
                      showFoldingControls: 'always',
                      bracketPairColorization: { enabled: true },
                      guides: { indentation: true },
                      padding: { top: 0, bottom: 100 },
                    }}
                  />
                  </div>
                </React.Fragment>
              );
            })}
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