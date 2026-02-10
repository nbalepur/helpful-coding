"use client";

// Disable static prerender to avoid CSR bailout issues with useSearchParams
export const dynamic = 'force-dynamic';
import { useState, useEffect, useRef, useTransition, useCallback, useMemo, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRouteProtection, useAuth } from "../context/auth";
import { getUserSettingsCookie, updateUserSetting } from "../utils/cookies";
import { useSidebar } from "../components/layout/AppLayout";
import { PreviewTabRef } from "../components/preview/PreviewTab";
import { MessageData } from "../utils/messageTypes";
import { ENV } from "../config/env";
import { useSnackbar } from "../components/ui/SnackbarProvider";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { downloadProjectAsRepository, downloadSingleFile } from "../utils/downloadProject";
import SpaceThemeBackground from "../components/ui/SpaceThemeBackground";
import TaskAndPreviewPane from "../components/vibe/TaskAndPreviewPane";
import CodeAndSubmissionsPane, { CodeAndSubmissionsPaneRef } from "../components/vibe/CodeAndSubmissionsPane";
import { cloneFileNodes, flattenFileNodes } from "../utils/fileTree";
import { useResize } from "../hooks/useResize";
import { useCodeLog, type CodeLogEvent } from "../hooks/useCodeLog";
import { useVibeTask } from "../hooks/useVibeTask";
import { isFunctionTaskLabel } from "../utils/taskLabels";

function HomeInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Use route protection hook
  const { isAuthenticated, isLoading } = useRouteProtection();
  const { user } = useAuth();
  const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  
  // If on /vibe without a task parameter, redirect to browse
  // Only redirect if searchParams are available (avoid redirecting during hydration)
  useEffect(() => {
    // Only redirect if we're on /vibe AND searchParams are loaded AND there's no task param
    if (pathname === '/vibe' && searchParams && !searchParams.get('task')) {
      router.replace('/browse');
    }
  }, [pathname, searchParams, router]);
  
  // All hooks must be called before any conditional returns
  const [, startTransition] = useTransition();
  const { isSidebarOpen: sidebarOpen, toggleSidebar, isAssistantVisible: showAIAssistant, setIsAssistantVisible: setShowAIAssistant } = useSidebar();

  // Clear snackbars when leaving the Browse page
  const { clearAllSnackbars, showSnackbar } = useSnackbar();
  useEffect(() => {
    // Cleanup function to clear snackbars when component unmounts (navigating away)
    return () => {
      clearAllSnackbars();
    };
  }, [clearAllSnackbars]);

  // Load initial settings from cookies (only on client side after hydration)
  const [theme, setTheme] = useState<'native' | 'light' | 'dark'>('native');
  const [assistantPlacement, setAssistantPlacement] = useState<'bottom' | 'side'>('side');
  
  // Load settings from cookies after hydration
  useEffect(() => {
    const settings = getUserSettingsCookie();
    setTheme(settings.theme);
    setAssistantPlacement(settings.aiAssistantPlacement);
  }, []);
  const [showCodingTerminal, setShowCodingTerminal] = useState(false);
  // Left pane tabs when in a task
  const [leftTab, setLeftTab] = useState<'task' | 'preview' | 'submissions' | 'project-details'>('task');
  const [rightTab, setRightTab] = useState<'code' | 'submissions'>('code');
  const [viewedSubmission, setViewedSubmission] = useState<{ title: string; description: string | null } | null>(null);
  
  const [customProjectTitle, setCustomProjectTitle] = useState<string>('');
  const [customProjectDescription, setCustomProjectDescription] = useState<string>('');
  const [functionTaskAllTestsPassed, setFunctionTaskAllTestsPassed] = useState(false);
  const [functionTaskElapsedSeconds, setFunctionTaskElapsedSeconds] = useState(0);
  const chatRef = useRef<any>(null);
  const [isSwapped, setIsSwapped] = useState(() => {
    if (typeof window === 'undefined') return false;
    const settings = getUserSettingsCookie();
    return settings.taskPreviewSwap;
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isInitialMountRef = useRef(true);
  const historyClearedOnLoadRef = useRef(false);
  const prevAllTestsPassedRef = useRef(false);

  // Pane visibility
  const [showCodeEditor, setShowCodeEditor] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  
  const previewTabRef = useRef<PreviewTabRef>(null);
  const rightPaneRef = useRef<CodeAndSubmissionsPaneRef>(null);
  const [, setRightPaneReady] = useState(0);
  const handleRightPaneRefReady = useCallback(() => {
    setRightPaneReady((n) => n + 1);
  }, []);

  const onLayoutAfterResize = useCallback(() => {
    try {
      (rightPaneRef.current?.actualEditorRef?.current as any)?.layout?.();
    } catch {
      // no-op
    }
  }, []);
  const {
    leftColumnWidth,
    setLeftColumnWidth,
    isResizing,
    isEditorResizing,
    editorHeight,
    setEditorHeight,
    leftPaneRef,
    handleMouseDown,
    handleEditorMouseDown,
  } = useResize(containerRef, { isSwapped, onLayoutAfterResize });

  const vibeTask = useVibeTask({
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
  });
  const {
    selectedTask,
    setSelectedTask,
    taskId,
    setTaskId,
    currentTaskMeta,
    setCurrentTaskMeta,
    taskIndex,
    setTaskIndex,
    responseId,
    expCondition,
    workerId,
    functionSignatures,
    modelAutocomplete,
    allTasks,
    taskDescriptions,
    initialFiles,
    isLoadingFiles,
    currentFiles,
    setCurrentFiles,
    taskTestCases,
    isTutorialMode,
    getTaskDescription,
    handleProjectSubmitted,
  } = vibeTask;

  const selectedTaskEntry = useMemo(
    () => allTasks.find((t: any) => t.id === selectedTask),
    [allTasks, selectedTask]
  );
  const selectedTaskLabel = selectedTaskEntry?.label;
  const isFunctionTask = isFunctionTaskLabel(selectedTaskLabel);

  const functionTaskEntryPoint = useMemo(() => {
    if (!isFunctionTask || !initialFiles?.length) return null;
    const flat = flattenFileNodes(initialFiles);
    const solution = flat.find((f: any) => String(f?.name || "").toLowerCase() === "solution.py");
    return solution?.entry ?? null;
  }, [isFunctionTask, initialFiles]);
  
  const [messages, setMessages] = useState<MessageData[]>([
    { text: "How can I help you today?", sender: "bot" },
  ]);

  const [pendingAgentChanges, setPendingAgentChanges] = useState<any>(null);
  const [isMac, setIsMac] = useState(false); // Will be set after mount to detect platform

  const { sendCodeLog } = useCodeLog({
    user,
    selectedTask,
    currentTaskMeta,
    allTasks,
    isTutorialMode,
    pendingAgentChanges,
    leftTab,
    showCodingTerminal,
    rightPaneRef,
  });

  // Detect platform after mount
  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Mark initial mount as complete after first render
  useEffect(() => {
    isInitialMountRef.current = false;
  }, []);

  // Clear agent history when user first navigates to the page (once per page load)
  useEffect(() => {
    if (!isLoading && isAuthenticated && numericUserId !== null && !historyClearedOnLoadRef.current) {
      historyClearedOnLoadRef.current = true;
      // Clear history on first page load
      fetch(`${ENV.BACKEND_URL}/api/agent-history/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: numericUserId,
        }),
      }).catch((e) => {
        // Silently fail - clearing history is best-effort
      });
    }
  }, [isLoading, isAuthenticated, numericUserId]); // Run when auth state is ready

  // Save settings to cookies when they change (but not on initial mount)
  useEffect(() => {
    if (!isInitialMountRef.current) {
      updateUserSetting('theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!isInitialMountRef.current) {
      updateUserSetting('aiAssistantPlacement', assistantPlacement);
    }
  }, [assistantPlacement]);

  useEffect(() => {
    if (!isInitialMountRef.current) {
      updateUserSetting('taskPreviewSwap', isSwapped);
    }
  }, [isSwapped]);

  // Function task: reset elapsed when switching to a function task
  useEffect(() => {
    if (isFunctionTask && selectedTask) {
      setFunctionTaskElapsedSeconds(0);
    }
  }, [isFunctionTask, selectedTask]);

  // Function task: timer for give-up seconds (enable Submit after NEXT_PUBLIC_GIVE_UP_SECONDS)
  useEffect(() => {
    if (!isFunctionTask || !selectedTask) return;
    const id = setInterval(() => {
      setFunctionTaskElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isFunctionTask, selectedTask]);

  // Initialize layout with 1/3 left, 2/3 right split
  useEffect(() => {
    const init = () => {
      const container = containerRef.current;
      const handleWidth = 4;
      const viewportHeight = window.innerHeight - 32;
      const halfHeight = viewportHeight * 0.5;
      if (container) {
        const rect = container.getBoundingClientRect();
        const containerWidth = rect.width;
        // Set left column to 1/3 of container width
        const leftWidth = (containerWidth - handleWidth) * (1/3);
        setLeftColumnWidth(leftWidth);
      }
      setEditorHeight(halfHeight);
    };
    // Use rAF to ensure layout is measured after paint
    const raf = requestAnimationFrame(init);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Ensure width is set when showCodingTerminal becomes true (safety net)
  useEffect(() => {
    if (showCodingTerminal && selectedTask && leftColumnWidth === 0) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const handleWidth = 4;
        const leftWidth = (rect.width - handleWidth) * (1/3);
        setLeftColumnWidth(leftWidth);
      } else {
        // Fallback: estimate based on viewport width
        const sidebarWidth = sidebarOpen ? 256 : 48;
        const estimatedContainerWidth = window.innerWidth - sidebarWidth - 48;
        const handleWidth = 4;
        const leftWidth = (estimatedContainerWidth - handleWidth) * (1/3);
        setLeftColumnWidth(leftWidth);
      }
    }
  }, [showCodingTerminal, selectedTask, leftColumnWidth, sidebarOpen]);

  // Adjust heights on window resize to prevent overflow while preserving padding
  useEffect(() => {
    const handleResize = () => {
      const containerHeight = window.innerHeight - 32;

      // Constrain Editor height between 20% and 70% to mirror drag constraints
      const edMin = (containerHeight * 20) / 100;
      const edMax = (containerHeight * 70) / 100;
      setEditorHeight(prev => Math.max(edMin, Math.min(edMax, prev || 0)));

      try {
        (rightPaneRef.current?.actualEditorRef?.current as any)?.layout?.();
      } catch (e) {
        // no-op
      }
    };

    // Use rAF to batch during continuous resizing
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleResize);
    };

    window.addEventListener('resize', onResize);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Toggle AI assistant when the editor tab-bar robot button is clicked
  useEffect(() => {
    const openAIHandler = () => setShowAIAssistant(!showAIAssistant);
    window.addEventListener('open-ai-assistant', openAIHandler as EventListener);
    return () => {
      window.removeEventListener('open-ai-assistant', openAIHandler as EventListener);
    };
  }, [showAIAssistant, setShowAIAssistant]);

  const canSubmitFunctionTask = useMemo(
    () =>
      functionTaskAllTestsPassed ||
      functionTaskElapsedSeconds >= ENV.GIVE_UP_SECONDS,
    [functionTaskAllTestsPassed, functionTaskElapsedSeconds]
  );
  const isSubmitDisabledForFunctionTask =
    isFunctionTask && !canSubmitFunctionTask;

  const handleFunctionTaskTestResultsChange = useCallback((allPassed: boolean) => {
    const wasPassed = prevAllTestsPassedRef.current;
    prevAllTestsPassedRef.current = allPassed;
    setFunctionTaskAllTestsPassed(allPassed);
    if (allPassed && !wasPassed) {
      showSnackbar("All tests passed! You can submit your project.");
    }
  }, [showSnackbar]);

  const isViewSubmissionsUnlocked = useMemo(() => {
    // Disable submissions viewing in tutorial mode
    if (isTutorialMode) return false;
    // If we don't have task metadata, lock submissions
    if (!currentTaskMeta?.name) return false;
    // User must have can_view_submissions enabled
    return !!user?.can_view_submissions;
  }, [currentTaskMeta?.name, isTutorialMode, user?.can_view_submissions]);

  // Keyboard shortcuts: Cmd/Ctrl + [ and ] to switch Task/Preview; Cmd/Ctrl + Shift to next file; Cmd/Ctrl + (/) for Code/Submissions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      try {
        const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
        const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey;
        const isArrowLeft = e.key === 'ArrowLeft' || (e as any).code === 'ArrowLeft';
        if (!metaOrCtrl || e.altKey) return;

        const key = e.key || '';
        const code = (e as any).code || '';
        const isBracketLeft = key === '[' || code === 'BracketLeft';
        const isBracketRight = key === ']' || code === 'BracketRight';
        const isOpenParen = key === '(' || code === 'Digit9' || code === 'Numpad9';
        const isCloseParen = key === ')' || code === 'Digit0' || code === 'Numpad0';

        // Cmd/Ctrl + [ / ] to switch Task/Preview
        if (!e.shiftKey && (isBracketLeft || isBracketRight)) {
          e.preventDefault();
          e.stopPropagation();
          if (showCodingTerminal && selectedTask) {
            if (isBracketLeft) setLeftTab('task');
            // Switch to preview or project details based on tab
            else if (isBracketRight) {
              if (viewedSubmission) {
                setLeftTab('project-details');
              } else if (rightTab !== 'submissions') {
                setLeftTab('preview');
              }
            }
          }
          return;
        }

        // Cmd/Ctrl + (/) to switch Code/View Submissions
        const targetingOpenParen = isOpenParen || (!!e.shiftKey && (code === 'Digit9' || code === 'Numpad9'));
        const targetingCloseParen = isCloseParen || (!!e.shiftKey && (code === 'Digit0' || code === 'Numpad0'));
        if (targetingOpenParen || targetingCloseParen) {
          e.preventDefault();
          e.stopPropagation();
          if (showCodingTerminal && selectedTask) {
            if (targetingOpenParen) {
              setRightTab('code');
              // If on project-details, switch to task tab
              if (leftTab === 'project-details') {
                setLeftTab('task');
              }
            } else if (targetingCloseParen && isViewSubmissionsUnlocked) {
              setRightTab('submissions');
            }
          }
          return;
        }

        // Cmd/Ctrl + Shift → Next file (modifier-only chord)
        if (e.shiftKey && !e.altKey && (
          e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' ||
          (e as any).code === 'ShiftLeft' || (e as any).code === 'ShiftRight' ||
          (e as any).code === 'MetaLeft' || (e as any).code === 'MetaRight' ||
          (e as any).code === 'ControlLeft' || (e as any).code === 'ControlRight'
        )) {
          e.preventDefault();
          e.stopPropagation();
          try { window.dispatchEvent(new Event('navigate-next-file')); } catch {}
          return;
        }
      } catch {}
    };

    // Attach on both window and document in capture phase to maximize interception
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true } as any);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as any);
      document.removeEventListener('keydown', handleKeyDown, { capture: true } as any);
    };
  }, [showCodingTerminal, selectedTask, isViewSubmissionsUnlocked]);

  useEffect(() => {
    setRightTab('code');
  }, [selectedTask]);

  // Update currentFiles when initialFiles change
  useEffect(() => {
    setCurrentFiles(cloneFileNodes(initialFiles));
  }, [initialFiles]);

  useEffect(() => {
    if (!currentTaskMeta) return;
    const task = allTasks.find(t => t?.id === currentTaskMeta.id);
    if (!task) return;
    setCurrentTaskMeta(prev => {
      if (!prev || prev.id !== currentTaskMeta.id) return prev;
      const nextProjectId = task.projectId ?? prev.projectId;
      const nextName = prev.name ?? task.name;
      if (nextProjectId === prev.projectId && nextName === prev.name) return prev;
      return { ...prev, projectId: nextProjectId, name: nextName };
    });
  }, [allTasks, currentTaskMeta]);

  const viewSubmissionsTooltip = isViewSubmissionsUnlocked
    ? 'View user submissions.'
    : 'You are unable to view submissions.';

  // Switch from preview to task when switching to submissions tab
  useEffect(() => {
    if (rightTab === 'submissions' && leftTab === 'preview') {
      setLeftTab('task');
    }
  }, [rightTab, leftTab]);

  // Switch from project-details to task when switching to code tab
  useEffect(() => {
    if (rightTab === 'code' && leftTab === 'project-details') {
      setLeftTab('task');
    }
  }, [rightTab, leftTab]);

  // Listen for view-submission events from SubmissionsPlaceholder
  useEffect(() => {
    const handleViewSubmission = (event: Event) => {
      const customEvent = event as CustomEvent;
      const submission = customEvent.detail;
      if (submission && submission.title) {
        setViewedSubmission({
          title: submission.title,
          description: submission.description || null,
        });
        // When a specific project is viewed while on the submissions tab,
        // automatically switch to the Project Details tab
        setLeftTab(prev => (rightTab === 'submissions' ? 'project-details' : prev));
      }
    };

    window.addEventListener('view-submission', handleViewSubmission);
    return () => {
      window.removeEventListener('view-submission', handleViewSubmission);
    };
  }, [rightTab]);

  // Listen for exit-submission-view events to clear project details state
  useEffect(() => {
    const handleExitView = () => {
      setViewedSubmission(null);
      if (leftTab === 'project-details') {
        setLeftTab('task');
      }
    };

    window.addEventListener('exit-submission-view', handleExitView);
    return () => {
      window.removeEventListener('exit-submission-view', handleExitView);
    };
  }, [leftTab]);

  const handlePreviewRefresh = useCallback((source: string) => {
    // Skip logging for external refreshes (they're triggered programmatically and log separately)
    if (source === 'external') {
      return;
    }
    void sendCodeLog('preview-refresh', { refreshSource: source });
  }, [sendCodeLog]);

  // Track when we want to focus the assistant input
  const [shouldFocusAssistant, setShouldFocusAssistant] = useState(false);

  // Focus assistant input when it becomes available and we requested focus
  useEffect(() => {
    if (shouldFocusAssistant && showAIAssistant && rightPaneRef.current) {
      requestAnimationFrame(() => {
        rightPaneRef.current?.focusAssistantInput?.();
        setShouldFocusAssistant(false);
      });
    }
  }, [shouldFocusAssistant, showAIAssistant]);

  // Keyboard shortcuts for sidebar toggle and AI assistant toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      const key = (event.key || '').toLowerCase();
      const code = event.code || '';

      // Escape: Exit out of any text field (blur focused editable elements, including Monaco)
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && (key === 'escape' || code === 'Escape')) {
        const activeEl = document.activeElement as HTMLElement | null;
        
        // If active element is a standard input/textarea (but not Monaco), blur it
        if (activeEl) {
          // Check if it's Monaco first - Monaco handles its own Escape, but we provide fallback
          const isMonacoFocused = activeEl.closest('.monaco-editor') || 
                                  activeEl.closest('[data-editor-id]') ||
                                  activeEl.closest('.monaco-scrollable-element');
          
          if (!isMonacoFocused) {
            // Not Monaco - handle standard inputs/textareas
            if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
              event.preventDefault();
              event.stopPropagation();
              (activeEl as HTMLElement).blur();
              return;
            }
            
            // If it's contentEditable, blur it
            if (activeEl.isContentEditable) {
              event.preventDefault();
              event.stopPropagation();
              activeEl.blur();
              return;
            }
          } else {
            // Monaco is focused - let Monaco's handler deal with it, but also ensure we blur
            // Monaco should handle Escape via our custom action, but provide fallback
            try {
              const monacoEditor = (rightPaneRef.current?.actualEditorRef?.current as any)?.getMonacoEditor?.();
              if (monacoEditor && typeof monacoEditor.trigger === 'function') {
                // Try to trigger escape action if it exists
                monacoEditor.trigger('editor', 'escape-to-unfocus', null);
              }
            } catch (e) {
              // Fallback: focus body
              document.body.focus();
            }
            // Don't prevent default for Monaco - let Monaco handle it
            return;
          }
        }
        
        // Final fallback: ensure body has focus
        document.body.focus();
      }

      // Cmd/Ctrl + I or L: Focus AI assistant input (open pane if closed)
      // MUST be checked FIRST and override ALL other handlers, even when typing
      // This should work regardless of focus state or what the user is typing
      if (isCmdOrCtrl && (key === 'i' || key === 'l' || code === 'KeyI' || code === 'KeyL')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation(); // Stop all other handlers from running
        
        // If assistant is closed, open it first and mark that we want to focus
        if (!showAIAssistant) {
          setShowAIAssistant(true);
          setShouldFocusAssistant(true);
        } else {
          // Focus immediately if already open
          requestAnimationFrame(() => {
            rightPaneRef.current?.focusAssistantInput?.();
          });
        }
        return;
      }

      // Cmd/Ctrl + B: Toggle AI assistant
      // MUST override ALL other handlers, even when typing
      if (isCmdOrCtrl && (key === 'b' || code === 'KeyB')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation(); // Stop all other handlers from running
        setShowAIAssistant(!showAIAssistant);
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable;

      // Cmd/Ctrl + shortcuts for panes
      if (isCmdOrCtrl && showCodingTerminal && selectedTask) {
        const isBracketLeft = key === '[' || code === 'BracketLeft';
        const isBracketRight = key === ']' || code === 'BracketRight';
        const isOpenParen = key === '(' || code === 'Digit9' || code === 'Numpad9';
        const isCloseParen = key === ')' || code === 'Digit0' || code === 'Numpad0';
        if (isOpenParen || isCloseParen) {
          event.preventDefault();
          event.stopPropagation();
          try { (event as any).stopImmediatePropagation?.(); } catch(_) {}
          if (isOpenParen) {
            setRightTab('code');
          } else if (isCloseParen && isViewSubmissionsUnlocked) {
            setRightTab('submissions');
          }
          return;
        }
        if (!isTyping && (isBracketLeft || isBracketRight)) {
          event.preventDefault();
          event.stopPropagation();
          try { (event as any).stopImmediatePropagation?.(); } catch(_) {}
          if (isBracketLeft) {
            setLeftTab('task');
          } else if (isBracketRight) {
            // Switch to preview or project details based on tab
            if (rightTab === 'submissions' && viewedSubmission) {
              setLeftTab('project-details');
            } else if (rightTab !== 'submissions') {
              setLeftTab('preview');
            }
          }
          return;
        }
      }

      // Only handle other shortcuts when not typing
      if (isTyping) return;

      // Tab: Toggle sidebar whenever user isn't typing (prevents focus navigation)
      if (key === 'tab') {
        event.preventDefault();
        event.stopPropagation();
        toggleSidebar();
        return;
      }
    };

    // Also intercept keyup to guard against browser history on keyup
    const handleKeyUp = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      const key = (event.key || '').toLowerCase();
      const code = event.code || '';
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable;
      if (isCmdOrCtrl && showCodingTerminal && selectedTask) {
        if (
          key === '[' || code === 'BracketLeft' ||
          key === ']' || code === 'BracketRight' ||
          key === '(' || code === 'Digit9' || code === 'Numpad9' ||
          key === ')' || code === 'Digit0' || code === 'Numpad0'
        ) {
          event.preventDefault();
          event.stopPropagation();
          try { (event as any).stopImmediatePropagation?.(); } catch(_) {}
        }
      }
    };

    // Use capture phase to catch events early, before ALL other handlers
    // This ensures our handler runs first and can override others
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [showAIAssistant, showCodingTerminal, selectedTask, isViewSubmissionsUnlocked]);

  // Prevent submissions tab in tutorial mode
  useEffect(() => {
    if (isTutorialMode && rightTab === 'submissions') {
      setRightTab('code');
    }
  }, [isTutorialMode, rightTab]);

  // Define handleDownloadProject before conditional returns (hooks must be called unconditionally)
  const handleDownloadProject = useCallback(async () => {
    try {
      const codeByLanguage = rightPaneRef.current?.getCodeByLanguage?.();
      if (!codeByLanguage) {
        console.warn('No code available to download');
        return;
      }

      const projectName = currentTaskMeta?.name || selectedTask || 'VibeJam Project';
      const taskName = currentTaskMeta?.name || undefined;
      const currentTaskLabel = allTasks.find((t: any) => t.id === selectedTask)?.label;
      const isFunctionTask = isFunctionTaskLabel(currentTaskLabel);
      
      // Compute task description directly to avoid hook dependency issues
      let taskDescription: string | undefined = undefined;
      if (taskDescriptions.length > 0) {
        taskDescription = taskDescriptions[0];
      }
      
      // Use custom title/description if provided (from title/description page), otherwise use task info
      const customTitle = customProjectTitle.trim() || undefined;
      const customDescription = customProjectDescription.trim() || undefined;

      if (isFunctionTask) {
        downloadSingleFile(codeByLanguage.py || "", "solution.py");
        showSnackbar("Downloaded solution.py");
      } else {
        await downloadProjectAsRepository(
          {
            html: codeByLanguage.html || '',
            css: codeByLanguage.css || '',
            js: codeByLanguage.js || '',
          },
          projectName,
          taskName,
          taskDescription,
          customTitle,
          customDescription
        );
        showSnackbar('Thanks for downloading! Unzip the file to see a GitHub repo with steps to run your game locally or host it online for free!');
      }
      
      // Log download event
      await sendCodeLog('download');
    } catch (error) {
      console.error('Failed to download project:', error);
    }
  }, [currentTaskMeta?.name, selectedTask, taskDescriptions, customProjectTitle, customProjectDescription, sendCodeLog, allTasks]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="xl" color="white" className="mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated - will redirect via useRouteProtection
  if (!isAuthenticated) {
    return null;
  }

  // If we're on /vibe without a task parameter, show loading while redirecting
  const taskParam = searchParams?.get('task');
  if (pathname === '/vibe' && searchParams && !taskParam) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="xl" color="white" className="mx-auto mb-4" />
          <p className="text-gray-400">Redirecting...</p>
        </div>
      </div>
    );
  }

  const handleGoBack = () => {
    startTransition(() => {
      setShowCodingTerminal(false);
      setSelectedTask(null);
      setTaskId("");
      setCurrentTaskMeta(null);
    });
    // Navigate to browse page
    router.push('/browse');
  };

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-gray-900 text-white relative">
      <SpaceThemeBackground hideAnimatedDots={pathname === "/vibe"} />

      {/* Main Content */}
      <div ref={containerRef} className={`${sidebarOpen ? 'ml-60' : 'ml-12'} flex h-screen overflow-x-hidden ${showCodingTerminal ? 'px-6' : ''} relative z-10`}>
        {/* Left Side */}
        <div
          ref={leftPaneRef}
          className={`flex flex-col box-border ${showCodingTerminal ? 'pt-2 pb-6 px-6' : ''} h-full max-w-full`}
          style={{ width: showCodingTerminal ? (leftColumnWidth || '33.333%') : '100%', willChange: isResizing ? 'width' as any : undefined, order: isSwapped ? 2 as any : 0 as any }}
        >
          {showCodingTerminal && selectedTask && (
            <TaskAndPreviewPane
              leftTab={leftTab}
              setLeftTab={setLeftTab}
              rightTab={rightTab}
              isSwapped={isSwapped}
              onGoBack={handleGoBack}
              onSwap={() => setIsSwapped((s) => !s)}
              isMac={isMac}
              taskDescription={getTaskDescription(selectedTask)}
              taskId={selectedTask ?? ""}
              isTutorialMode={isTutorialMode}
              taskName={
                isTutorialMode
                  ? (selectedTaskEntry?.name || selectedTaskEntry?.title || "Tutorial")
                  : (selectedTaskEntry?.name || selectedTaskEntry?.title)
              }
              taskLabel={selectedTaskLabel}
              taskExample={selectedTaskEntry?.example}
              taskTestCases={taskTestCases}
              entryPoint={functionTaskEntryPoint}
              initialFiles={initialFiles}
              currentFiles={currentFiles}
              previewTabRef={previewTabRef}
              actualEditorRef={rightPaneRef.current?.actualEditorRef ?? { current: null }}
              onPreviewRefresh={handlePreviewRefresh}
              previewTaskName={selectedTaskEntry?.name || "preview"}
              viewedSubmission={viewedSubmission}
              isLoadingFiles={isLoadingFiles}
              onFunctionTaskTestResultsChange={handleFunctionTaskTestResultsChange}
            />
          )}
        </div>

        {/* Vertical Resize Handle */}
        {showCodingTerminal && selectedTask && (
          <div
            onMouseDown={handleMouseDown}
            className="flex-shrink-0 cursor-col-resize group"
            style={{ width: 4, order: 1 }}
          >
            <div className={`h-full w-px bg-gray-700 group-hover:bg-gray-600 mx-auto`} />
          </div>
        )}

        {showCodingTerminal && selectedTask && (
          <div className="flex-1 min-w-0 h-full overflow-hidden" style={{ order: isSwapped ? 0 as any : 2 as any }}>
            <CodeAndSubmissionsPane
              ref={rightPaneRef}
              rightTab={rightTab}
              setRightTab={setRightTab}
              leftTab={leftTab}
              setLeftTab={setLeftTab}
              isTutorialMode={isTutorialMode}
              isViewSubmissionsUnlocked={isViewSubmissionsUnlocked}
              viewSubmissionsTooltip={viewSubmissionsTooltip}
              isMac={isMac}
              onDownload={handleDownloadProject}
              onSubmitClick={() => { try { window.dispatchEvent(new Event("open-submit-modal")); } catch {} }}
              isSubmitDisabled={isSubmitDisabledForFunctionTask}
              pendingAgentChanges={pendingAgentChanges}
              setPendingAgentChanges={setPendingAgentChanges}
              sendCodeLog={sendCodeLog as (event: string, context?: Record<string, any>) => void | Promise<void>}
              previewTabRef={previewTabRef}
              currentFiles={currentFiles}
              onCurrentFilesChange={setCurrentFiles}
              initialFiles={initialFiles}
              isLoadingFiles={isLoadingFiles}
              selectedTask={selectedTask}
              showCodingTerminal={showCodingTerminal}
              isPreviewVisible={showCodingTerminal && !!selectedTask && !isFunctionTask && leftTab === "preview"}
              taskId={taskId}
              currentTaskMeta={currentTaskMeta}
              taskLabel={selectedTaskLabel}
              numericUserId={numericUserId}
              user={user}
              expCondition={expCondition}
              responseId={responseId}
              workerId={workerId}
              taskIndex={taskIndex}
              setTaskIndex={setTaskIndex}
              functionSignatures={functionSignatures}
              modelAutocomplete={modelAutocomplete}
              sidebarOpen={sidebarOpen}
              assistantPlacement={assistantPlacement}
              setAssistantPlacement={setAssistantPlacement}
              showAIAssistant={showAIAssistant}
              setShowAIAssistant={setShowAIAssistant}
              editorHeight={editorHeight}
              onEditorMouseDown={handleEditorMouseDown}
              messages={messages}
              setMessages={setMessages}
              chatRef={chatRef}
              onProjectSubmitted={handleProjectSubmitted}
              onProjectInfoChange={(title, description) => {
                setCustomProjectTitle(title);
                setCustomProjectDescription(description);
              }}
              showCodeEditor={showCodeEditor}
              setShowCodeEditor={setShowCodeEditor}
              setShowTerminal={setShowTerminal}
              onRefReady={handleRightPaneRefReady}
            />
          </div>
        )}
      </div>

      {/* Transparent overlay for mouse tracking during drag */}
      {(isResizing || isEditorResizing) && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'transparent',
            zIndex: 9999,
            cursor: isResizing ? 'col-resize' : 'row-resize',
            pointerEvents: 'all'
          }}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <LoadingSpinner size="xl" color="white" />
      </div>
    }>
      <HomeInner />
    </Suspense>
  );
}