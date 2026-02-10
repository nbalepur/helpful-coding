"use client";

import { useState, useRef, useCallback, useEffect, useMemo, RefObject } from "react";
import type { AssistantItem } from "../components/editor/AssistantTerminalPane";

export interface CodeSnapshot {
  codeState: Record<string, string>;
  messages: AssistantItem[];
  timestamp: number;
}

const MAX_HISTORY = 10;

export interface UseEditorHistoryArgs {
  actualEditorRef: RefObject<{ getAllFileContents?: () => Record<string, string>; updateFileContent?: (fileId: string, content: string) => void } | null>;
  previewTabRef: RefObject<{ refreshPreview?: () => void } | null>;
  setPendingAgentChanges: (value: any) => void;
  sendCodeLog: (event: string, context?: Record<string, any>) => void | Promise<void>;
  assistantMessagesRef: RefObject<AssistantItem[]>;
  setAssistantMessages: React.Dispatch<React.SetStateAction<AssistantItem[]>>;
  buildCodeByLanguageFromState: (codeState: Record<string, string>) => Record<string, string> | null;
}

export function useEditorHistory({
  actualEditorRef,
  previewTabRef,
  setPendingAgentChanges,
  sendCodeLog,
  assistantMessagesRef,
  setAssistantMessages,
  buildCodeByLanguageFromState,
}: UseEditorHistoryArgs) {
  const [history, setHistory] = useState<CodeSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyIndexRef = useRef(0);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const saveSnapshot = useCallback(
    (messages?: AssistantItem[], codeState?: Record<string, string>) => {
      let finalCodeState: Record<string, string>;
      if (codeState) {
        finalCodeState = codeState;
      } else if (actualEditorRef?.current?.getAllFileContents) {
        finalCodeState = actualEditorRef.current.getAllFileContents();
      } else {
        return;
      }
      const messagesToSave = messages ?? assistantMessagesRef.current ?? [];
      const snapshot: CodeSnapshot = {
        codeState: { ...finalCodeState },
        messages: [...messagesToSave],
        timestamp: Date.now(),
      };
      setHistory((prev) => {
        const currentIdx = historyIndexRef.current;
        const isAtLatest = currentIdx === prev.length - 1;
        const newHistory = isAtLatest ? [...prev, snapshot] : [...prev.slice(0, currentIdx + 1), snapshot];
        const finalHistory = newHistory.slice(-MAX_HISTORY);
        setHistoryIndex(finalHistory.length - 1);
        return finalHistory;
      });
    },
    [actualEditorRef, assistantMessagesRef]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0 || historyIndex <= 0) return;
    const targetIdx = historyIndex - 1;
    const snapshot = history[targetIdx];
    setPendingAgentChanges(null);
    Object.entries(snapshot.codeState).forEach(([fileId, content]) => {
      actualEditorRef?.current?.updateFileContent?.(fileId, content);
    });
    setAssistantMessages(snapshot.messages);
    setHistoryIndex(targetIdx);
    const codeByLanguage = buildCodeByLanguageFromState(snapshot.codeState || {});
    if (codeByLanguage) void sendCodeLog("undo", { codeByLanguage });
  }, [history, historyIndex, buildCodeByLanguageFromState, sendCodeLog, actualEditorRef, setPendingAgentChanges, setAssistantMessages]);

  const handleRedo = useCallback(() => {
    if (history.length === 0 || historyIndex >= history.length - 1) return;
    const targetIdx = historyIndex + 1;
    const snapshot = history[targetIdx];
    setPendingAgentChanges(null);
    Object.entries(snapshot.codeState).forEach(([fileId, content]) => {
      actualEditorRef?.current?.updateFileContent?.(fileId, content);
    });
    setAssistantMessages(snapshot.messages);
    setHistoryIndex(targetIdx);
    const codeByLanguage = buildCodeByLanguageFromState(snapshot.codeState || {});
    if (codeByLanguage) void sendCodeLog("redo", { codeByLanguage });
  }, [history, historyIndex, buildCodeByLanguageFromState, sendCodeLog, actualEditorRef, setPendingAgentChanges, setAssistantMessages]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        previewTabRef.current?.refreshPreview?.();
      } catch {
        // no-op
      }
    }, 50);
    return () => clearTimeout(t);
  }, [historyIndex, history.length, previewTabRef]);

  const canUndo = useMemo(() => history.length > 0 && historyIndex > 0, [history.length, historyIndex]);
  const canRedo = useMemo(() => history.length > 0 && historyIndex < history.length - 1, [history.length, historyIndex]);

  return {
    history,
    historyIndex,
    setHistory,
    setHistoryIndex,
    saveSnapshot,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
  };
}
