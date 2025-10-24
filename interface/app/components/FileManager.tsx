"use client";
import React, { useState, useRef } from 'react';
import { 
  BsFileEarmarkCode, 
  BsFileEarmarkText, 
  BsFileEarmark, 
  BsFolderPlus, 
  BsFilePlus, 
  BsTrash3, 
  BsPencilSquare,
  BsChevronRight,
  BsChevronDown,
  BsFolder,
  BsFolder2Open
} from 'react-icons/bs';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
  isOpen?: boolean;
  parent?: string;
}

interface FileManagerProps {
  files: FileNode[];
  activeFileId: string | null;
  onFileSelect: (fileId: string) => void;
  onFileCreate: (name: string, type: 'file' | 'folder', parentId?: string) => void;
  onFileDelete: (fileId: string) => void;
  onFileRename: (fileId: string, newName: string) => void;
  onFileContentChange: (fileId: string, content: string) => void;
  onFolderToggle: (folderId: string) => void;
  readOnly?: boolean;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

const FileManager: React.FC<FileManagerProps> = ({
  files,
  activeFileId,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
  onFileContentChange,
  onFolderToggle,
  readOnly = false,
  onToggleSidebar,
  isSidebarOpen = true,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string;
    type: 'file' | 'folder' | 'root';
  } | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState<{
    type: 'file' | 'folder';
    parentId?: string;
  } | null>(null);

  const getFileIcon = (fileName: string, type: 'file' | 'folder') => {
    if (type === 'folder') {
      return <BsFolder className="w-5 h-5" />;
    }
    
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'py':
        return <BsFileEarmarkCode className="w-5 h-5 text-green-400" />;
      case 'js':
      case 'jsx':
        return <BsFileEarmarkCode className="w-5 h-5 text-yellow-400" />;
      case 'ts':
      case 'tsx':
        return <BsFileEarmarkCode className="w-5 h-5 text-blue-400" />;
      case 'html':
        return <BsFileEarmarkCode className="w-5 h-5 text-orange-400" />;
      case 'css':
        return <BsFileEarmarkCode className="w-5 h-5 text-blue-300" />;
      case 'json':
        return <BsFileEarmarkText className="w-5 h-5 text-yellow-300" />;
      case 'md':
        return <BsFileEarmarkText className="w-5 h-5 text-gray-400" />;
      default:
        return <BsFileEarmark className="w-5 h-5 text-gray-400" />;
    }
  };

  const getLanguageFromFileName = (fileName: string): string => {
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
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      default:
        return 'plaintext';
    }
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string, type: 'file' | 'folder' | 'root') => {
    e.preventDefault();
    if (readOnly) return;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      fileId,
      type,
    });
  };

  const handleCreateFile = () => {
    if (newFileName.trim()) {
      const parentId = showCreateDialog?.parentId;
      onFileCreate(newFileName.trim(), showCreateDialog!.type, parentId);
      setShowCreateDialog(null);
      setNewFileName('');
    }
  };

  const handleRename = () => {
    if (newFileName.trim() && renamingFile) {
      onFileRename(renamingFile, newFileName.trim());
      setRenamingFile(null);
      setNewFileName('');
    }
  };

  const renderFileNode = (file: FileNode, depth: number = 0, hideText: boolean = false) => {
    const isActive = activeFileId === file.id;
    const isRenaming = renamingFile === file.id;

    return (
      <div key={file.id}>
        <div
          className={`file-node w-full flex items-center ${hideText ? 'justify-center' : ''} h-8 leading-none cursor-pointer hover:bg-gray-700 relative group ${
            isActive ? 'bg-gray-600' : ''
          }`}
          onClick={() => file.type === 'file' ? onFileSelect(file.id) : onFolderToggle(file.id)}
          onContextMenu={(e) => handleContextMenu(e, file.id, file.type)}
          aria-label={hideText ? file.name : undefined}
        >
          {/* Fixed icon column to keep icon position stable across states */}
          <div className={`flex items-center justify-center flex-shrink-0 ${hideText ? 'w-full' : 'w-10'}`}>
            {getFileIcon(file.name, file.type)}
          </div>

          {/* Text/chevron column only visible when expanded */}
          {!hideText ? (
            <div className="flex-1 min-w-0 flex items-center gap-2 pr-2">
              {file.type === 'folder' && (
                <span className="flex-shrink-0">
                  {file.isOpen ? <BsChevronDown className="w-3 h-3" /> : <BsChevronRight className="w-3 h-3" />}
                </span>
              )}
              {isRenaming ? (
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') {
                      setRenamingFile(null);
                      setNewFileName('');
                    }
                  }}
                  className="bg-gray-600 text-white px-1 py-0 text-sm border-none outline-none flex-1 min-w-0"
                  autoFocus
                />
              ) : (
                <span className="text-sm text-gray-200 flex-1 min-w-0 truncate">{file.name}</span>
              )}
            </div>
          ) : null}

          {hideText && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
              {file.name}
            </div>
          )}
        </div>
        {file.type === 'folder' && file.isOpen && file.children && !hideText && (
          <div>
            {file.children.map(child => renderFileNode(child, depth + 1, hideText))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="file-manager bg-gray-950 border-r border-b border-gray-700/50 h-full flex flex-col">
      <div className={`border-b border-gray-700/50 py-[7.5px] ${isSidebarOpen ? 'px-0' : 'px-1'}`}>
        <div className={`flex items-center w-full ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          <div className={`flex items-center`}>
            {onToggleSidebar && (
              <div
                className={`relative inline-flex items-center justify-center flex-shrink-0 cursor-pointer ${isSidebarOpen ? 'w-10 h-6' : 'w-full h-6'}`}
                onClick={onToggleSidebar}
              >
                <BsFolder className={`peer h-5 w-5 ${isSidebarOpen ? 'text-blue-400' : 'text-gray-400'}`} />
                {!isSidebarOpen && (
                  <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
                    Show Files (⌘B)
                  </div>
                )}
              </div>
            )}
            <h3 className={`ml-2 text-sm font-semibold text-gray-200 ${!isSidebarOpen ? 'hidden' : ''}`}>Files (⌘B)</h3>
          </div>
          {!readOnly && (
            <div className={`flex gap-1 ${!isSidebarOpen ? 'hidden' : ''}`}>
              <button
                onClick={() => setShowCreateDialog({ type: 'file' })}
                className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors"
                title="New File"
              >
                <BsFilePlus className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={() => setShowCreateDialog({ type: 'folder' })}
                className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors"
                title="New Folder"
              >
                <BsFolderPlus className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`file-tree flex-1 ${isSidebarOpen ? 'py-2' : 'py-1'}`}>
        {files.map(file => renderFileNode(file, 0, !isSidebarOpen))}
      </div>

      {/* Create File/Folder Dialog */}
      {showCreateDialog && !readOnly && (
        <div className="py-2 px-3 border-t border-gray-700">
          <input
            type="text"
            placeholder={`New ${showCreateDialog.type} name`}
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile();
              if (e.key === 'Escape') {
                setShowCreateDialog(null);
                setNewFileName('');
              }
            }}
            className="w-full bg-gray-700 text-white px-2 py-1 text-sm border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            autoFocus
          />
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && !readOnly && (
        <div
          className="fixed bg-gray-700 border border-gray-600 rounded shadow-lg z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={() => setContextMenu(null)}
        >
          <div className="py-1">
            {contextMenu.type === 'file' && (
              <>
                <button
                  className="w-full px-3 py-1 text-left text-sm text-gray-200 hover:bg-gray-600 flex items-center gap-2"
                  onClick={() => {
                    setRenamingFile(contextMenu.fileId);
                    setNewFileName('');
                    setContextMenu(null);
                  }}
                >
                  <BsPencilSquare className="w-3 h-3" />
                  Rename
                </button>
                <button
                  className="w-full px-3 py-1 text-left text-sm text-red-400 hover:bg-gray-600 flex items-center gap-2"
                  onClick={() => {
                    onFileDelete(contextMenu.fileId);
                    setContextMenu(null);
                  }}
                >
                  <BsTrash3 className="w-3 h-3" />
                  Delete
                </button>
              </>
            )}
            {contextMenu.type === 'folder' && (
              <>
                <button
                  className="w-full px-3 py-1 text-left text-sm text-gray-200 hover:bg-gray-600 flex items-center gap-2"
                  onClick={() => {
                    setShowCreateDialog({ type: 'file', parentId: contextMenu.fileId });
                    setContextMenu(null);
                  }}
                >
                  <BsFilePlus className="w-3 h-3" />
                  New File
                </button>
                <button
                  className="w-full px-3 py-1 text-left text-sm text-gray-200 hover:bg-gray-600 flex items-center gap-2"
                  onClick={() => {
                    setShowCreateDialog({ type: 'folder', parentId: contextMenu.fileId });
                    setContextMenu(null);
                  }}
                >
                  <BsFolderPlus className="w-3 h-3" />
                  New Folder
                </button>
                <button
                  className="w-full px-3 py-1 text-left text-sm text-red-400 hover:bg-gray-600 flex items-center gap-2"
                  onClick={() => {
                    onFileDelete(contextMenu.fileId);
                    setContextMenu(null);
                  }}
                >
                  <BsTrash3 className="w-3 h-3" />
                  Delete
                </button>
              </>
            )}
            {contextMenu.type === 'root' && (
              <>
                <button
                  className="w-full px-3 py-1 text-left text-sm text-gray-200 hover:bg-gray-600 flex items-center gap-2"
                  onClick={() => {
                    setShowCreateDialog({ type: 'file' });
                    setContextMenu(null);
                  }}
                >
                  <BsFilePlus className="w-3 h-3" />
                  New File
                </button>
                <button
                  className="w-full px-3 py-1 text-left text-sm text-gray-200 hover:bg-gray-600 flex items-center gap-2"
                  onClick={() => {
                    setShowCreateDialog({ type: 'folder' });
                    setContextMenu(null);
                  }}
                >
                  <BsFolderPlus className="w-3 h-3" />
                  New Folder
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;
