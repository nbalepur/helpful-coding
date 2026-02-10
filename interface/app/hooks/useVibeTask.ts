"use client";

import { useState, useRef, useCallback, useEffect, RefObject } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { isTutorialTask, isTutorialTaskId, getTutorialTaskId } from "../utils/tutorial";

export interface CodeAndSubmissionsPaneRefForTask {
  clearAssistantState?: () => void;
}

export interface UseVibeTaskArgs {
  numericUserId: number | null;
  user: { id: string } | null;
  router: ReturnType<typeof useRouter>;
  pathname: string;
  searchParams: URLSearchParams | null;
  rightPaneRef: RefObject<CodeAndSubmissionsPaneRefForTask | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  showCodingTerminal: boolean;
  setShowCodingTerminal: (v: boolean) => void;
  setLeftTab: (tab: "task" | "preview" | "submissions" | "project-details") => void;
  setLeftColumnWidth: (w: number) => void;
  setEditorHeight: (h: number) => void;
  sidebarOpen: boolean;
  startTransition: (fn: () => void) => void;
}

export function useVibeTask(args: UseVibeTaskArgs) {
  const {
    numericUserId,
    user,
    router,
    pathname,
    searchParams,
    rightPaneRef,
    containerRef,
    showCodingTerminal,
    setShowCodingTerminal,
    setLeftTab,
    setLeftColumnWidth,
    setEditorHeight,
    sidebarOpen,
    startTransition,
  } = args;

  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string>("");
  const [currentTaskMeta, setCurrentTaskMeta] = useState<{
    id: string;
    name?: string;
    projectId?: number;
  } | null>(null);
  const [taskIndex, setTaskIndex] = useState(0);
  const [responseId, setResponseId] = useState("");
  const [expCondition, setExpCondition] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [functionSignatures, setFunctionSignatures] = useState<string[]>([]);
  const [modelAutocomplete, setModelAutocomplete] = useState("Off");
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [taskDescriptions, setTaskDescriptions] = useState<string[]>([]);
  const [initialFiles, setInitialFiles] = useState<any[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [currentFiles, setCurrentFiles] = useState<any[]>([]);
  const [taskTestCases, setTaskTestCases] = useState<any[]>([]);

  const taskAbortControllerRef = useRef<AbortController | null>(null);

  const isTutorialMode = selectedTask != null && (selectedTask === "tutorial" || isTutorialTask(allTasks.find((t: any) => t.id === selectedTask)));

  const loadTasks = useCallback(
    async (signal?: AbortSignal, forceRefresh: boolean = false) => {
      const cacheKey = numericUserId ? `cached_tasks_${numericUserId}` : "cached_tasks_anonymous";
      if (!forceRefresh && typeof window !== "undefined") {
        try {
          const cachedData = localStorage.getItem(cacheKey);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
            setAllTasks(tasks);
            setIsLoadingTasks(false);
            return;
          }
        } catch {
          // fall through
        }
      }
      try {
        const queryParams = numericUserId ? `?userId=${numericUserId}` : "";
        const fetchOptions: RequestInit = {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache" },
        };
        if (signal) fetchOptions.signal = signal;
        const res = await fetch(`/api/tasks${queryParams}`, fetchOptions);
        if (res.ok) {
          const data = await res.json();
          const tasks = Array.isArray(data.tasks) ? data.tasks : [];
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(cacheKey, JSON.stringify({ tasks }));
            } catch {
              // ignore
            }
          }
          setAllTasks(tasks);
        } else {
          console.error("Failed to load tasks:", res.status, res.statusText);
          setAllTasks([]);
        }
      } catch (error: any) {
        if (error.name === "AbortError") return;
        console.error("Error loading tasks:", error);
        setAllTasks([]);
      } finally {
        setIsLoadingTasks(false);
      }
    },
    [numericUserId]
  );

  const handleProjectSubmitted = useCallback(async () => {
    await loadTasks(undefined, true);
  }, [loadTasks]);

  const cleanupTaskState = useCallback(() => {
    rightPaneRef.current?.clearAssistantState?.();
  }, [rightPaneRef]);

  const getInitialFilesForTask = useCallback(
    async (
      taskIdParam: string,
      abortSignal?: AbortSignal
    ): Promise<{ files: any[]; projectId: number | null; testCases: any[] }> => {
      try {
        const userIdParam = user?.id ? `&userId=${encodeURIComponent(user.id)}` : "";
        const response = await fetch(`/api/task-files?taskId=${taskIdParam}${userIdParam}`, {
          signal: abortSignal,
        });
        if (response.ok) {
          const data = await response.json();
          const files = Array.isArray(data.files) ? data.files : [];
          const projectId = typeof data.projectId === "number" ? data.projectId : null;
          const testCases = Array.isArray(data.testCases) ? data.testCases : [];
          return { files, projectId, testCases };
        }
        return { files: [], projectId: null, testCases: [] };
      } catch (error: any) {
        if (error.name === "AbortError") return { files: [], projectId: null, testCases: [] };
        console.error("Error loading task files:", error);
        return { files: [], projectId: null, testCases: [] };
      }
    },
    [user, allTasks]
  );

  const getTaskDescription = useCallback(
    (taskIdParam: string): string => {
      const task = allTasks.find((t: any) => t.id === taskIdParam);
      return task?.description ?? "";
    },
    [allTasks]
  );

  const startTask = useCallback(
    async (taskIdParam: string, updateUrl: boolean) => {
      if (taskAbortControllerRef.current) {
        taskAbortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      taskAbortControllerRef.current = abortController;
      cleanupTaskState();
      setIsLoadingFiles(true);

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const handleWidth = 4;
        const leftWidth = ((rect.width - handleWidth) * 1) / 3;
        setLeftColumnWidth(leftWidth);
      } else {
        const sidebarWidth = sidebarOpen ? 256 : 48;
        const estimatedContainerWidth = window.innerWidth - sidebarWidth - 48;
        const handleWidth = 4;
        const leftWidth = ((estimatedContainerWidth - handleWidth) * 1) / 3;
        setLeftColumnWidth(leftWidth);
      }

      startTransition(() => {
        setSelectedTask(taskIdParam);
        setTaskId(taskIdParam);
        setShowCodingTerminal(true);
        setLeftTab("task");
      });

      const desc = allTasks.find((t: any) => t.id === taskIdParam)?.description ?? "";
      setTaskDescriptions([desc]);

      let fetchedProjectId: number | null = null;
      try {
        const { files, projectId, testCases } = await getInitialFilesForTask(taskIdParam, abortController.signal);
        setInitialFiles(files);
        setTaskTestCases(testCases);
        fetchedProjectId = projectId;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Error loading files:", error);
        setInitialFiles([]);
        setTaskTestCases([]);
      } finally {
        setIsLoadingFiles(false);
      }

      const task = allTasks.find((t: any) => t.id === taskIdParam);
      const resolvedProjectId = fetchedProjectId ?? task?.projectId ?? null;
      const taskName =
        isTutorialTask(task) || isTutorialTaskId(taskIdParam, allTasks)
          ? (task?.name || task?.title || "Tutorial")
          : (task?.name || task?.title || "");

      setCurrentTaskMeta(
        task
          ? { id: task.id, name: task.name, projectId: resolvedProjectId ?? undefined }
          : { id: taskIdParam, name: taskName, projectId: resolvedProjectId ?? undefined }
      );

      const viewportHeight = window.innerHeight - 32;
      setEditorHeight(viewportHeight * 0.5);

      requestAnimationFrame(() => {
        const c = containerRef.current;
        if (c) {
          const rect = c.getBoundingClientRect();
          const handleWidth = 4;
          const leftWidth = ((rect.width - handleWidth) * 1) / 3;
          setLeftColumnWidth(leftWidth);
        }
      });

      if (updateUrl) {
        router.push(`/vibe?task=${taskIdParam}`);
      }
    },
    [
      cleanupTaskState,
      containerRef,
      setLeftColumnWidth,
      setShowCodingTerminal,
      setLeftTab,
      setEditorHeight,
      allTasks,
      getInitialFilesForTask,
      router,
      sidebarOpen,
      startTransition,
    ]
  );

  useEffect(() => {
    const abortController = new AbortController();
    loadTasks(abortController.signal);
    return () => abortController.abort();
  }, [loadTasks]);

  useEffect(() => {
    if (!showCodingTerminal) cleanupTaskState();
  }, [showCodingTerminal, cleanupTaskState]);

  useEffect(() => {
    const handleTaskParam = async () => {
      const taskParam = searchParams?.get("task");
      if (taskParam && allTasks.length > 0) {
        const resolvedId = taskParam === "tutorial" ? getTutorialTaskId(allTasks) ?? taskParam : taskParam;
        const task = allTasks.find((t: any) => t.id === resolvedId);
        if (task && selectedTask !== task.id) {
          await startTask(task.id, false);
        }
      } else if (!taskParam && pathname === "/vibe" && showCodingTerminal) {
        router.push("/browse");
        setShowCodingTerminal(false);
        setSelectedTask(null);
        setTaskId("");
        setCurrentTaskMeta(null);
        cleanupTaskState();
      }
    };
    handleTaskParam();
  }, [searchParams, allTasks, selectedTask, pathname, showCodingTerminal, isTutorialMode, startTask, router, setShowCodingTerminal, cleanupTaskState]);

  useEffect(() => {
    const taskParam = searchParams?.get("task");
    if (pathname === "/vibe" && !taskParam) {
      router.push("/browse");
      setShowCodingTerminal(false);
      setSelectedTask(null);
      setTaskId("");
      setCurrentTaskMeta(null);
      cleanupTaskState();
    }
  }, [searchParams, pathname, router, setShowCodingTerminal, cleanupTaskState]);

  useEffect(() => {
    const handlePopState = async () => {
      try {
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        const taskParam = urlParams.get("task");
        if (path === "/vibe" || path === "/") {
          if (taskParam) {
            const taskExists = allTasks.some((t: any) => t.id === taskParam);
            if (taskExists) {
              await startTask(taskParam, false);
            } else {
              router.push("/browse");
              setShowCodingTerminal(false);
              setSelectedTask(null);
              setTaskId("");
              setCurrentTaskMeta(null);
              cleanupTaskState();
            }
          } else {
            router.push("/browse");
            setShowCodingTerminal(false);
            setSelectedTask(null);
            setTaskId("");
            setCurrentTaskMeta(null);
            cleanupTaskState();
          }
        }
      } catch {
        // no-op
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [allTasks, startTask, router, setShowCodingTerminal, cleanupTaskState]);

  return {
    selectedTask,
    setSelectedTask,
    taskId,
    setTaskId,
    currentTaskMeta,
    setCurrentTaskMeta,
    taskIndex,
    setTaskIndex,
    responseId,
    setResponseId,
    expCondition,
    setExpCondition,
    workerId,
    setWorkerId,
    functionSignatures,
    setFunctionSignatures,
    modelAutocomplete,
    setModelAutocomplete,
    allTasks,
    setAllTasks,
    isLoadingTasks,
    taskDescriptions,
    setTaskDescriptions,
    initialFiles,
    setInitialFiles,
    isLoadingFiles,
    currentFiles,
    setCurrentFiles,
    taskTestCases,
    setTaskTestCases,
    isTutorialMode,
    loadTasks,
    startTask,
    getTaskDescription,
    getInitialFilesForTask,
    handleProjectSubmitted,
    cleanupTaskState,
  };
}
