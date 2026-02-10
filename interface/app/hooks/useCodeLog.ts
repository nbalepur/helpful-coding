"use client";

import { useRef, useCallback, useEffect, RefObject } from "react";
import { determineLanguageKey } from "../utils/fileTree";
import { ENV } from "../config/env";

export type CodeLogEvent =
  | "save-shortcut"
  | "before-unload"
  | "preview-refresh"
  | "AI-refresh"
  | "keep"
  | "reject"
  | "keep_all"
  | "reject_all"
  | "download"
  | "undo"
  | "redo";

const AI_CODE_LOAD_WINDOW_MS = 10000;

export interface CodeAndSubmissionsPaneRefForLog {
  getCodeByLanguage: () => Record<string, string> | null;
  getFileMetadata: () => Record<string, { name: string; language?: string }>;
  getAiCodeLoadedTimestamp: () => number | null;
}

export interface UseCodeLogArgs {
  user: { id: string } | null;
  selectedTask: string | null;
  currentTaskMeta: { id: string; name?: string; projectId?: number } | null;
  allTasks: any[];
  isTutorialMode: boolean;
  pendingAgentChanges: any;
  leftTab: string;
  showCodingTerminal: boolean;
  rightPaneRef: RefObject<CodeAndSubmissionsPaneRefForLog | null>;
}

export function useCodeLog({
  user,
  selectedTask,
  currentTaskMeta,
  allTasks,
  isTutorialMode,
  pendingAgentChanges,
  leftTab,
  showCodingTerminal,
  rightPaneRef,
}: UseCodeLogArgs) {
  const unloadLoggedRef = useRef(false);

  const buildCodeLogPayload = useCallback(
    (event: CodeLogEvent, context: Record<string, any> = {}) => {
      if (isTutorialMode) return null;
      if (!user?.id) return null;
      const numericUserId = Number.parseInt(user.id, 10);
      if (!Number.isFinite(numericUserId)) return null;
      if (!selectedTask || !currentTaskMeta) return null;
      const projectId =
        currentTaskMeta.projectId ?? allTasks.find((task: any) => task?.id === currentTaskMeta.id)?.projectId;
      if (!projectId) return null;
      const codeOverride = context.codeByLanguage;
      const codeByLanguage = codeOverride || rightPaneRef.current?.getCodeByLanguage?.();
      if (!codeByLanguage) return null;
      const pendingForLog = context.pendingAgentChanges ?? pendingAgentChanges;
      const isDiffMode = !!(pendingForLog?.modified && Object.keys(pendingForLog.modified).length > 0);
      const aiLoadedTs = rightPaneRef.current?.getAiCodeLoadedTimestamp?.() ?? null;
      const isAiGeneratedMode =
        event === "save-shortcut" &&
        aiLoadedTs !== null &&
        Date.now() - aiLoadedTs <= AI_CODE_LOAD_WINDOW_MS;
      let originalCodeByLanguage: Record<string, string> | undefined;
      if (isDiffMode && pendingForLog?.original) {
        originalCodeByLanguage = {};
        const metadataMap = rightPaneRef.current?.getFileMetadata?.() || {};
        Object.entries(pendingForLog.original).forEach(([fileId, originalContent]) => {
          const meta = metadataMap[fileId] || { name: fileId };
          const key = determineLanguageKey(meta.language, meta.name || fileId);
          if (key && originalContent && originalCodeByLanguage) {
            originalCodeByLanguage[key] =
              typeof originalContent === "string" ? originalContent : String(originalContent ?? "");
          }
        });
      }
      const metadata = {
        event,
        taskId: currentTaskMeta.id,
        projectId,
        taskName: currentTaskMeta?.name ?? null,
        triggeredAt: new Date().toISOString(),
        leftTab,
        showCodingTerminal,
        isPreviewVisible: showCodingTerminal && !!selectedTask && leftTab === "preview",
        codeLengths: Object.fromEntries(
          Object.entries(codeByLanguage).map(([key, value]) => [key, String(value ?? "").length])
        ),
        files: Object.fromEntries(
          Object.entries(rightPaneRef.current?.getFileMetadata?.() || {}).map(([fileId, meta]) => [
            fileId,
            { name: meta?.name, language: meta?.language },
          ])
        ),
        ...(isDiffMode &&
        originalCodeByLanguage &&
        Object.keys(originalCodeByLanguage).length > 0
          ? { originalCode: originalCodeByLanguage }
          : {}),
        ...context,
      };
      let mode: string;
      if (event === "keep" || event === "keep_all") {
        mode = event === "keep_all" ? "keep_all" : "keep";
      } else if (event === "reject" || event === "reject_all") {
        mode = event === "reject_all" ? "reject_all" : "reject";
      } else if (event === "download") {
        mode = "download";
      } else if (event === "undo" || event === "redo") {
        mode = event;
      } else if (event === "AI-refresh") {
        mode = "AI";
      } else if (isAiGeneratedMode) {
        mode = "AI_generated";
      } else if (isDiffMode) {
        mode = "diff";
      } else {
        mode = "regular";
      }
      return {
        userId: numericUserId,
        projectId,
        taskId: currentTaskMeta.id,
        mode,
        event,
        code: codeByLanguage,
        metadata,
      };
    },
    [
      user,
      selectedTask,
      currentTaskMeta,
      leftTab,
      showCodingTerminal,
      allTasks,
      pendingAgentChanges,
      rightPaneRef,
      isTutorialMode,
    ]
  );

  const sendCodeLog = useCallback(
    async (event: CodeLogEvent, context: Record<string, any> = {}) => {
      const payload = buildCodeLogPayload(event, context);
      if (!payload) return;
      try {
        await fetch(`${ENV.BACKEND_URL}/api/code-logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        console.warn("Failed to log code snapshot", error);
      }
    },
    [buildCodeLogPayload]
  );

  const sendCodeLogBeacon = useCallback(
    (event: CodeLogEvent, context: Record<string, any> = {}) => {
      const payload = buildCodeLogPayload(event, context);
      if (!payload) return;
      if (event === "before-unload") {
        if (unloadLoggedRef.current) return;
        unloadLoggedRef.current = true;
      }
      const url = `${ENV.BACKEND_URL}/api/code-logs`;
      const body = JSON.stringify(payload);
      try {
        let dispatched = false;
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const blob = new Blob([body], { type: "application/json" });
          dispatched = navigator.sendBeacon(url, blob);
        }
        if (!dispatched) {
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch((error) => console.warn("Failed to beacon code snapshot", error));
        }
      } catch (error) {
        console.warn("Failed to dispatch code snapshot beacon", error);
      }
    },
    [buildCodeLogPayload]
  );

  useEffect(() => {
    unloadLoggedRef.current = false;
  }, [selectedTask, currentTaskMeta]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const codeByLanguage = rightPaneRef.current?.getCodeByLanguage?.() ?? undefined;
      sendCodeLogBeacon("before-unload", { codeByLanguage });
    };
    const handlePageHide = (event: any) => {
      if (event?.persisted) return;
      const codeByLanguage = rightPaneRef.current?.getCodeByLanguage?.();
      sendCodeLogBeacon("before-unload", { codeByLanguage });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [sendCodeLogBeacon, rightPaneRef]);

  return { sendCodeLog };
}
