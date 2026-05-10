"use client";

import { useState, useRef, useCallback, useEffect, RefObject, SetStateAction } from "react";
import type { AssistantItem } from "../components/editor/AssistantTerminalPane";
import type { AssistantMode } from "../components/editor/AssistantTerminalPane";
import { ENV } from "../config/env";

export interface PendingAgentChanges {
  original: Record<string, string>;
  modified: Record<string, string>;
  summary?: string;
  steps?: string[];
}

export interface UseAssistantChatArgs {
  isTutorialMode: boolean;
  assistantMode: AssistantMode;
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
  assistantMode,
  taskId,
  currentTaskMeta,
  numericUserId,
  sendCodeLog,
  getCodeByLanguage,
  previewTabRef,
  setPendingAgentChanges,
  pendingAgentChanges,
}: UseAssistantChatArgs) {
  const [assistantMessagesByMode, setAssistantMessagesByMode] = useState<Record<AssistantMode, AssistantItem[]>>({
    agent: [],
    chat: [],
    plan: [],
  });
  const [assistantInputValueByMode, setAssistantInputValueByMode] = useState<Record<AssistantMode, string>>({
    agent: "",
    chat: "",
    plan: "",
  });
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [awaitingManualSuggestions, setAwaitingManualSuggestions] = useState(false);
  const [summaryGeneratedByMode, setSummaryGeneratedByMode] = useState<Record<AssistantMode, boolean>>({
    agent: false,
    chat: false,
    plan: false,
  });

  const assistantMessagesRef = useRef<AssistantItem[]>([]);
  const assistantAbortControllerRef = useRef<AbortController | null>(null);
  const filesModifiedInCurrentInteractionRef = useRef<Set<string>>(new Set());
  const latestSuggestionsRef = useRef<string[]>([]);
  const aiCodeLoadedTimestampRef = useRef<number | null>(null);
  const assistantTerminalPaneRef = useRef<{ focusInput: () => void } | null>(null);
  const previousAssistantModeRef = useRef<AssistantMode>(assistantMode);

  const assistantMessages = assistantMessagesByMode[assistantMode] ?? [];
  const assistantInputValue = assistantInputValueByMode[assistantMode] ?? "";
  const summaryGenerated = summaryGeneratedByMode[assistantMode] ?? false;

  const setAssistantMessages = useCallback((updater: SetStateAction<AssistantItem[]>) => {
    setAssistantMessagesByMode((prev) => {
      const currentMessages = prev[assistantMode] ?? [];
      const nextMessages = typeof updater === "function"
        ? (updater as (prevState: AssistantItem[]) => AssistantItem[])(currentMessages)
        : updater;
      return {
        ...prev,
        [assistantMode]: nextMessages,
      };
    });
  }, [assistantMode]);

  const setAssistantInputValue = useCallback((updater: SetStateAction<string>) => {
    setAssistantInputValueByMode((prev) => {
      const currentInput = prev[assistantMode] ?? "";
      const nextInput = typeof updater === "function"
        ? (updater as (prevState: string) => string)(currentInput)
        : updater;
      return {
        ...prev,
        [assistantMode]: nextInput,
      };
    });
  }, [assistantMode]);

  const setSummaryGenerated = useCallback((updater: SetStateAction<boolean>) => {
    setSummaryGeneratedByMode((prev) => {
      const currentValue = prev[assistantMode] ?? false;
      const nextValue = typeof updater === "function"
        ? (updater as (prevState: boolean) => boolean)(currentValue)
        : updater;
      return {
        ...prev,
        [assistantMode]: nextValue,
      };
    });
  }, [assistantMode]);

  useEffect(() => {
    assistantMessagesRef.current = assistantMessages;
  }, [assistantMessages]);

  useEffect(() => {
    const previousMode = previousAssistantModeRef.current;
    if (previousMode === assistantMode) return;

    // Preserve in-progress draft across mode switches by seeding the next mode
    // with the previous mode's draft if it doesn't already have one.
    setAssistantInputValueByMode((prev) => {
      const previousDraft = prev[previousMode] ?? "";
      const nextDraft = prev[assistantMode] ?? "";
      if (!previousDraft || nextDraft) return prev;
      return {
        ...prev,
        [assistantMode]: previousDraft,
      };
    });

    previousAssistantModeRef.current = assistantMode;
  }, [assistantMode]);

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
    setAssistantMessagesByMode({
      agent: [],
      chat: [],
      plan: [],
    });
    latestSuggestionsRef.current = [];
    setPendingAgentChanges(null);
    setAwaitingResponse(false);
    setAwaitingManualSuggestions(false);
    setAssistantInputValueByMode({
      agent: "",
      chat: "",
      plan: "",
    });
    setSummaryGeneratedByMode({
      agent: false,
      chat: false,
      plan: false,
    });
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
