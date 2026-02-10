"use client";

import React, { useState, useCallback, useImperativeHandle, forwardRef, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import CodingEditor from "../editor/CodingEditor";
import AssistantTerminalPane, { AssistantItem } from "../editor/AssistantTerminalPane";
import SubmissionsGallery from "../submissions/SubmissionsPlaceholder";
import { ENV } from "../../config/env";
import { ERROR_TRY_AGAIN } from "../../constants/errorMessages";
import { MessageData } from "../../utils/messageTypes";
import { cloneFileNodes, flattenFileNodes, determineLanguageKey, defaultFileName } from "../../utils/fileTree";
import { useEditorHistory, type CodeSnapshot } from "../../hooks/useEditorHistory";
import { useAssistantChat } from "../../hooks/useAssistantChat";
import { isFunctionTaskLabel } from "../../utils/taskLabels";

export type RightTabId = "code" | "submissions";
export type LeftTabId = "task" | "preview" | "submissions" | "project-details";

/** Agent changes: diff state for AI-edited files (original vs modified) */
export interface PendingAgentChanges {
  original: Record<string, string>;
  modified: Record<string, string>;
  summary?: string;
  steps?: string[];
}

export interface CodeAndSubmissionsPaneAgentChangesApi {
  pendingAgentChanges: PendingAgentChanges | null;
  onAcceptAgentChanges: (fileId?: string, content?: string) => void;
  onRejectAgentChanges: (actionType?: "keep_all" | "reject_all") => void;
}

/** Ref handle for page (e.g. beacon log needs getCodeByLanguage when editor is in this pane) */
export interface CodeAndSubmissionsPaneRef {
  getCodeByLanguage: () => Record<string, string> | null;
  actualEditorRef: React.RefObject<any>;
  getFileMetadata: () => Record<string, { name: string; language?: string }>;
  getAiCodeLoadedTimestamp: () => number | null;
  clearAssistantState: () => void;
  focusAssistantInput: () => void;
}

function tooltipPositionFromEvent(e: React.MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const margin = 8;
  const left = Math.min(Math.max(rect.left + rect.width / 2, margin), vw - margin);
  const placeAbove = rect.top >= 40 || rect.top > vh - rect.bottom;
  const top = placeAbove ? rect.top : rect.bottom;
  return { left, top, placeAbove };
}

export interface CodeAndSubmissionsPaneProps {
  rightTab: RightTabId;
  setRightTab: (tab: RightTabId) => void;
  leftTab: LeftTabId;
  setLeftTab: (tab: LeftTabId) => void;
  isTutorialMode: boolean;
  isViewSubmissionsUnlocked: boolean;
  viewSubmissionsTooltip: string;
  isMac: boolean;
  onDownload: () => void;
  onSubmitClick: () => void;
  /** When true, Submit button is disabled (e.g. function task until all tests pass or give-up time elapsed). */
  isSubmitDisabled?: boolean;
  pendingAgentChanges: PendingAgentChanges | null;
  setPendingAgentChanges: React.Dispatch<React.SetStateAction<PendingAgentChanges | null>>;
  sendCodeLog: (event: string, context?: Record<string, any>) => void | Promise<void>;
  previewTabRef: React.RefObject<{ refreshPreview: () => void } | null>;
  /** Right pane owns editor; page passes these for shared concerns */
  currentFiles: any[];
  onCurrentFilesChange: (files: any[]) => void;
  initialFiles: any[];
  isLoadingFiles: boolean;
  selectedTask: string | null;
  showCodingTerminal: boolean;
  isPreviewVisible: boolean;
  /** Task/context for editor and assistant */
  taskId: string;
  currentTaskMeta: { id: string; name?: string; projectId?: number } | null;
  taskLabel?: string | null;
  numericUserId: number | null;
  user: { id: string; can_view_submissions?: boolean } | null;
  expCondition: string;
  responseId: string;
  workerId: string;
  taskIndex: number;
  setTaskIndex: React.Dispatch<React.SetStateAction<number>>;
  functionSignatures: string[];
  modelAutocomplete: string;
  sidebarOpen: boolean;
  assistantPlacement: "bottom" | "side";
  setAssistantPlacement: (p: "bottom" | "side") => void;
  showAIAssistant: boolean;
  setShowAIAssistant: (v: boolean) => void;
  editorHeight: number;
  onEditorMouseDown: (e: React.MouseEvent) => void;
  messages: MessageData[];
  setMessages: React.Dispatch<React.SetStateAction<MessageData[]>>;
  chatRef: React.RefObject<any>;
  onProjectSubmitted: () => void | Promise<void>;
  onProjectInfoChange: (title: string, description: string) => void;
  showCodeEditor: boolean;
  setShowCodeEditor: (v: boolean) => void;
  setShowTerminal: (v: boolean) => void;
  onRefReady?: () => void;
}

const tabBaseClass =
  "text-sm font-medium transition-all duration-200 relative bg-transparent hover:bg-transparent focus:bg-transparent active:bg-transparent border-none outline-none py-2 after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px hover:-translate-y-0.5";
const tabActiveClass = "text-blue-400 after:bg-blue-400 after:opacity-100 cursor-default";
const tabInactiveClass =
  "text-gray-400 hover:text-blue-400 after:bg-blue-400 after:opacity-0 hover:after:opacity-100";

const CodeAndSubmissionsPane = forwardRef<CodeAndSubmissionsPaneRef, CodeAndSubmissionsPaneProps>(function CodeAndSubmissionsPane({
  rightTab,
  setRightTab,
  leftTab,
  setLeftTab,
  isTutorialMode,
  isViewSubmissionsUnlocked,
  viewSubmissionsTooltip,
  isMac,
  onDownload,
  onSubmitClick,
  isSubmitDisabled = false,
  pendingAgentChanges,
  setPendingAgentChanges,
  sendCodeLog,
  previewTabRef,
  currentFiles,
  onCurrentFilesChange,
  initialFiles,
  isLoadingFiles,
  selectedTask,
  showCodingTerminal,
  isPreviewVisible,
  taskId,
  currentTaskMeta,
  taskLabel,
  numericUserId,
  user,
  expCondition,
  responseId,
  workerId,
  taskIndex,
  setTaskIndex,
  functionSignatures,
  modelAutocomplete,
  sidebarOpen,
  assistantPlacement,
  setAssistantPlacement,
  showAIAssistant,
  setShowAIAssistant,
  editorHeight,
  onEditorMouseDown,
  messages,
  setMessages,
  chatRef,
  onProjectSubmitted,
  onProjectInfoChange,
  showCodeEditor,
  setShowCodeEditor,
  setShowTerminal,
  onRefReady,
}, ref) {
  const [tooltip, setTooltip] = useState({ visible: false, text: "", left: 0, top: 0, placeAbove: true });
  const [code, setCode] = useState("");
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [logProbs, setLogProbs] = useState<any>(null);
  const [messageAIIndex, setMessageAIIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);

  const editorRef = useRef<any>(null);
  const actualEditorRef = useRef<any>(null);
  const fileMetadataRef = useRef<Record<string, { name: string; language?: string }>>({});

  const getCodeByLanguage = useCallback((): Record<string, string> | null => {
    const editorApi = actualEditorRef?.current;
    if (!editorApi || typeof editorApi.getAllFileContents !== "function") return null;
    try {
      const contents: Record<string, string> = editorApi.getAllFileContents() || {};
      const metadataMap = fileMetadataRef.current || {};
      const result: Record<string, string> = {};
      Object.entries(contents).forEach(([fileId, content]) => {
        const meta = metadataMap[fileId] || { name: fileId };
        const key = determineLanguageKey(meta.language, meta.name || fileId);
        if (key) result[key] = typeof content === "string" ? content : String(content ?? "");
      });
      return Object.keys(result).length > 0 ? result : null;
    } catch (e) {
      console.warn("Failed to collect code by language", e);
      return null;
    }
  }, []);

  const buildCodeByLanguageFromState = useCallback((codeState: Record<string, string>) => {
    const metadataMap = fileMetadataRef.current || {};
    const result: Record<string, string> = {};
    Object.entries(codeState || {}).forEach(([fileId, content]) => {
      const meta = metadataMap[fileId] || { name: fileId };
      const key = determineLanguageKey(meta.language, meta.name || fileId);
      if (key) result[key] = typeof content === "string" ? content : String(content ?? "");
    });
    return Object.keys(result).length > 0 ? result : null;
  }, []);

  const getFileMetadata = useCallback(() => ({ ...(fileMetadataRef.current || {}) }), []);

  const assistantChat = useAssistantChat({
    isTutorialMode,
    taskId,
    currentTaskMeta,
    numericUserId,
    sendCodeLog,
    getCodeByLanguage,
    previewTabRef,
    setPendingAgentChanges,
    pendingAgentChanges,
  });
  const {
    assistantMessages,
    setAssistantMessages,
    assistantInputValue,
    setAssistantInputValue,
    awaitingResponse,
    setAwaitingResponse,
    awaitingManualSuggestions,
    setAwaitingManualSuggestions,
    summaryGenerated,
    setSummaryGenerated,
    assistantMessagesRef,
    assistantAbortControllerRef,
    filesModifiedInCurrentInteractionRef,
    latestSuggestionsRef,
    aiCodeLoadedTimestampRef,
    assistantTerminalPaneRef,
    onAcceptAgentChanges,
    onRejectAgentChanges,
    handleSuggestionSelection,
    clearAssistantState: clearAssistantStateFromHook,
  } = assistantChat;

  const getAiCodeLoadedTimestamp = useCallback(() => aiCodeLoadedTimestampRef.current, []);

  const {
    history,
    historyIndex,
    setHistory,
    setHistoryIndex,
    saveSnapshot,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
  } = useEditorHistory({
    actualEditorRef,
    previewTabRef,
    setPendingAgentChanges,
    sendCodeLog,
    assistantMessagesRef,
    setAssistantMessages,
    buildCodeByLanguageFromState,
  });

  const clearAssistantState = useCallback(() => {
    try {
      actualEditorRef.current?.clearDiffEditor?.();
    } catch (_) {}
    clearAssistantStateFromHook();
  }, [clearAssistantStateFromHook]);

  const focusAssistantInput = useCallback(() => {
    try {
      assistantTerminalPaneRef.current?.focusInput?.();
    } catch (_) {}
  }, []);

  useImperativeHandle(ref, () => {
    onRefReady?.();
    return {
      getCodeByLanguage,
      actualEditorRef,
      getFileMetadata,
      getAiCodeLoadedTimestamp,
      clearAssistantState,
      focusAssistantInput,
    };
  }, [getCodeByLanguage, getFileMetadata, getAiCodeLoadedTimestamp, clearAssistantState, focusAssistantInput, onRefReady]);

  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor;
  }, []);

  const handleSaveShortcut = useCallback((_fileId?: string) => {
    void sendCodeLog("save-shortcut");
    if (!isPreviewVisible) return;
    try { previewTabRef.current?.refreshPreview(); } catch (e) { console.warn("Failed to refresh preview on save shortcut:", e); }
  }, [sendCodeLog, isPreviewVisible, previewTabRef]);

  const handleFileContentChange = useCallback(() => {
    const editorApi = actualEditorRef?.current;
    if (!editorApi || typeof editorApi.getAllFileContents !== "function") return;
    try {
      const contents: Record<string, string> = editorApi.getAllFileContents() || {};
      const applyContents = (nodes: any[]): any[] =>
        nodes.map(node => {
          if (!node) return node;
          if (node.type === "file") {
            const key = node.id || node.name;
            const nextContent = key != null ? contents[key] ?? node.content ?? "" : node.content ?? "";
            return { ...node, content: nextContent };
          }
          if (Array.isArray(node.children)) return { ...node, children: applyContents(node.children) };
          return { ...node };
        });
      const source = (currentFiles && currentFiles.length > 0) ? currentFiles : cloneFileNodes(initialFiles);
      onCurrentFilesChange(applyContents(source));
      const metadataMap = { ...fileMetadataRef.current };
      Object.entries(contents).forEach(([fileId]) => {
        if (!metadataMap[fileId]) {
          metadataMap[fileId] = { name: fileId, language: determineLanguageKey(undefined, fileId) || undefined };
        }
      });
      fileMetadataRef.current = metadataMap;
    } catch (e) {
      console.warn("Failed to synchronize file contents from editor", e);
    }
  }, [currentFiles, initialFiles, onCurrentFilesChange]);

  const handleAssistantSubmit = useCallback(async (message: string) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    const createMessageId = () => `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const appendMessage = (item: AssistantItem) => {
      setAssistantMessages(prev => [...prev, { ...item, id: item.id ?? createMessageId() }]);
    };
    const updateMessage = (id: string, updates: Partial<AssistantItem>) => {
      setAssistantMessages(prev => prev.map(msg => (msg.id === id ? { ...msg, ...updates } : msg)));
    };

    setAssistantMessages(prev => prev.filter(msg => msg.type !== "suggestions"));
    setSummaryGenerated(false);
    latestSuggestionsRef.current = [];
    appendMessage({ type: "user", message: trimmedMessage });
    setAwaitingResponse(true);
    setAssistantInputValue("");

    const files: Record<string, string> = {};
    const fileIdsByType: Record<string, string> = {};
    const fileIdsByFileName: Record<string, string> = {};
    const fileNamesByType: Record<string, string> = {};
    let allContents: Record<string, string> = {};

    if (actualEditorRef?.current?.getAllFileContents) {
      allContents = actualEditorRef.current.getAllFileContents();
      Object.entries(allContents).forEach(([fileId, content]) => {
        const file = currentFiles.find((f: any) => f.id === fileId || f.name === fileId);
        const fileNameRaw = file?.name || fileId || "";
        const fileName = fileNameRaw.toLowerCase();
        const contentStr = String(content || "");
        files[fileNameRaw] = contentStr;
        fileIdsByFileName[fileNameRaw] = fileId;
        fileIdsByFileName[fileName] = fileId;
        if (fileName === "index.html") {
          fileIdsByType["html"] = fileId;
          fileNamesByType["html"] = fileNameRaw;
        } else if (fileName === "styles.css") {
          fileIdsByType["css"] = fileId;
          fileNamesByType["css"] = fileNameRaw;
        } else if (fileName === "frontend.js") {
          fileIdsByType["js"] = fileId;
          fileNamesByType["js"] = fileNameRaw;
        }
      });
    }

    filesModifiedInCurrentInteractionRef.current = new Set();
    const toolMessageIds = new Map<string, string>();
    const pendingToolMessageIds: string[] = [];
    const completedToolMessages = new Set<string>();
    let finalPayload: any = null;
    let filesWereEdited = false;
    const modifiedFilesDuringStream: Record<string, string> = {};
    let hadEditFileToolCallEdits = false;
    let snapshotSaved = false;
    let wasAborted = false;

    try {
      const controller = new AbortController();
      assistantAbortControllerRef.current = controller;
      const response = await fetch(`${ENV.BACKEND_URL}/api/agent-execution/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedMessage,
          files,
          taskId: taskId || currentTaskMeta?.id || null,
          taskName: currentTaskMeta?.name || null,
          userId: numericUserId,
          skipSuggestions: isFunctionTaskLabel(taskLabel),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Failed to start agent stream");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming response not supported");

      const decoder = new TextDecoder();
      let buffer = "";

      const maybeHandleChunk = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;
        let payload: any;
        try {
          payload = JSON.parse(line);
        } catch {
          return;
        }
        const event = payload?.event;
        const metadata = payload?.metadata ?? {};

        switch (event) {
          case "text": {
            const content = payload?.content;
            if (content != null && String(content).trim() !== "") {
              const isError = metadata?.is_error === true;
              const message = isError ? `Error: ${content} ${ERROR_TRY_AGAIN}` : content;
              appendMessage({ type: "assistant", message });
              if (payload?.is_final) {
                setSummaryGenerated(true);
                const currentMessages = [...assistantMessagesRef.current];
                const summaryMessageId = createMessageId();
                const summaryMessage: AssistantItem = { id: summaryMessageId, type: "assistant", message };
                const allToolMessageIds = new Set(Array.from(toolMessageIds.values()));
                const updatedMessages = currentMessages.map((msg) => {
                  if (msg.id && allToolMessageIds.has(msg.id) && !completedToolMessages.has(msg.id)) {
                    completedToolMessages.add(msg.id);
                    return { ...msg, status: "done" as const };
                  }
                  return msg;
                });
                const messagesWithSummary = [...updatedMessages, summaryMessage];
                toolMessageIds.forEach((msgId) => {
                  if (msgId && !completedToolMessages.has(msgId)) updateMessage(msgId, { status: "done" });
                });
                if (!snapshotSaved && Object.keys(modifiedFilesDuringStream).length > 0) {
                  const codeStateFromStream: Record<string, string> = {};
                  if (actualEditorRef?.current?.getAllFileContents) {
                    const currentState = actualEditorRef.current.getAllFileContents();
                    Object.entries(currentState).forEach(([fileId, content]) => { codeStateFromStream[fileId] = String(content); });
                  }
                  Object.entries(modifiedFilesDuringStream).forEach(([fileId, content]) => { codeStateFromStream[fileId] = content; });
                  saveSnapshot(messagesWithSummary, codeStateFromStream);
                  snapshotSaved = true;
                } else if (!snapshotSaved && finalPayload?.final_files && Object.keys(finalPayload.final_files).length > 0) {
                  const codeStateFromFinalFiles: Record<string, string> = {};
                  const resolveFileId = (fn: string) =>
                    fileIdsByFileName[fn] ?? fileIdsByFileName[fn.toLowerCase()] ?? fileIdsByType[
                      fn.toLowerCase().endsWith(".html") ? "html" : fn.toLowerCase().endsWith(".css") ? "css" : (fn.toLowerCase().endsWith(".js") && !fn.toLowerCase().endsWith(".json")) ? "js" : ""
                    ];
                  Object.entries(finalPayload.final_files).forEach(([filename, content]) => {
                    const fileId = resolveFileId(filename);
                    if (fileId && typeof content === "string") codeStateFromFinalFiles[fileId] = content;
                  });
                  if (actualEditorRef?.current?.getAllFileContents) {
                    const currentState = actualEditorRef.current.getAllFileContents();
                    Object.entries(currentState).forEach(([fileId, content]) => {
                      if (!codeStateFromFinalFiles[fileId]) codeStateFromFinalFiles[fileId] = String(content);
                    });
                  }
                  saveSnapshot(messagesWithSummary, codeStateFromFinalFiles);
                  snapshotSaved = true;
                }
              }
            }
            break;
          }
          case "tool_call": {
            const status = payload?.status;
            const toolName = payload?.tool_name ?? "Tool";
            const toolType = payload?.tool_type;
            if (toolType === "edit_file") {
              if (status === "in_progress") {
                const id = createMessageId();
                const key = metadata?.filename ?? toolName;
                toolMessageIds.set(key, id);
                pendingToolMessageIds.push(id);
                appendMessage({ id, type: "tool", message: toolName, fileName: metadata?.filename ?? toolName, status: "pending" });
              } else if (status === "finished") {
                const messageId = pendingToolMessageIds.shift();
                if (messageId) {
                  completedToolMessages.add(messageId);
                  filesWereEdited = true;
                  const additions = metadata?.additions ?? 0;
                  const deletions = metadata?.deletions ?? 0;
                  updateMessage(messageId, { status: "done", diff: { additions, deletions } });
                }
                const targetFiles: string[] = Array.isArray(metadata?.target_files) ? metadata.target_files : [];
                const filename: string | undefined = metadata?.filename;
                const updatedContent: string | undefined = metadata?.updated_content;
                if (targetFiles.length > 0 && updatedContent) {
                  setTimeout(() => {
                    try {
                      previewTabRef.current?.refreshPreview();
                      void sendCodeLog("AI-refresh", { refreshSource: "tool_call", targetFiles, filename });
                    } catch (_) {}
                  }, 100);
                }
                if (filename && typeof updatedContent === "string") {
                  const lower = filename.toLowerCase();
                  const fileId = fileIdsByFileName[filename] ?? fileIdsByFileName[lower] ?? fileIdsByType[
                    lower === "index.html" || lower.endsWith("index.html") || lower.endsWith(".html") ? "html" :
                    lower === "styles.css" || lower.endsWith("styles.css") || lower.endsWith(".css") ? "css" :
                    (lower === "frontend.js" || lower.endsWith("frontend.js") || (lower.endsWith(".js") && !lower.endsWith(".json"))) ? "js" : ""
                  ];
                  if (fileId) {
                    hadEditFileToolCallEdits = true;
                    modifiedFilesDuringStream[fileId] = updatedContent;
                    filesModifiedInCurrentInteractionRef.current.add(fileId);
                    const originalContent = (allContents && typeof allContents[fileId] === "string") ? allContents[fileId] : (currentFiles.find((f: any) => f.id === fileId)?.content ?? "");
                    setPendingAgentChanges((prev: any) => {
                      const next = { original: { ...(prev?.original || {}) }, modified: { ...(prev?.modified || {}) }, summary: prev?.summary, steps: prev?.steps } as any;
                      const baseOriginal = prev?.original?.[fileId] != null ? String(prev.original[fileId]) : String(originalContent ?? "");
                      next.original[fileId] = baseOriginal;
                      next.modified[fileId] = String(updatedContent);
                      return next;
                    });
                    try { window.dispatchEvent(new CustomEvent("editor-update-diff-modified", { detail: { fileId, content: String(updatedContent) } })); } catch (_) {}
                    if (actualEditorRef?.current?.updateFileContent) actualEditorRef.current.updateFileContent(fileId, String(updatedContent));
                  }
                }
              }
            }
            break;
          }
          case "suggestions": {
            const suggestions: string[] = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
            if (suggestions.length) {
              latestSuggestionsRef.current = suggestions;
              appendMessage({ type: "suggestions", suggestions });
            }
            break;
          }
          default:
            if (payload?.final_files && Object.keys(payload.final_files).length > 0) {
              finalPayload = payload;
            }
            break;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(maybeHandleChunk);
      }
      if (buffer) maybeHandleChunk(buffer);

      toolMessageIds.forEach((msgId) => {
        if (msgId && !completedToolMessages.has(msgId)) updateMessage(msgId, { status: "failed" });
      });
    } catch (error: any) {
      console.error("Error during agent stream:", error);
      toolMessageIds.forEach((msgId) => {
        if (msgId && !completedToolMessages.has(msgId)) updateMessage(msgId, { status: "failed" });
      });
      if (error?.name === "AbortError") {
        wasAborted = true;
        appendMessage({ type: "system", message: "Stopped coding" });
        try {
          setAssistantInputValue(trimmedMessage);
          setTimeout(() => { assistantTerminalPaneRef.current?.focusInput?.(); }, 0);
        } catch (_) {}
      } else {
        appendMessage({ type: "assistant", message: `Error: ${(error as Error).message} ${ERROR_TRY_AGAIN}` });
      }
    } finally {
      setAwaitingResponse(false);
      assistantAbortControllerRef.current = null;
      if (!wasAborted) {
        if (filesWereEdited) {
          try { setAssistantInputValue(""); } catch (_) {}
        } else {
          try {
            setAssistantInputValue(trimmedMessage);
            setTimeout(() => { assistantTerminalPaneRef.current?.focusInput?.(); }, 0);
          } catch (_) {}
        }
      }
    }

    if (finalPayload && finalPayload.final_files && Object.keys(finalPayload.final_files).length > 0) {
      if (hadEditFileToolCallEdits) {
        // Edits were already applied via edit_file tool_call events; don't overwrite editor or pendingAgentChanges.
        // Only attach summary/steps to existing pendingAgentChanges. (Other tool_call types do not count.)
        filesWereEdited = true;
        setPendingAgentChanges((prev: any) =>
          prev ? { ...prev, summary: finalPayload.summary, steps: finalPayload.steps ?? [] } : null
        );
      } else {
        // No edit_file tool_call edits received (e.g. other tool types only, or edge case); apply final_files to editor and set pendingAgentChanges.
        filesWereEdited = true;
        const originalFiles: Record<string, string> = {};
        const modifiedFilesByFileId: Record<string, string> = {};
        const codeStateFromFinalFiles: Record<string, string> = {};
        const resolveFileId = (filename: string): string | undefined =>
          fileIdsByFileName[filename] ?? fileIdsByFileName[filename.toLowerCase()] ?? fileIdsByType[
            filename.toLowerCase().endsWith(".html") ? "html" :
            filename.toLowerCase().endsWith(".css") ? "css" :
            (filename.toLowerCase().endsWith(".js") && !filename.toLowerCase().endsWith(".json")) ? "js" : ""
          ];
        Object.entries(finalPayload.final_files).forEach(([filename, modifiedContent]) => {
          const fileId = resolveFileId(filename);
          if (fileId && typeof modifiedContent === "string") {
            filesModifiedInCurrentInteractionRef.current.add(fileId);
            const originalContent = (allContents && typeof allContents[fileId] === "string") ? allContents[fileId] : (currentFiles.find((f: any) => f.id === fileId)?.content ?? "");
            const priorOriginal = pendingAgentChanges?.original?.[fileId];
            originalFiles[fileId] = priorOriginal != null ? String(priorOriginal) : String(originalContent ?? "");
            modifiedFilesByFileId[fileId] = modifiedContent;
            codeStateFromFinalFiles[fileId] = modifiedContent;
            try { window.dispatchEvent(new CustomEvent("editor-update-diff-modified", { detail: { fileId, content: String(modifiedContent) } })); } catch (_) {}
          }
        });

        if (Object.keys(modifiedFilesByFileId).length > 0) {
          aiCodeLoadedTimestampRef.current = Date.now();
          setPendingAgentChanges({
            original: originalFiles,
            modified: modifiedFilesByFileId,
            summary: finalPayload.summary,
            steps: finalPayload.steps,
          });
          Object.entries(modifiedFilesByFileId).forEach(([fileId, content]) => {
            if (actualEditorRef?.current?.updateFileContent) actualEditorRef.current.updateFileContent(fileId, String(content));
          });
          if (!snapshotSaved) {
            if (actualEditorRef?.current?.getAllFileContents) {
              const currentState = actualEditorRef.current.getAllFileContents();
              Object.entries(currentState).forEach(([fileId, content]) => {
                if (!codeStateFromFinalFiles[fileId]) codeStateFromFinalFiles[fileId] = String(content);
              });
            }
            saveSnapshot(undefined, codeStateFromFinalFiles);
          }
        }
      }
    }
  }, [
    isTutorialMode,
    currentFiles,
    taskId,
    taskLabel,
    currentTaskMeta,
    numericUserId,
    saveSnapshot,
    sendCodeLog,
    previewTabRef,
  ]);

  useEffect(() => {
    if (!showCodingTerminal || !selectedTask) {
      try {
        actualEditorRef.current?.clearDiffEditor?.();
      } catch (_) {}
      clearAssistantStateFromHook();
    }
  }, [showCodingTerminal, selectedTask, clearAssistantStateFromHook]);

  useEffect(() => {
    const metadataMap: Record<string, { name: string; language?: string }> = {};
    flattenFileNodes(initialFiles).forEach((node: any) => {
      if (node && node.type === "file") {
        const key = node.id || node.name;
        if (key) metadataMap[key] = { name: node.name || key, language: node.language };
      }
    });
    fileMetadataRef.current = metadataMap;
  }, [initialFiles]);

  useEffect(() => {
    if (initialFiles.length > 0 && !isLoadingFiles && actualEditorRef?.current?.getAllFileContents) {
      const hasContent = initialFiles.some((f: any) => f?.content && String(f.content).trim().length > 0);
      if (!hasContent) return;
      const timer = setTimeout(() => {
        try {
          const initialCodeState = actualEditorRef.current.getAllFileContents();
          const codeStateEntries = Object.entries(initialCodeState);
          const hasActualContent = codeStateEntries.some(([, content]) => content && String(content).trim().length > 0);
          if (hasActualContent && codeStateEntries.length > 0) {
            const initialSnapshot: CodeSnapshot = {
              codeState: { ...initialCodeState },
              messages: [],
              timestamp: Date.now(),
            };
            setHistory([initialSnapshot]);
            setHistoryIndex(0);
          }
        } catch (e) {
          console.error("Failed to save initial snapshot", e);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialFiles, isLoadingFiles]);

  const findFirstDifferenceLine = useCallback((original: string, modified: string): number | null => {
    if (!original || !modified) return null;
    const originalLines = original.split("\n");
    const modifiedLines = modified.split("\n");
    const maxLength = Math.max(originalLines.length, modifiedLines.length);
    for (let i = 0; i < maxLength; i++) {
      if ((originalLines[i] || "") !== (modifiedLines[i] || "")) return i + 1;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!summaryGenerated || !pendingAgentChanges || !actualEditorRef.current) return;
    const editorApi = actualEditorRef.current;
    if (!editorApi.selectFileByName || !editorApi.revealLocation || !editorApi.getActiveFileId) return;
    const filesModifiedInCurrentInteraction = Array.from(filesModifiedInCurrentInteractionRef.current);
    const filesWithChanges = filesModifiedInCurrentInteraction.filter((fileId: string) => {
      const original = pendingAgentChanges.original?.[fileId] || "";
      const modified = pendingAgentChanges.modified?.[fileId] || "";
      return original !== modified;
    });
    if (filesWithChanges.length === 0) return;
    const activeFileId = editorApi.getActiveFileId();
    let targetFileId: string | null = null;
    let targetFile: any = null;
    let didSwitch = false;
    if (!activeFileId || !filesWithChanges.includes(activeFileId)) {
      targetFileId = filesWithChanges[filesWithChanges.length - 1];
      targetFile = currentFiles.find((f: any) => f.id === targetFileId);
      if (targetFile) {
        editorApi.selectFileByName(targetFile.name);
        didSwitch = true;
      }
    } else {
      targetFileId = activeFileId;
      targetFile = currentFiles.find((f: any) => f.id === targetFileId);
    }
    if (!targetFile || !targetFileId) return;
    const original = pendingAgentChanges.original?.[targetFileId] || "";
    const modified = pendingAgentChanges.modified?.[targetFileId] || "";
    const firstDiffLine = findFirstDifferenceLine(original, modified);
    if (firstDiffLine != null) {
      setTimeout(() => {
        editorApi.revealLocation(targetFile.name, firstDiffLine, 1, { scrollOnly: true });
      }, didSwitch ? 300 : 100);
    }
  }, [summaryGenerated, pendingAgentChanges, currentFiles, findFirstDifferenceLine]);

  const showTooltip = useCallback((e: React.MouseEvent, text: string) => {
    const { left, top, placeAbove } = tooltipPositionFromEvent(e);
    setTooltip({ visible: true, text, left, top, placeAbove });
  }, []);
  const hideTooltip = useCallback(() => setTooltip((t) => ({ ...t, visible: false })), []);

  const handleCodeTabClick = () => {
    setRightTab("code");
    hideTooltip();
    if (leftTab === "project-details") {
      setLeftTab("task");
    }
  };

  const handleSubmissionsTabClick = () => {
    setRightTab("submissions");
    hideTooltip();
  };

  return (
    <div className="bg-gray-900 h-full flex-1 min-w-0 box-border overflow-hidden px-6 pt-2 pb-6">
      <div className="h-full flex flex-col min-h-0">
        <div className="bg-transparent w-full min-w-0 flex-1 flex flex-col min-h-0">
          {/* Tab bar */}
          <div className="mt-0 px-0 py-1 bg-transparent">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-6 overflow-x-auto whitespace-nowrap min-w-0" style={{ WebkitOverflowScrolling: "touch" }}>
                <button
                  type="button"
                  className={`${tabBaseClass} ${rightTab === "code" ? tabActiveClass : tabInactiveClass} inline-flex`}
                  style={{ position: "relative", display: "inline-flex" }}
                  onClick={handleCodeTabClick}
                >
                  Code
                  <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                    {isMac ? "⌘+(" : "Ctrl+("}
                  </span>
                </button>
                <div
                  style={{ position: "relative" }}
                  onWheel={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  {!isTutorialMode &&
                    (isViewSubmissionsUnlocked ? (
                      <button
                        type="button"
                        className={`${tabBaseClass} ${rightTab === "submissions" ? tabActiveClass : tabInactiveClass} inline-flex items-center gap-1`}
                        style={{ position: "relative", display: "inline-flex" }}
                        onClick={handleSubmissionsTabClick}
                        onWheel={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        View Submissions
                        <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                          {isMac ? "⌘+)" : "Ctrl+)"}
                        </span>
                      </button>
                    ) : (
                      <span
                        className={`${tabBaseClass} text-gray-400 opacity-60 cursor-not-allowed flex items-center gap-1 hover:translate-y-0 hover:tooltip-parent`}
                        style={{ position: "relative", display: "inline-flex" }}
                        onMouseEnter={(e) => showTooltip(e, viewSubmissionsTooltip)}
                        onMouseLeave={hideTooltip}
                        onMouseMove={(e) => showTooltip(e, viewSubmissionsTooltip)}
                        onWheel={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <span className="flex items-center gap-1">
                          🔒 View Submissions
                          <span className="ml-1 text-[10px] opacity-60 inline-flex items-center align-middle leading-none">
                            {isMac ? "⌘+)" : "Ctrl+)"}
                          </span>
                        </span>
                      </span>
                    ))}
                </div>
              </div>
              {rightTab === "code" && !isTutorialMode && (
                <div className="flex items-center space-x-2 ml-auto">
                  <button
                    className="px-2.5 py-1.5 rounded-md transition-colors text-xs bg-gray-700 hover:bg-gray-600 text-white cursor-pointer border border-gray-600"
                    onClick={onDownload}
                    title="Download project as repository"
                  >
                    <Download className="w-3.5 h-3.5 inline-block mr-1" />
                    Download Project
                  </button>
                  <span
                    className={isSubmitDisabled ? "inline-flex cursor-not-allowed" : undefined}
                    onMouseEnter={isSubmitDisabled ? (e: React.MouseEvent) => showTooltip(e, "Please pass all test cases first!") : undefined}
                    onMouseLeave={isSubmitDisabled ? hideTooltip : undefined}
                    onMouseMove={isSubmitDisabled ? (e: React.MouseEvent) => showTooltip(e, "Please pass all test cases first!") : undefined}
                  >
                    <button
                      className="px-2.5 py-1.5 rounded-md transition-colors text-xs bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                      onClick={onSubmitClick}
                      disabled={isSubmitDisabled}
                    >
                      Submit Project
                    </button>
                  </span>
                </div>
              )}
              {rightTab === "code" && isTutorialMode && (
                <div className="flex items-center space-x-2 ml-auto">
                  <span
                    className={isSubmitDisabled ? "inline-flex cursor-not-allowed" : undefined}
                    onMouseEnter={isSubmitDisabled ? (e: React.MouseEvent) => showTooltip(e, "Please pass all test cases first!") : undefined}
                    onMouseLeave={isSubmitDisabled ? hideTooltip : undefined}
                    onMouseMove={isSubmitDisabled ? (e: React.MouseEvent) => showTooltip(e, "Please pass all test cases first!") : undefined}
                  >
                    <button
                      className="px-2.5 py-1.5 rounded-md transition-colors text-xs bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                      onClick={onSubmitClick}
                      disabled={isSubmitDisabled}
                    >
                      Submit / Finish Tutorial
                    </button>
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* Content (Code editor or Submissions) */}
          <div className="flex-1 min-w-0 min-h-0">
            <div className="h-full min-w-0 flex flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <div style={{ display: rightTab === "code" ? "flex" : "none", flexDirection: "column", height: "100%", width: "100%" }}>
                  <CodingEditor
                    onEditorMount={handleEditorMount}
                    contextLength={4000}
                    wait_time_for_sug={2000}
                    setSuggestionIdx={setSuggestionIdx}
                    setTelemetry={setTelemetry}
                    modelAutocomplete={modelAutocomplete}
                    taskIndex={taskIndex}
                    setLogprobsCompletion={setLogProbs}
                    logProbs={logProbs}
                    suggestionIdx={suggestionIdx}
                    messageAIIndex={messageAIIndex}
                    setIsSpinning={setIsSpinning}
                    proactive_refresh_time_inactive={5000}
                    chatRef={chatRef}
                    actualEditorRef={actualEditorRef}
                    editor={editorRef.current}
                    setMessages={setMessages}
                    exp_condition={expCondition}
                    response_id={responseId}
                    worker_id={workerId}
                    setTaskIndex={setTaskIndex}
                    function_signatures={functionSignatures}
                    task_id={taskId}
                    telemetry={telemetry}
                    skipTime={0}
                    editorHeight={editorHeight}
                    onEditorMouseDown={onEditorMouseDown}
                    code={code}
                    setCode={setCode}
                    enableMultiFile={true}
                    initialFiles={initialFiles}
                    readOnlyFiles={false}
                    projectId={currentTaskMeta?.projectId ?? null}
                    userId={numericUserId}
                    taskName={currentTaskMeta?.name ?? null}
                    taskLabel={taskLabel}
                    sidebarOpen={sidebarOpen}
                    onProjectSubmitted={onProjectSubmitted}
                    onProjectInfoChange={onProjectInfoChange}
                    showCodeEditor={showCodeEditor}
                    showTerminal={false}
                    onHideCodeEditor={() => setShowCodeEditor(false)}
                    onHideTerminal={() => setShowTerminal(false)}
                    onShowCodeEditor={() => setShowCodeEditor(true)}
                    onShowTerminal={() => setShowTerminal(true)}
                    assistantPlacement={assistantPlacement}
                    showAIAssistantForBottom={showAIAssistant}
                    isAIAssistantVisible={showAIAssistant}
                    renderAssistantPane={() => (
                      <AssistantTerminalPane
                        ref={assistantTerminalPaneRef}
                        title="AI Assistant"
                        items={assistantMessages}
                        hideSuggestions={isFunctionTaskLabel(taskLabel)}
                        onClearMessages={async () => {
                          saveSnapshot();
                          const clearedMessages = assistantMessages.filter((msg: any) => msg.type === "suggestions");
                          setAssistantMessages(clearedMessages);
                          saveSnapshot(clearedMessages);
                          try {
                            await fetch(`${ENV.BACKEND_URL}/api/agent-history/clear`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ userId: numericUserId }),
                            });
                          } catch (_) {}
                        }}
                        inputValue={assistantInputValue}
                        onInputChange={setAssistantInputValue}
                        onSubmit={handleAssistantSubmit}
                        onSuggestionClick={handleSuggestionSelection}
                        awaitingResponse={awaitingResponse}
                        summaryGenerated={summaryGenerated}
                        isEditorLoading={isSpinning}
                        onHalt={() => {
                          try { assistantAbortControllerRef.current?.abort(); } catch (_) {}
                        }}
                        assistantPlacement={assistantPlacement}
                        onAssistantPlacementChange={setAssistantPlacement}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        canUndo={canUndo}
                        canRedo={canRedo}
                      />
                    )}
                    onSaveShortcut={handleSaveShortcut}
                    onFileContentChange={handleFileContentChange}
                    pendingAgentChanges={pendingAgentChanges}
                    onAcceptAgentChanges={onAcceptAgentChanges}
                    onRejectAgentChanges={onRejectAgentChanges}
                    isLoadingFiles={isLoadingFiles}
                  />
                </div>
                <div style={{ display: rightTab === "submissions" ? "flex" : "none", flexDirection: "column", height: "100%", width: "100%" }}>
                  <SubmissionsGallery
                    projectId={currentTaskMeta?.projectId}
                    taskId={selectedTask}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {tooltip.visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: tooltip.left,
              top: tooltip.top,
              transform: tooltip.placeAbove
                ? "translate(-50%, -100%) translateY(-8px)"
                : "translate(-50%, 8px)",
              backgroundColor: "#ffffff",
              color: "#000000",
              fontSize: "12px",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
              zIndex: 100000,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {tooltip.text}
          </div>,
          document.body
        )}
    </div>
  );
});

export default CodeAndSubmissionsPane;
