"use client";

import { useState, useRef, useCallback, useEffect, RefObject } from "react";
import type { AssistantItem } from "../components/editor/AssistantTerminalPane";
import { ENV } from "../config/env";

export interface PendingAgentChanges {
  original: Record<string, string>;
  modified: Record<string, string>;
  summary?: string;
  steps?: string[];
}

export interface UseAssistantChatArgs {
  isTutorialMode: boolean;
  taskId: string;
  currentTaskMeta: { id: string; name?: string; projectId?: number } | null;
  numericUserId: number | null;
  sendCodeLog: (event: string, context?: Record<string, any>) => void | Promise<void>;
  getCodeByLanguage: () => Record<string, string> | null;
  previewTabRef: RefObject<{ refreshPreview?: () => void } | null>;
  setPendingAgentChanges: React.Dispatch<React.SetStateAction<PendingAgentChanges | null>>;
  pendingAgentChanges: PendingAgentChanges | null;
}

export function useAssistantChat({
  isTutorialMode,
  taskId,
  currentTaskMeta,
  numericUserId,
  sendCodeLog,
  getCodeByLanguage,
  previewTabRef,
  setPendingAgentChanges,
  pendingAgentChanges,
}: UseAssistantChatArgs) {
  const [assistantMessages, setAssistantMessages] = useState<AssistantItem[]>([]);
  const [assistantInputValue, setAssistantInputValue] = useState("");
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [awaitingManualSuggestions, setAwaitingManualSuggestions] = useState(false);
  const [summaryGenerated, setSummaryGenerated] = useState(false);

  const assistantMessagesRef = useRef<AssistantItem[]>([]);
  const assistantAbortControllerRef = useRef<AbortController | null>(null);
  const filesModifiedInCurrentInteractionRef = useRef<Set<string>>(new Set());
  const latestSuggestionsRef = useRef<string[]>([]);
  const aiCodeLoadedTimestampRef = useRef<number | null>(null);
  const assistantTerminalPaneRef = useRef<{ focusInput: () => void } | null>(null);

  useEffect(() => {
    assistantMessagesRef.current = assistantMessages;
  }, [assistantMessages]);

  useEffect(() => {
    if (!(pendingAgentChanges?.modified && Object.keys(pendingAgentChanges.modified).length > 0)) {
      aiCodeLoadedTimestampRef.current = null;
    }
  }, [pendingAgentChanges]);

  const onAcceptAgentChanges = useCallback(
    (fileId?: string, content?: string) => {
      const prevPending = pendingAgentChanges;
      const isKeepAction =
        fileId &&
        content &&
        prevPending?.modified?.[fileId] &&
        String(content).trim() === String(prevPending.modified[fileId]).trim();
      const isRejectAction =
        fileId &&
        content &&
        prevPending?.original?.[fileId] &&
        String(content).trim() === String(prevPending.original[fileId]).trim();

      if (fileId && content) {
        setPendingAgentChanges((prev) => {
          if (!prev) return null;
          const newModified = { ...(prev.modified || {}) };
          const newOriginal = { ...(prev.original || {}) };
          delete newModified[fileId];
          delete newOriginal[fileId];
          if (Object.keys(newModified).length === 0) return null;
          return { ...prev, modified: newModified, original: newOriginal };
        });
        if (isKeepAction) {
          setTimeout(() => {
            void sendCodeLog("keep", {
              fileId,
              pendingAgentChanges: prevPending,
              codeByLanguage: getCodeByLanguage(),
            });
            try {
              previewTabRef.current?.refreshPreview?.();
            } catch (err) {
              console.warn("Failed to refresh preview on keep:", err);
            }
          }, 100);
        } else if (isRejectAction) {
          setTimeout(() => {
            void sendCodeLog("reject", {
              fileId,
              pendingAgentChanges: prevPending,
              codeByLanguage: getCodeByLanguage(),
            });
            try {
              previewTabRef.current?.refreshPreview?.();
            } catch (err) {
              console.warn("Failed to refresh preview on reject:", err);
            }
          }, 100);
        }
      } else {
        setPendingAgentChanges(null);
      }
    },
    [pendingAgentChanges, sendCodeLog, previewTabRef, getCodeByLanguage, setPendingAgentChanges]
  );

  const onRejectAgentChanges = useCallback(
    (actionType?: "keep_all" | "reject_all") => {
      const prev = pendingAgentChanges;
      const hasModifiedFiles = prev?.modified && Object.keys(prev.modified).length > 0;
      const action: "keep_all" | "reject_all" =
        actionType ?? (hasModifiedFiles ? "keep_all" : "reject_all");
      setPendingAgentChanges(null);
      setTimeout(() => {
        void sendCodeLog(action, {
          pendingAgentChanges: prev,
          codeByLanguage: getCodeByLanguage(),
        });
        try {
          previewTabRef.current?.refreshPreview?.();
        } catch (err) {
          console.warn(`Failed to refresh preview on ${action}:`, err);
        }
      }, 100);
    },
    [pendingAgentChanges, sendCodeLog, previewTabRef, getCodeByLanguage, setPendingAgentChanges]
  );

  const handleSuggestionSelection = useCallback(
    async (suggestion: string) => {
      if (isTutorialMode) return;
      const cleaned = (suggestion || "").trim();
      if (!cleaned) return;
      const suggestions = latestSuggestionsRef.current;
      if (!Array.isArray(suggestions) || suggestions.length === 0) return;
      try {
        await fetch(`${ENV.BACKEND_URL}/api/code-preferences`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            suggestions,
            user_selection: cleaned,
            taskId: taskId || currentTaskMeta?.id || null,
            task_name: currentTaskMeta?.name || null,
            user_id: numericUserId,
          }),
        });
      } catch (e) {
        console.warn("Failed to log suggestion selection", e);
      }
    },
    [isTutorialMode, taskId, currentTaskMeta, numericUserId]
  );

  const clearAssistantState = useCallback(() => {
    setAssistantMessages([]);
    latestSuggestionsRef.current = [];
    setPendingAgentChanges(null);
    setAwaitingResponse(false);
    setAwaitingManualSuggestions(false);
    setAssistantInputValue("");
  }, [setPendingAgentChanges]);

  return {
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
    clearAssistantState,
  };
}
