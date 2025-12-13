"use client";

// Disable static prerender to avoid CSR bailout issues with useSearchParams
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { useState, useEffect, useRef, useTransition, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRouteProtection, useAuth } from "./utils/auth";
import { getUserSettingsCookie, updateUserSetting } from "./utils/cookies";
import {
  Grid3X3, 
  Plus, 
  Infinity, 
  Globe, 
  Bookmark, 
  Moon, 
  Calendar, 
  Building2,
  Star,
  Shuffle,
  Search,
  Filter,
  Play,
  CheckCircle,
  Circle,
  BookmarkCheck,
  X,
  ArrowLeft,
  ArrowLeftRight
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import MinimalTaskList from "./components/MinimalTaskList";
import TaskInstructionNew from "./components/TaskInstructionNew";
import CodingEditor from "./components/CodingEditor";
import PreviewTab, { PreviewTabRef } from "./components/PreviewTab";
import { MessageData } from "./components/Message";
import AssistantTerminalPane, { AssistantItem, AssistantTerminalPaneRef } from "./components/AssistantTerminalPane";
import IRBIframe from "./components/IRBIframe";
import SubmissionsGallery from "./components/SubmissionsPlaceholder";
import { load_next_task } from "./functions/task_logic";
import { ENV } from "./config/env";
import { DiffEditor } from "@monaco-editor/react";
import LeaderboardPage from "./pages/LeaderboardPage";
import SkillCheckPage from "./pages/SkillCheckPage";
import AboutPage from "./pages/AboutPage";
import UserSubmissions from "./components/UserSubmissions";

type CodeLogEvent = "save-shortcut" | "before-unload" | "preview-refresh" | "AI-refresh" | "keep" | "reject" | "keep_all" | "reject_all";

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Use route protection hook
  const { isAuthenticated, isLoading } = useRouteProtection();
  const { user } = useAuth();
  const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  
  // All hooks must be called before any conditional returns
  const [isPending, startTransition] = useTransition();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTasks, setFilteredTasks] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");
  // Skill check mode: 'pre-test', 'post-test', or 'locked'
  // TODO: Replace with API call to determine skill check availability
  const [skillCheckMode, setSkillCheckMode] = useState<'pre-test' | 'post-test' | 'locked'>('pre-test');
  // Load initial settings from cookies (only on client side)
  const [theme, setTheme] = useState<'native' | 'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'native';
    const settings = getUserSettingsCookie();
    return settings.theme;
  });
  const [assistantPlacement, setAssistantPlacement] = useState<'bottom' | 'side'>(() => {
    if (typeof window === 'undefined') return 'side';
    const settings = getUserSettingsCookie();
    return settings.aiAssistantPlacement;
  });
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showCodingTerminal, setShowCodingTerminal] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  // Left pane tabs when in a task
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipText, setTooltipText] = useState("");
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const [tooltipTop, setTooltipTop] = useState(0);
  const [tooltipPlaceAbove, setTooltipPlaceAbove] = useState(true);
  const [leftTab, setLeftTab] = useState<'task' | 'preview' | 'leaderboard' | 'submissions' | 'project-details'>('task');
  const [rightTab, setRightTab] = useState<'code' | 'submissions'>('code');
  const [viewedSubmission, setViewedSubmission] = useState<{ title: string; description: string | null } | null>(null);
  
  // Vibe page layout state
  const [code, setCode] = useState("");
  const [editorHeight, setEditorHeight] = useState(0);
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [logProbs, setLogProbs] = useState<any>(null);
  const [messageAIIndex, setMessageAIIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [summaryGenerated, setSummaryGenerated] = useState(false);
  const editorRef = useRef<any>(null);
  const actualEditorRef = useRef<any>(null);
  const chatRef = useRef<any>(null);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const pendingLeftWidthRef = useRef<number>(0);
  const rafScheduledRef = useRef<boolean>(false);
  const lastConstrainedWidthRef = useRef<number>(0);
  const [isSwapped, setIsSwapped] = useState(() => {
    if (typeof window === 'undefined') return false;
    const settings = getUserSettingsCookie();
    return settings.taskPreviewSwap;
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const taskAbortControllerRef = useRef<AbortController | null>(null);
  const assistantTerminalPaneRef = useRef<AssistantTerminalPaneRef | null>(null);
  const assistantAbortControllerRef = useRef<AbortController | null>(null);
  const latestSuggestionsRef = useRef<string[]>([]);
  const fileMetadataRef = useRef<Record<string, { name: string; language?: string }>>({});
  const unloadLoggedRef = useRef(false);
  const isInitialMountRef = useRef(true);
  
  // Resize state
  const [leftColumnWidth, setLeftColumnWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [taskInstructionHeight, setTaskInstructionHeight] = useState(0);
  const [isVerticalResizing, setIsVerticalResizing] = useState(false);
  const [isEditorResizing, setIsEditorResizing] = useState(false);
  
  // Pane visibility
  const [showTaskInstructions, setShowTaskInstructions] = useState(true);
  const [showAIAssistant, setShowAIAssistant] = useState(true);
  const [showCodeEditor, setShowCodeEditor] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  
  // Task data
  const [taskDescriptions, setTaskDescriptions] = useState<string[]>([]);
  const [initialFiles, setInitialFiles] = useState<any[]>([]);
  const [currentFiles, setCurrentFiles] = useState<any[]>([]);
  const [testCases, setTestCases] = useState<any[]>([]);
  const previewTabRef = useRef<PreviewTabRef>(null);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  
  // Chat state
  const [chatHistory, setChatHistory] = useState<any[]>([
    { role: "system", content: "help with python" },
  ]);
  const [messages, setMessages] = useState<MessageData[]>([
    { text: "How can I help you today?", sender: "bot" },
  ]);
  
  // Assistant terminal state
  const [assistantMessages, setAssistantMessages] = useState<AssistantItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [assistantInputValue, setAssistantInputValue] = useState("");
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [awaitingManualSuggestions, setAwaitingManualSuggestions] = useState(false);
  // No per-session conversation ID; backend maintains a single global history list
  
  // Agent changes state
  const [pendingAgentChanges, setPendingAgentChanges] = useState<any>(null);
  
  // Task state
  const [responseId, setResponseId] = useState("");
  const [taskId, setTaskId] = useState<string>("");
  const [currentTaskMeta, setCurrentTaskMeta] = useState<{
    id: string;
    name?: string;
    projectId?: number;
    votingStartDate?: string | null;
    votingEndDate?: string | null;
    codeStartDate?: string | null;
  } | null>(null);
  const [expCondition, setExpCondition] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [model, setModel] = useState("gpt-3.5-turbo");
  const [taskNameDB, setTaskNameDB] = useState("");
  const [taskIndex, setTaskIndex] = useState(0);
  const [maxTokensTask, setMaxTokensTask] = useState(2000);
  const [unitTests, setUnitTests] = useState<string[]>([]);
  const [functionSignatures, setFunctionSignatures] = useState<string[]>([]);
  const [chatLogProbs, setChatLogProbs] = useState("");
  const [modelAutocomplete, setModelAutocomplete] = useState("Off");
  const [modelChat, setModelChat] = useState("gpt-4o");
  const [proactive, setProactive] = useState(false);
  const [suggestion_max_options, setSuggestionMaxOptions] = useState(3);
  const [insert_cursor, setInsertCursor] = useState(true);
  const [proactive_refresh_time_active, setProactiveRefreshTimeActive] = useState(15_000);
  const [proactive_refresh_time_inactive, setProactiveRefreshTimeInactive] = useState(30_000);
  const [proactive_delete_time, setProactiveDeleteTime] = useState(60_000);
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');

  // Mark initial mount as complete after first render
  useEffect(() => {
    isInitialMountRef.current = false;
  }, []);

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

  // Initialize layout with 1/3 left, 2/3 right split
  useEffect(() => {
    const init = () => {
      const container = containerRef.current;
      const padding = 16; // matches ml-12/px and overall layout padding used elsewhere
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
      setTaskInstructionHeight(halfHeight);
      setEditorHeight(halfHeight);
    };
    // Use rAF to ensure layout is measured after paint
    const raf = requestAnimationFrame(init);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Adjust heights on window resize to prevent overflow while preserving padding
  useEffect(() => {
    const handleResize = () => {
      const containerHeight = window.innerHeight - 32;

      // Constrain Task Instructions height between 25% and 75% of viewport-like height
      const tiMin = (containerHeight * 25) / 100;
      const tiMax = (containerHeight * 75) / 100;
      setTaskInstructionHeight(prev => Math.max(tiMin, Math.min(tiMax, prev || 0)));

      // Constrain Editor height between 20% and 70% to mirror drag constraints
      const edMin = (containerHeight * 20) / 100;
      const edMax = (containerHeight * 70) / 100;
      setEditorHeight(prev => Math.max(edMin, Math.min(edMax, prev || 0)));

      try {
        (actualEditorRef.current as any)?.layout?.();
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
    const openAIHandler = () => setShowAIAssistant(prev => !prev);
    window.addEventListener('open-ai-assistant', openAIHandler as EventListener);
    return () => {
      window.removeEventListener('open-ai-assistant', openAIHandler as EventListener);
    };
  }, []);

  const isViewSubmissionsUnlocked = useMemo(() => {
    if (!currentTaskMeta?.votingStartDate) return false;
    const start = new Date(currentTaskMeta.votingStartDate);
    if (Number.isNaN(start.getTime())) return false;
    return Date.now() >= start.getTime();
  }, [currentTaskMeta?.votingStartDate]);

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
    const cloned = cloneFileNodes(initialFiles);
    setCurrentFiles(cloned);

    const metadataMap: Record<string, { name: string; language?: string }> = {};
    flattenFileNodes(cloned).forEach(node => {
      if (node && node.type === 'file') {
        const key = node.id || node.name;
        if (key) {
          metadataMap[key] = { name: node.name || key, language: node.language };
        }
      }
    });
    fileMetadataRef.current = metadataMap;
  }, [initialFiles]);

  useEffect(() => {
    unloadLoggedRef.current = false;
  }, [selectedTask, currentTaskMeta]);

  useEffect(() => {
    if (!currentTaskMeta) return;
    const task = allTasks.find(t => t?.id === currentTaskMeta.id);
    if (!task) return;
    setCurrentTaskMeta(prev => {
      if (!prev || prev.id !== currentTaskMeta.id) return prev;
      const nextProjectId = task.projectId ?? prev.projectId;
      const nextName = prev.name ?? task.name;
      const normalizedPrevVoting = prev.votingStartDate ?? null;
      const nextVotingStartDate = task.votingStartDate ?? normalizedPrevVoting;
      const normalizedPrevVotingEnd = prev.votingEndDate ?? null;
      const nextVotingEndDate = task.votingEndDate ?? normalizedPrevVotingEnd;
      const normalizedPrevCodeStart = prev.codeStartDate ?? null;
      const nextCodeStartDate = task.codeStartDate ?? normalizedPrevCodeStart;

      const projectIdUnchanged = nextProjectId === prev.projectId;
      const nameUnchanged = nextName === prev.name;
      const votingDateUnchanged = nextVotingStartDate === normalizedPrevVoting;
      const votingEndUnchanged = nextVotingEndDate === normalizedPrevVotingEnd;
      const codeStartUnchanged = nextCodeStartDate === normalizedPrevCodeStart;

      if (projectIdUnchanged && nameUnchanged && votingDateUnchanged && votingEndUnchanged && codeStartUnchanged) {
        return prev;
      }

      return {
        ...prev,
        projectId: nextProjectId,
        name: nextName,
        votingStartDate: nextVotingStartDate,
        votingEndDate: nextVotingEndDate,
        codeStartDate: nextCodeStartDate,
      };
    });
  }, [allTasks, currentTaskMeta]);

  const viewSubmissionsTooltip = isViewSubmissionsUnlocked
    ? 'View community submissions.'
    : 'The voting period has not started yet.';

  useEffect(() => {
    try {
      const nowIso = new Date().toISOString();
      console.log('[ViewSubmissions] lock state updated', {
        unlocked: isViewSubmissionsUnlocked,
        votingStartDate: currentTaskMeta?.votingStartDate ?? null,
        now: nowIso,
      });
    } catch (error) {
      // no-op: logging should never break app flow
    }
  }, [isViewSubmissionsUnlocked, currentTaskMeta?.votingStartDate]);

  // Track AI code load timestamp for marking saves as AI_generated
  const aiCodeLoadedTimestampRef = useRef<number | null>(null);
  const AI_CODE_LOAD_WINDOW_MS = 10000; // 10 seconds window to mark saves as AI_generated
  
  // Reset timestamp when pendingAgentChanges is cleared/rejected
  const prevPendingAgentChangesRef = useRef<any>(null);
  useEffect(() => {
    const hasContent = !!(pendingAgentChanges?.modified && Object.keys(pendingAgentChanges.modified).length > 0);
    if (!hasContent) {
      // AI code was cleared/rejected, reset timestamp
      aiCodeLoadedTimestampRef.current = null;
    }
    prevPendingAgentChangesRef.current = pendingAgentChanges;
  }, [pendingAgentChanges]);

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

  // Load tasks from API (backed by data/dummy_tasks.json)
  useEffect(() => {
    const abortController = new AbortController();
    
    const loadTasks = async () => {
      try {
        const res = await fetch('/api/tasks', { signal: abortController.signal });
        if (res.ok) {
          const data = await res.json();
          const tasks = Array.isArray(data.tasks) ? data.tasks : [];
          setAllTasks(tasks);
          setFilteredTasks(tasks);
        } else {
          console.error('Failed to load tasks:', res.status, res.statusText);
          setAllTasks([]);
          setFilteredTasks([]);
        }
      } catch (error: any) {
        // Ignore abort errors
        if (error.name === 'AbortError') {
          return;
        }
        console.error('Error loading tasks:', error);
        setAllTasks([]);
        setFilteredTasks([]);
      } finally {
        setIsLoadingTasks(false);
      }
    };
    loadTasks();
    
    return () => {
      abortController.abort();
    };
  }, []);

  // Ignore live content changes for preview; only refresh on save
  const handleFileContentChange = useCallback(() => {
    const editorApi = actualEditorRef?.current;
    if (!editorApi || typeof editorApi.getAllFileContents !== 'function') {
      return;
    }

    try {
      const contents: Record<string, string> = editorApi.getAllFileContents() || {};

      setCurrentFiles(prev => {
        const source = (prev && prev.length > 0) ? prev : cloneFileNodes(initialFiles);

        const applyContents = (nodes: any[]): any[] =>
          nodes.map(node => {
            if (!node) return node;
            if (node.type === 'file') {
              const key = node.id || node.name;
              const nextContent = key != null ? contents[key] ?? node.content ?? '' : node.content ?? '';
              return {
                ...node,
                content: nextContent,
              };
            }
            if (Array.isArray(node.children)) {
              return {
                ...node,
                children: applyContents(node.children),
              };
            }
            return { ...node };
          });

        return applyContents(source);
      });

      const metadataMap = { ...fileMetadataRef.current };
      Object.entries(contents).forEach(([fileId]) => {
        if (!metadataMap[fileId]) {
          metadataMap[fileId] = {
            name: fileId,
            language: determineLanguageKey(undefined, fileId) || undefined,
          };
        }
      });
      fileMetadataRef.current = metadataMap;
    } catch (error) {
      console.warn('Failed to synchronize file contents from editor', error);
    }
  }, [actualEditorRef, initialFiles]);

  const getCodeByLanguage = useCallback((): Record<string, string> | null => {
    const editorApi = actualEditorRef?.current;
    if (!editorApi || typeof editorApi.getAllFileContents !== 'function') {
      return null;
    }

    try {
      const contents: Record<string, string> = editorApi.getAllFileContents() || {};
      const metadataMap = fileMetadataRef.current || {};
      const result: Record<string, string> = {};

      Object.entries(contents).forEach(([fileId, content]) => {
        const meta = metadataMap[fileId] || { name: fileId };
        const key = determineLanguageKey(meta.language, meta.name || fileId);
        if (key) {
          result[key] = typeof content === 'string' ? content : String(content ?? '');
        }
      });

      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      console.warn('Failed to collect code by language', error);
      return null;
    }
  }, [actualEditorRef]);

  const buildCodeLogPayload = useCallback((event: CodeLogEvent, context: Record<string, any> = {}) => {
    if (!user?.id) {
      console.log('[code-log] skip: no user id');
      return null;
    }

    const numericUserId = Number.parseInt(user.id, 10);
    if (!Number.isFinite(numericUserId)) {
      console.log('[code-log] skip: user id not numeric', user?.id);
      return null;
    }

    if (!selectedTask || !currentTaskMeta) {
      console.log('[code-log] skip: no selected task or currentTaskMeta', { selectedTask, currentTaskMeta });
      return null;
    }

    const projectId = currentTaskMeta.projectId ?? allTasks.find((task: any) => task?.id === currentTaskMeta.id)?.projectId;
    if (!projectId) {
      console.log('[code-log] skip: no project id', { currentTaskMeta, selectedTask });
      return null;
    }

    const codeByLanguage = getCodeByLanguage();
    if (!codeByLanguage) {
      console.log('[code-log] skip: no code by language');
      return null;
    }

    // Check if diffEditor is active by checking if pendingAgentChanges has any modified files
    const isDiffMode = !!(pendingAgentChanges?.modified && 
                         Object.keys(pendingAgentChanges.modified).length > 0);

    // Check if this is a save shortly after AI code was loaded
    const isAiGeneratedMode = event === 'save-shortcut' && 
                              aiCodeLoadedTimestampRef.current !== null &&
                              (Date.now() - aiCodeLoadedTimestampRef.current) <= AI_CODE_LOAD_WINDOW_MS;

    // If in diff mode, convert original code from fileId-based to language-based
    let originalCodeByLanguage: Record<string, string> | undefined = undefined;
    if (isDiffMode && pendingAgentChanges?.original) {
      originalCodeByLanguage = {};
      const metadataMap = fileMetadataRef.current || {};
      
      Object.entries(pendingAgentChanges.original).forEach(([fileId, originalContent]) => {
        const meta = metadataMap[fileId] || { name: fileId };
        const key = determineLanguageKey(meta.language, meta.name || fileId);
        if (key && originalContent && originalCodeByLanguage) {
          originalCodeByLanguage[key] = typeof originalContent === 'string' ? originalContent : String(originalContent ?? '');
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
      isPreviewVisible: showCodingTerminal && selectedTask && leftTab === 'preview',
      codeLengths: Object.fromEntries(
        Object.entries(codeByLanguage).map(([key, value]) => [key, value?.length || 0])
      ),
      files: Object.fromEntries(
        Object.entries(fileMetadataRef.current || {}).map(([fileId, meta]) => [
          fileId,
          {
            name: meta?.name,
            language: meta?.language,
          },
        ])
      ),
      // Include original code in metadata when in diff mode
      ...(isDiffMode && originalCodeByLanguage && Object.keys(originalCodeByLanguage).length > 0 
          ? { originalCode: originalCodeByLanguage } 
          : {}),
      ...context,
    };

    // Determine mode: keep/reject actions take precedence, then AI (for automatic AI refreshes), then AI_generated (for saves after AI code), then diff, then regular
    let mode: string;
    if (event === 'keep' || event === 'keep_all') {
      mode = event === 'keep_all' ? 'keep_all' : 'keep';
    } else if (event === 'reject' || event === 'reject_all') {
      mode = event === 'reject_all' ? 'reject_all' : 'reject';
    } else if (event === 'AI-refresh') {
      mode = 'AI';
    } else if (isAiGeneratedMode) {
      mode = 'AI_generated';
    } else if (isDiffMode) {
      mode = 'diff';
    } else {
      mode = 'regular';
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
  }, [user, selectedTask, currentTaskMeta, getCodeByLanguage, leftTab, showCodingTerminal, allTasks, pendingAgentChanges]);

  const sendCodeLog = useCallback(async (event: CodeLogEvent, context: Record<string, any> = {}) => {
    const payload = buildCodeLogPayload(event, context);
    if (!payload) return;

    try {
      // Temporary debug logging to verify payloads
      console.log('[code-log] sending snapshot', event, payload);
      await fetch(`${ENV.BACKEND_URL}/api/code-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn('Failed to log code snapshot', error);
    }
  }, [buildCodeLogPayload]);

  const sendCodeLogBeacon = useCallback((event: CodeLogEvent, context: Record<string, any> = {}) => {
    const payload = buildCodeLogPayload(event, context);
    if (!payload) return;

    if (event === 'before-unload') {
      if (unloadLoggedRef.current) return;
      unloadLoggedRef.current = true;
    }

    const url = `${ENV.BACKEND_URL}/api/code-logs`;
    const body = JSON.stringify(payload);

    try {
      let dispatched = false;

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        console.log('[code-log] beacon snapshot', event, payload);
        dispatched = navigator.sendBeacon(url, blob);
      }

      if (!dispatched) {
        console.log('[code-log] fallback fetch snapshot', event, payload);
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
          keepalive: true,
        }).catch(error => console.warn('Failed to beacon code snapshot', error));
      }
    } catch (error) {
      console.warn('Failed to dispatch code snapshot beacon', error);
    }
  }, [buildCodeLogPayload]);

  const handlePreviewRefresh = useCallback((source: string) => {
    // Skip logging for external refreshes (they're triggered programmatically and log separately)
    if (source === 'external') {
      return;
    }
    void sendCodeLog('preview-refresh', { refreshSource: source });
  }, [sendCodeLog]);

  // Handle Cmd/Ctrl+S from the editor - refresh preview if it's visible
  const handleSaveShortcut = (_fileId?: string) => {
    void sendCodeLog('save-shortcut');

    const isPreviewVisible = showCodingTerminal && selectedTask && leftTab === 'preview';
    if (!isPreviewVisible) {
      return;
    }

    // Best-effort refresh of the active preview iframe
    try {
      previewTabRef.current?.refreshPreview();
    } catch (error) {
      console.warn('Failed to refresh preview on save shortcut:', error);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      sendCodeLogBeacon('before-unload');
    };

    const handlePageHide = (event: any) => {
      if (event?.persisted) {
        return;
      }
      sendCodeLogBeacon('before-unload');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [sendCodeLogBeacon]);

  const defaultFileName = (type: string): string => {
    switch (type) {
      case 'html':
        return 'index.html';
      case 'css':
        return 'styles.css';
      case 'js':
        return 'script.js';
      default:
        return `${type}.txt`;
    }
  };

  function cloneFileNodes(nodes: any[] | undefined): any[] {
    if (!Array.isArray(nodes)) {
      return [];
    }
    return nodes.map(node => ({
      ...node,
      children: Array.isArray(node?.children) ? cloneFileNodes(node.children) : node?.children,
    }));
  }

  function flattenFileNodes(nodes: any[] | undefined): any[] {
    if (!Array.isArray(nodes)) {
      return [];
    }
    const result: any[] = [];
    const stack = [...nodes];
    while (stack.length) {
      const current = stack.shift();
      if (!current) continue;
      result.push(current);
      if (Array.isArray(current.children) && current.children.length > 0) {
        stack.unshift(...current.children);
      }
    }
    return result;
  }

  function determineLanguageKey(language?: string, name?: string): string | null {
    const lang = (language || '').toLowerCase();
    if (lang.includes('html')) return 'html';
    if (lang.includes('css')) return 'css';
    if (lang.includes('javascript') || lang === 'js') return 'js';
    if (lang.includes('typescript') || lang === 'ts') return 'js';

    const lowerName = (name || '').toLowerCase();
    if (lowerName.endsWith('.html')) return 'html';
    if (lowerName.endsWith('.css')) return 'css';
    if (
      lowerName.endsWith('.js') ||
      lowerName.endsWith('.mjs') ||
      lowerName.endsWith('.cjs') ||
      lowerName.endsWith('.ts') ||
      lowerName.endsWith('.tsx') ||
      lowerName.endsWith('.jsx')
    ) {
      return 'js';
    }

    return null;
  }

  // Handler for AI Assistant submit
  const handleAssistantSubmit = async (message: string) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    const createMessageId = () => `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const appendMessage = (item: AssistantItem) => {
      setAssistantMessages(prev => [...prev, { ...item, id: item.id ?? createMessageId() }]);
    };
    const updateMessage = (id: string, updates: Partial<AssistantItem>) => {
      setAssistantMessages(prev => prev.map(msg => (msg.id === id ? { ...msg, ...updates } : msg)));
    };

    // Clear all suggestions when user submits a new query
    setAssistantMessages(prev => prev.filter(msg => msg.type !== 'suggestions'));
    
    setSummaryGenerated(false);
    latestSuggestionsRef.current = [];
    
    appendMessage({ type: 'user', message: trimmedMessage });
    setAwaitingResponse(true);

    // Get current files from editor
    const files = { html: '', css: '', js: '' };
    const fileIdsByType: Record<string, string> = {};
    const fileNamesByType: Record<string, string> = {};
    let allContents: Record<string, string> = {};

    if (actualEditorRef?.current?.getAllFileContents) {
      allContents = actualEditorRef.current.getAllFileContents();

      Object.entries(allContents).forEach(([fileId, content]) => {
        const file = currentFiles.find(f => f.id === fileId || f.name === fileId);
        const fileNameRaw = file?.name || fileId || '';
        const fileName = fileNameRaw.toLowerCase();
        const contentStr = String(content || '');

        const assignIfEmpty = (type: 'html' | 'css' | 'js') => {
          if (!files[type]) {
            files[type] = contentStr;
            fileIdsByType[type] = fileId;
            fileNamesByType[type] = file?.name || fileId || defaultFileName(type);
          }
        };

        if (fileName.endsWith('.html') || file?.language === 'html') {
          assignIfEmpty('html');
        } else if (fileName.endsWith('.css') || file?.language === 'css') {
          assignIfEmpty('css');
        } else if (
          ((fileName.endsWith('.js') || fileName.endsWith('.javascript')) && !fileName.endsWith('.json')) ||
          file?.language === 'javascript'
        ) {
          assignIfEmpty('js');
        }
      });
    }

    const fallbackNames: Record<string, string> = {
      html: fileNamesByType['html'] || 'index.html',
      css: fileNamesByType['css'] || 'styles.css',
      js: fileNamesByType['js'] || 'script.js',
    };

    const toolMessageIds = new Map<string, string>();
    let finalPayload: any = null;

    let wasAborted = false;
    try {
      console.log('Files being sent to agent (stream):', {
        html_length: files.html.length,
        css_length: files.css.length,
        js_length: files.js.length,
        fileIdsByType,
        currentFiles: currentFiles.map(f => ({ id: f.id, name: f.name, language: f.language })),
      });

      const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
      const controller = new AbortController();
      assistantAbortControllerRef.current = controller;
      const response = await fetch(`${ENV.BACKEND_URL}/api/agent-chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: trimmedMessage,
          files,
          taskId: taskId || currentTaskMeta?.id || null,
          taskName: currentTaskMeta?.name || null,
          userId: numericUserId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start agent stream');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response not supported');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const maybeHandleChunk = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;
        let payload: any;
        try {
          payload = JSON.parse(line);
        } catch (err) {
          console.warn('Failed to parse agent stream chunk:', line, err);
          return;
        }

        const state = payload?.state;
        const data = payload?.data ?? {};

        switch (state) {
          case 'restate': {
            if (data.restate) {
              appendMessage({ type: 'assistant', message: data.restate });
            }
            break;
          }
          case 'plan': {
            // Currently unused in UI
            break;
          }
          case 'signpost': {
            const signpost = data.signpost;
            const targetFiles: string[] = data.target_files ?? [];
            if (signpost) {
              appendMessage({ type: 'assistant', message: signpost });
            }
            targetFiles.forEach((fileType: string) => {
              const key = `${data.index ?? ''}-${fileType}`;
              if (!toolMessageIds.has(key)) {
                const displayName = fallbackNames[fileType] || defaultFileName(fileType);
                const id = createMessageId();
                toolMessageIds.set(key, id);
                appendMessage({
                  id,
                  type: 'tool',
                  message: `Editing ${displayName}`,
                  fileName: displayName,
                  status: 'pending',
                });
              }
            });
            break;
          }
          case 'tool_result': {
            const targetFiles: string[] = data.target_files ?? [];
            const diffStats: Record<string, { additions?: number; deletions?: number }> = data.diff_stats ?? {};
            const filename: string | undefined = data.filename;
            const updatedContent: string | undefined = data.updated_content;
            targetFiles.forEach((fileType: string) => {
              const key = `${data.index ?? ''}-${fileType}`;
              const messageId = toolMessageIds.get(key);
              if (messageId) {
                updateMessage(messageId, {
                  status: 'done',
                  diff: {
                    additions: diffStats?.[fileType]?.additions ?? 0,
                    deletions: diffStats?.[fileType]?.deletions ?? 0,
                  },
                });
              }
            });
            
            // Trigger preview refresh when file editing is completed (tool_result received)
            if (targetFiles.length > 0 && updatedContent) {
              setTimeout(() => {
                try {
                  previewTabRef.current?.refreshPreview();
                  // Automatically save code with mode "AI" when automatic refresh happens
                  void sendCodeLog('AI-refresh', { 
                    refreshSource: 'tool_result',
                    targetFiles,
                    filename 
                  });
                } catch (error) {
                  console.warn('Failed to refresh preview when file editing completed:', error);
                }
              }, 100); // Small delay to ensure editor content is updated
            }

            // If backend provided updated content and filename, immediately stage a per-file diff and focus it
            if (filename && typeof updatedContent === 'string') {
              // Map filename -> fileType used earlier (html/css/js)
              const lower = filename.toLowerCase();
              let ftype: 'html' | 'css' | 'js' | null = null;
              if (lower.endsWith('index.html') || lower.endsWith('.html')) ftype = 'html';
              else if (lower.endsWith('styles.css') || lower.endsWith('.css')) ftype = 'css';
              else if (lower.endsWith('frontend.js') || lower.endsWith('.js')) ftype = 'js';

              if (ftype) {
                const fileId = fileIdsByType[ftype];
                if (fileId) {
                  const originalContent = (allContents && typeof allContents[fileId] === 'string')
                    ? allContents[fileId]
                    : (currentFiles.find(f => f.id === fileId)?.content ?? '');

                  setPendingAgentChanges((prev: any) => {
                    const next = {
                      original: { ...(prev?.original || {}) },
                      modified: { ...(prev?.modified || {}) },
                      summary: prev?.summary,
                      steps: prev?.steps,
                    } as any;
                    const baseOriginal = (prev && prev.original && prev.original[fileId] != null)
                      ? String(prev.original[fileId] ?? '')
                      : String(originalContent ?? '');
                    next.original[fileId] = baseOriginal;
                    next.modified[fileId] = String(updatedContent);
                    return next;
                  });

                  // Notify editor to refresh diff modified content immediately
                  try {
                    window.dispatchEvent(new CustomEvent('editor-update-diff-modified', { detail: { fileId, content: String(updatedContent) } }));
                  } catch {}

                  // Do not switch focus automatically; keep user's current tab/editor active
                }
              }
            }
            break;
          }
          case 'summary': {
            if (data.summary) {
              appendMessage({ type: 'assistant', message: data.summary });
              setSummaryGenerated(true);
            }
            break;
          }
          case 'suggestions': {
            const suggestions: string[] = Array.isArray(data.suggestions) ? data.suggestions : [];
            if (suggestions.length) {
              latestSuggestionsRef.current = suggestions;
              appendMessage({ type: 'suggestions', suggestions });
            }
            break;
          }
          case 'error': {
            const messageText = data.message || 'Unknown error';
            appendMessage({ type: 'assistant', message: `Error: ${messageText}` });
            break;
          }
          case 'complete': {
            finalPayload = data;
            break;
          }
          default: {
            break;
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(maybeHandleChunk);
      }

      if (buffer) {
        maybeHandleChunk(buffer);
      }

    } catch (error: any) {
      console.error('Error during agent stream:', error);
      toolMessageIds.forEach((msgId) => {
        if (msgId) {
          updateMessage(msgId, { status: 'done' });
        }
      });
      if (error?.name === 'AbortError') {
        wasAborted = true;
        appendMessage({ type: 'system', message: 'Stopped coding' });
        // Restore original query and focus input
        try {
          setAssistantInputValue(trimmedMessage);
          setTimeout(() => {
            assistantTerminalPaneRef.current?.focusInput?.();
          }, 0);
        } catch {}
      } else {
        appendMessage({ type: 'assistant', message: `Error: ${(error as Error).message}` });
      }
    } finally {
      setAwaitingResponse(false);
      assistantAbortControllerRef.current = null;
      // After successful completion or non-abort error, clear the input
      if (!wasAborted) {
        try { setAssistantInputValue(''); } catch {}
      }
    }

    if (finalPayload && finalPayload.final_files && Object.keys(finalPayload.final_files).length > 0) {
      const originalFiles: Record<string, string> = {};
      const modifiedFilesByFileId: Record<string, string> = {};

      ['html', 'css', 'js'].forEach(type => {
        const fileId = fileIdsByType[type];
        const modifiedContent = finalPayload.final_files[type];
        if (fileId && typeof modifiedContent === 'string') {
          const originalContent =
            (allContents && typeof allContents[fileId] === 'string')
              ? allContents[fileId]
              : (currentFiles.find(f => f.id === fileId)?.content ?? '');
          const priorOriginal = pendingAgentChanges?.original?.[fileId];
          originalFiles[fileId] = priorOriginal != null
            ? String(priorOriginal)
            : String(originalContent ?? '');
          modifiedFilesByFileId[fileId] = modifiedContent;

          // Notify editor to refresh diff modified content immediately for final payload
          try {
            window.dispatchEvent(new CustomEvent('editor-update-diff-modified', { detail: { fileId, content: String(modifiedContent) } }));
          } catch {}
        }
      });

      if (Object.keys(modifiedFilesByFileId).length > 0) {
        console.log('Storing pending agent changes (stream):', {
          originalFileIds: Object.keys(originalFiles),
          modifiedFileIds: Object.keys(modifiedFilesByFileId),
        });
        
        // Record timestamp when AI code is loaded for marking saves as AI_generated
        aiCodeLoadedTimestampRef.current = Date.now();
        
        setPendingAgentChanges({
          original: originalFiles,
          modified: modifiedFilesByFileId,
          summary: finalPayload.summary,
          steps: finalPayload.steps,
        });
      }
    }
  };

  const handleSuggestionSelection = useCallback(async (suggestion: string) => {
    const cleaned = (suggestion || '').trim();
    if (!cleaned) return;

    const suggestions = latestSuggestionsRef.current;
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return;
    }

    try {
      const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
      await fetch(`${ENV.BACKEND_URL}/api/code-preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suggestions,
          user_selection: cleaned,
          taskId: taskId || currentTaskMeta?.id || null,
          task_name: currentTaskMeta?.name || null,
          user_id: numericUserId,
        }),
      });
    } catch (error) {
      console.warn('Failed to log suggestion selection', error);
    }
  }, [taskId, currentTaskMeta, user]);

  // Resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleVerticalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsVerticalResizing(true);
  };

  const handleEditorMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsEditorResizing(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const containerWidth = rect.width;
    const resizeHandleWidth = 4;
    const relativeX = e.clientX - rect.left;
    let newLeftWidth = relativeX - (resizeHandleWidth / 2);
    if (isSwapped) {
      newLeftWidth = containerWidth - relativeX - (resizeHandleWidth / 2);
    }
    const minWidthPercent = 25;
    const minWidth = (containerWidth * minWidthPercent) / 100;
    const rightMinWidth = (containerWidth * 30) / 100; // RIGHT_MIN_WIDTH_PERCENT
    const maxWidth = Math.max(minWidth, containerWidth - rightMinWidth - resizeHandleWidth);
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newLeftWidth));

    // Save last constrained width for commit on mouseup
    lastConstrainedWidthRef.current = constrainedWidth;
    pendingLeftWidthRef.current = constrainedWidth;

    // Apply width directly via rAF to avoid React re-render on every mousemove
    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true;
      requestAnimationFrame(() => {
        rafScheduledRef.current = false;
        if (leftPaneRef.current) {
          try {
            leftPaneRef.current.style.width = `${pendingLeftWidthRef.current}px`;
          } catch (e) {
            // no-op
          }
        }
      });
    }
  };

  const handleVerticalMouseMove = (e: MouseEvent) => {
    if (!isVerticalResizing) return;
    
    const containerHeight = window.innerHeight - 32;
    const resizeHandleHeight = 16;
    const padding = 16;
    
    const relativeY = e.clientY - padding;
    const newTaskHeight = relativeY;
    
    const minHeightPercent = 25;
    const maxHeightPercent = 75;
    const minHeight = (containerHeight * minHeightPercent) / 100;
    const maxHeight = (containerHeight * maxHeightPercent) / 100;
    const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newTaskHeight));
    setTaskInstructionHeight(constrainedHeight);
  };

  const handleEditorMouseMove = (e: MouseEvent) => {
    if (!isEditorResizing) return;
    
    const containerHeight = window.innerHeight - 32;
    const resizeHandleHeight = 16;
    const padding = 16;
    
    const relativeY = e.clientY - padding;
    const newEditorHeight = relativeY;
    
    const minHeightPercent = 20;
    const maxHeightPercent = 70;
    const minHeight = (containerHeight * minHeightPercent) / 100;
    const maxHeight = (containerHeight * maxHeightPercent) / 100;
    const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newEditorHeight));
    setEditorHeight(constrainedHeight);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
    setIsVerticalResizing(false);
    setIsEditorResizing(false);
    // Commit final width to state (single React update)
    if (lastConstrainedWidthRef.current > 0) {
      setLeftColumnWidth(lastConstrainedWidthRef.current);
    }
    try {
      (actualEditorRef.current as any)?.layout?.();
    } catch (e) {
      // no-op
    }
  };

  // Add global mouse event listeners
  useEffect(() => {
    if (isResizing || isVerticalResizing || isEditorResizing) {
      let mouseMoveHandler: (e: MouseEvent) => void;
      if (isResizing) mouseMoveHandler = handleMouseMove;
      else if (isVerticalResizing) mouseMoveHandler = handleVerticalMouseMove;
      else if (isEditorResizing) mouseMoveHandler = handleEditorMouseMove;
      else return;
      
      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isResizing ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousemove', handleVerticalMouseMove);
      document.removeEventListener('mousemove', handleEditorMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousemove', handleVerticalMouseMove);
      document.removeEventListener('mousemove', handleEditorMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, isVerticalResizing, isEditorResizing]);

  // Filter tasks based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredTasks(allTasks);
    } else {
      const filtered = allTasks.filter(task =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredTasks(filtered);
    }
  }, [searchQuery, allTasks]);

  // Full task list now loaded from /api/tasks into allTasks state
  useEffect(() => {
    setFilteredTasks(allTasks);
  }, [allTasks]);

  // Track when we want to focus the assistant input
  const [shouldFocusAssistant, setShouldFocusAssistant] = useState(false);

  // Focus assistant input when it becomes available and we requested focus
  useEffect(() => {
    if (shouldFocusAssistant && showAIAssistant && assistantTerminalPaneRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        assistantTerminalPaneRef.current?.focusInput();
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
              const monacoEditor = (actualEditorRef.current as any)?.getMonacoEditor?.();
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
            assistantTerminalPaneRef.current?.focusInput();
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
        setShowAIAssistant(prev => !prev);
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
            try { console.log('⌘( pressed: switching right pane to Code'); } catch(_) {}
            setRightTab('code');
          } else if (isCloseParen && isViewSubmissionsUnlocked) {
            try { console.log('⌘) pressed: switching right pane to View Submissions'); } catch(_) {}
            setRightTab('submissions');
          }
          return;
        }
        if (!isTyping && (isBracketLeft || isBracketRight)) {
          event.preventDefault();
          event.stopPropagation();
          try { (event as any).stopImmediatePropagation?.(); } catch(_) {}
          if (isBracketLeft) {
            try { console.log('⌘[ pressed: switching left pane to Task'); } catch(_) {}
            setLeftTab('task');
          } else if (isBracketRight) {
            // Switch to preview or project details based on tab
            if (rightTab === 'submissions' && viewedSubmission) {
              try { console.log('⌘] pressed: switching left pane to Project Details'); } catch(_) {}
              setLeftTab('project-details');
            } else if (rightTab !== 'submissions') {
              try { console.log('⌘] pressed: switching left pane to Preview'); } catch(_) {}
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
        setSidebarOpen(prev => !prev);
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

  // Generate initial files for each task type
  const getInitialFilesForTask = async (
    taskId: string,
    abortSignal?: AbortSignal
  ): Promise<{
    files: any[];
    projectId: number | null;
    votingStartDate: string | null;
    codeStartDate: string | null;
    votingEndDate: string | null;
  }> => {
    try {
      // Include userId if user is authenticated
      const userIdParam = user?.id ? `&userId=${encodeURIComponent(user.id)}` : '';
      const response = await fetch(`/api/task-files?taskId=${taskId}${userIdParam}`, { signal: abortSignal });
      if (response.ok) {
        const data = await response.json();
        const files = Array.isArray(data.files) ? data.files : [];
        const projectId = typeof data.projectId === 'number' ? data.projectId : null;
        const votingStartDate = typeof data.votingStartDate === 'string' ? data.votingStartDate : null;
        const codeStartDate = typeof data.codeStartDate === 'string' ? data.codeStartDate : null;
        const votingEndDate = typeof data.votingEndDate === 'string' ? data.votingEndDate : null;
        return { files, projectId, votingStartDate, codeStartDate, votingEndDate };
      } else {
        console.error('Failed to load task files:', response.statusText);
        return { files: [], projectId: null, votingStartDate: null, codeStartDate: null, votingEndDate: null };
      }
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError') {
        return { files: [], projectId: null, votingStartDate: null, codeStartDate: null, votingEndDate: null };
      }
      console.error('Error loading task files:', error);
      return { files: [], projectId: null, votingStartDate: null, codeStartDate: null, votingEndDate: null };
    }
  };

  // Helper functions to get task data
  // Intentionally omit requirements and video demo from Task pane

  const getTaskDescription = (taskId: string): string => {
    const task = allTasks.find(t => t.id === taskId);
    return task?.description || "";
  };

  // Function to load and organize test cases
  const loadTestCases = async (task: any, abortSignal?: AbortSignal) => {
    try {
      // Check if there are any tests defined in the task
      const tests = task?.tests || [];
      if (!tests || tests.length === 0) {
        setTestCases([]);
        return;
      }

      const response = await fetch(`${ENV.BACKEND_URL}/api/load-test-cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          task, 
          public_only: ENV.SHOW_PUBLIC_TESTS_ONLY 
        }),
        signal: abortSignal,
      });
      
      if (response.ok) {
        const data = await response.json();
        setTestCases(data.testCases || []);
      } else {
        console.error("Failed to load test cases:", response.status, response.statusText);
        setTestCases([]);
      }
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError') {
        return;
      }
      console.error("Error loading test cases:", error);
      setTestCases([]);
    }
  };

  const startTask = async (taskId: string, updateUrl: boolean) => {
    // Abort any previous task loading requests
    if (taskAbortControllerRef.current) {
      taskAbortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    taskAbortControllerRef.current = abortController;
    
    // Batch critical state updates to prevent glitching using React transitions
    setIsTransitioning(true);
    startTransition(() => {
      setSelectedTask(taskId);
      setTaskId(taskId);
      setShowCodingTerminal(true);
      // Default left pane to Task tab
      setLeftTab('task');
      setIsTransitioning(false);
    });

    const description = getTaskDescription(taskId);
    setTaskDescriptions([description]);

    const {
      files,
      projectId: fetchedProjectId,
      votingStartDate: fetchedVotingStartDate,
      codeStartDate: fetchedCodeStartDate,
      votingEndDate: fetchedVotingEndDate,
    } = await getInitialFilesForTask(taskId, abortController.signal);
    setInitialFiles(files);

    const task = allTasks.find(t => t.id === taskId);
    const resolvedProjectId = fetchedProjectId ?? task?.projectId ?? null;
    setCurrentTaskMeta(
      task
        ? {
            id: task.id,
            name: task.name,
            projectId: resolvedProjectId ?? undefined,
            votingStartDate: task.votingStartDate ?? fetchedVotingStartDate ?? null,
            votingEndDate: task.votingEndDate ?? fetchedVotingEndDate ?? null,
            codeStartDate: task.codeStartDate ?? fetchedCodeStartDate ?? null,
          }
        : {
            id: taskId,
            projectId: resolvedProjectId ?? undefined,
            votingStartDate: fetchedVotingStartDate ?? null,
            votingEndDate: fetchedVotingEndDate ?? null,
            codeStartDate: fetchedCodeStartDate ?? null,
          }
    );
    latestSuggestionsRef.current = [];
    if (task) {
      loadTestCases(task, abortController.signal);
    }

    const viewportHeight = window.innerHeight - 32;
    const halfHeight = viewportHeight * 0.5;
    setTaskInstructionHeight(halfHeight);
    setEditorHeight(halfHeight);
    // Width will be set using container width via rAF after layout
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const handleWidth = 4;
        const leftWidth = (rect.width - handleWidth) * (1/3);
        setLeftColumnWidth(leftWidth);
      }
    });

    if (updateUrl) {
      router.push(`/vibe?task=${taskId}`);
    }
  };

  // Handle task parameter from URL
  useEffect(() => {
    const handleTaskParam = async () => {
      const taskParam = searchParams.get('task');
      
      if (taskParam && allTasks.length > 0) {
        const task = allTasks.find(t => t.id === taskParam);
        if (task && selectedTask !== task.id) {
          // Use startTask to properly initialize everything
          await startTask(task.id, false); // false = don't update URL since we're already there
        }
      } else if (!taskParam && (pathname === '/browse' || pathname === '/vibe' || pathname === '/') && showCodingTerminal) {
        // No task param and we're in coding terminal mode, exit it
        setShowCodingTerminal(false);
        setSelectedTask(null);
        setTaskId("");
        setCurrentTaskMeta(null);
        latestSuggestionsRef.current = [];
        setActiveTab('tasks');
      }
    };

    handleTaskParam();
  }, [searchParams, allTasks, selectedTask, pathname, showCodingTerminal]);

  // Force hide tooltips when activeTab changes
  useEffect(() => {
    // Hide React state-based tooltips immediately
    setTooltipVisible(false);
    setTooltipText("");
    
    // Hide all CSS-based tooltips by adding a class that forces them to be hidden
    document.body.classList.add('force-hide-tooltips');
    
    // Remove the class after a delay to allow normal tooltip behavior
    const timer = setTimeout(() => {
      document.body.classList.remove('force-hide-tooltips');
    }, 100);

    return () => {
      clearTimeout(timer);
      document.body.classList.remove('force-hide-tooltips');
    };
  }, [activeTab]);

  // Force hide tooltips when activeTab changes
  useEffect(() => {
    setTooltipVisible(false);
    setTooltipText("");
  }, [activeTab]);

  // Force hide tooltips when showCodingTerminal changes (when entering/exiting task mode)
  useEffect(() => {
    setTooltipVisible(false);
    setTooltipText("");
  }, [showCodingTerminal]);

  // Sync activeTab with pathname
  useEffect(() => {
    const path = pathname;
    if (path === '/leaderboard' || path === '/leaderboard/') {
      setActiveTab('leaderboard');
    } else if (path === '/skill-check' || path === '/skill-check/') {
      setActiveTab('skill-check');
    } else if (path === '/about' || path === '/about/') {
      setActiveTab('about');
    } else if (path === '/browse' || path === '/' || path === '/vibe') {
      setActiveTab('tasks');
    }
  }, [pathname]);

  // When switching to Tasks tab, ensure URL and state reflect the list view
  // But only if there's no task parameter in the URL
  useEffect(() => {
    const taskParam = searchParams.get('task');
    // List of valid routes that should not be redirected
    const validRoutes = ['/browse', '/', '/vibe', '/leaderboard', '/skill-check', '/about'];
    const currentPath = pathname;
    
    // If we're on a valid route that's not the tasks route, don't redirect
    // (This handles navigation to leaderboard, skill-check, about, etc.)
    if (validRoutes.includes(currentPath) && !['/browse', '/', '/vibe'].includes(currentPath)) {
      return; // Let the pathname sync effect handle setting the correct activeTab
    }
    
    if (activeTab === 'tasks' && !taskParam) {
      setExpandedTask(null);
      setShowCodingTerminal(false);
      setSelectedTask(null);
      setTaskId("");
      setCurrentTaskMeta(null);
      latestSuggestionsRef.current = [];
      try {
        // Only redirect to /browse if we're not already on a valid route
        if (!validRoutes.includes(currentPath)) {
          window.history.pushState(null, '', '/browse');
        }
      } catch (e) {
        // no-op
      }
    }
  }, [activeTab, searchParams, pathname]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = async () => {
      try {
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        const taskParam = urlParams.get('task');
        
        if (path === '/browse' || path === '/vibe' || path === '/') {
          if (taskParam) {
            const taskExists = allTasks.some(t => t.id === taskParam);
            if (taskExists) {
              await startTask(taskParam, false);
            } else {
              // Task doesn't exist, clear the URL
              window.history.pushState(null, '', '/browse');
              setExpandedTask(null);
              setShowCodingTerminal(false);
              setSelectedTask(null);
              setTaskId("");
              setCurrentTaskMeta(null);
              latestSuggestionsRef.current = [];
            }
          } else {
            // No task param, ensure we're in list view
            setExpandedTask(null);
            setShowCodingTerminal(false);
            setSelectedTask(null);
            setTaskId("");
            setCurrentTaskMeta(null);
            latestSuggestionsRef.current = [];
          }
        }
      } catch (e) {
        // no-op
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated - will redirect via useRouteProtection
  if (!isAuthenticated) {
    return null;
  }

  // (removed duplicate useEffects that were placed after auth guards)

  const handleTaskClick = (taskId: string) => {
    try {
      window.history.pushState(null, '', `/browse?task=${taskId}`);
    } catch (e) {
      // no-op
    }
  };

  const handleRandomTask = async () => {
    const randomIndex = Math.floor(Math.random() * allTasks.length);
    const randomTask = allTasks[randomIndex];
    await startTask(randomTask.id, true);
  };

  const handleSaveToggle = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent task click
    // Update the task's saved status
    const updatedTasks = filteredTasks.map(task => 
      task.id === taskId ? { ...task, saved: !task.saved } : task
    );
    setFilteredTasks(updatedTasks);
  };

  const handleGetStarted = (taskId: string) => {
    // Optimistically expand the task immediately
    setExpandedTask(taskId);

    // Push URL immediately for instant navigation; URL effect will start the task
    router.push(`/vibe?task=${taskId}`);
  };

  const handleGoBack = () => {
    setIsTransitioning(true);
    startTransition(() => {
      setExpandedTask(null);
      setShowCodingTerminal(false);
      setSelectedTask(null);
      setTaskId("");
      setCurrentTaskMeta(null);
      latestSuggestionsRef.current = [];
      setIsTransitioning(false);
    });
    try {
      window.history.pushState(null, '', `/browse`);
    } catch (e) {
      // no-op
    }
  };

  const handleTaskExpand = (taskId: string) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
    } else {
      setExpandedTask(taskId);
    }
  };

  // Editor mount handler
  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
  };

  // Helper function to get status icon (LeetCode style)
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <div className="relative">
            <CheckCircle className="peer h-5 w-5 text-green-500 hover:text-green-400 transition-colors cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300">
              Submitted
            </div>
          </div>
        );
      case "in-progress":
        return (
          <div className="relative">
            <div className="peer h-5 w-5 relative hover:scale-110 transition-transform cursor-help">
              <Circle className="h-5 w-5 text-white hover:text-blue-300 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-0.5 bg-white"></div>
              </div>
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300">
              In Progress
            </div>
          </div>
        );
      case "not-started":
      default:
        return (
          <div className="relative">
            <Circle className="peer h-5 w-5 text-gray-500 hover:text-gray-400 transition-colors cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300">
              Not Started
            </div>
          </div>
        );
    }
  };

  // Helper function to get save icon with tooltip (LeetCode style)
  const getSaveIcon = (saved: boolean) => {
    return (
      <div className="relative">
        {saved ? (
          <Star className="peer h-4 w-4 text-yellow-400 fill-current hover:text-yellow-300 transition-colors cursor-help" />
        ) : (
          <Star className="peer h-4 w-4 text-gray-500 hover:text-gray-400 transition-colors cursor-help" />
        )}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300">
          {saved ? "Remove from saved" : "Save task"}
        </div>
      </div>
    );
  };

  // Helper function to get difficulty color
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "text-green-400";
      case "Intermediate":
        return "text-yellow-400";
      case "Advanced":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  // Helper function to get difficulty badge colors (LeetCode style)
  const getDifficultyBadgeColors = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "text-green-400";
      case "Intermediate":
        return "text-orange-400";
      case "Advanced":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  // Helper function to get app type badge colors
  const getAppTypeBadgeColors = (appType: string) => {
    switch (appType) {
      case "Game":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "Widget":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };


  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-gray-900 text-white">
      {/* Loading overlay during transitions */}
      {isTransitioning && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-800 rounded-lg p-4 flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
            <span className="text-white">Loading...</span>
          </div>
        </div>
      )}
      
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        // theme={theme}
        // onThemeChange={setTheme}
        isAssistantVisible={showAIAssistant}
        onAssistantVisibleChange={setShowAIAssistant}
      />

      {/* View menu button removed */}

      {/* Main Content */}
      <div ref={containerRef} className={`${sidebarOpen ? 'ml-64' : 'ml-12'} flex h-screen overflow-x-hidden ${showCodingTerminal ? 'px-6' : ''}`}>
        {/* Left Side */}
        <div
          ref={leftPaneRef}
          className={`flex flex-col box-border ${showCodingTerminal ? 'pt-2 pb-6 px-6' : ''} h-full max-w-full ${showCodingTerminal && selectedTask && leftTab === 'leaderboard' ? 'flex-1 min-w-0' : ''}`}
          style={{ width: showCodingTerminal && leftTab !== 'leaderboard' ? leftColumnWidth : '100%', willChange: isResizing ? 'width' as any : undefined, order: isSwapped ? 2 as any : 0 as any }}
        >
          {/* Header, Search Bar, and Content Container - keep visible unless coding terminal is active */}
          {!showCodingTerminal && (
            <div className={`${activeTab === 'skill-check' ? 'px-20' : 'px-40'} ${activeTab === 'tasks' ? 'pt-16' : 'pt-4'} pb-6 w-full max-w-full flex flex-col h-full`}>
              {/* Greeting - Only show on tasks tab */}
              {activeTab === 'tasks' && (
                <h1 className="text-4xl font-light mb-2 text-center">
                  Hi <span className="font-medium">{user?.username}</span>,
                </h1>
              )}
              {/* Header - Only show for tasks tab */}
              {activeTab === 'tasks' && (
                <div className="text-center mb-16 w-full">
                  <h1 className="text-4xl font-light mb-2 text-center">
                    What do you want to build on {" "}
                    <span className="animated-gradient font-semibold">
                      Vibe Jam
                    </span>
                    ?
                  </h1>
                </div>
              )}

              {/* Search Bar - Only show for tasks tab */}
              {activeTab === 'tasks' && (
                <div className="flex items-center justify-between w-full mb-6">
                  {/* Left side - Search questions, Filter button, Sort button */}
                  <div className="flex items-center space-x-3">
                    {/* Search bar */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search questions"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-80 pl-10 pr-3 py-1 border-gray-600 rounded-lg bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    {/* Filter button */}
                    <button className="p-2 rounded-lg bg-gray-800 border border-gray-600 hover:bg-gray-700 transition-colors">
                      <Filter className="h-4 w-4 text-gray-400" />
                    </button>
                    
                    {/* Sort button */}
                    <button className="p-2 rounded-lg bg-gray-800 border border-gray-600 hover:bg-gray-700 transition-colors">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Right side - Number of problems and Random button */}
                  <div className="flex items-center space-x-4">
                    {/* Number of problems */}
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <div className="w-4 h-4 rounded-full border-2 border-gray-600 bg-gray-800 relative">
                          <div className="absolute inset-0 rounded-full bg-green-500" style={{clipPath: 'circle(50% at 50% 50%)'}}></div>
                        </div>
                        <span className="text-sm text-gray-400">
                          {filteredTasks.length} problems
                        </span>
                      </div>
                    </div>
                    
                    {/* Random button */}
                    <button 
                      onClick={handleRandomTask}
                      className="p-2 rounded-lg bg-gray-800 border border-gray-600 hover:bg-gray-700 transition-colors"
                    >
                      <Shuffle className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              )}

              {/* Content Area */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Leaderboard Page */}
                {activeTab === 'leaderboard' && <LeaderboardPage />}

                {/* Skill Check Page */}
                {activeTab === 'skill-check' && <SkillCheckPage skillCheckMode={skillCheckMode} />}

                {/* About Page */}
                {activeTab === 'about' && <AboutPage />}

                {/* Tasks Page */}
                {activeTab === 'tasks' && (
                  <>
                    {/* Task List */}
                    {filteredTasks.length > 0 && (
                      <div className="flex-1 overflow-visible">
                        <MinimalTaskList
                          tasks={filteredTasks}
                          onSaveToggle={handleSaveToggle}
                          onGetStarted={handleGetStarted}
                          expandedTask={expandedTask}
                          onTaskExpand={handleTaskExpand}
                          onGoBack={handleGoBack}
                          hasStartedTask={false}
                          disableHover={false}
                        />
                      </div>
                    )}

                    {/* No results or loading state */}
                    {filteredTasks.length === 0 && (
                      <div className="py-12 w-full">
                        <div className="text-center">
                          {searchQuery.trim() === "" ? (
                            <div className="flex items-center justify-center space-x-3">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                              <p className="text-gray-400 text-lg">Loading tasks...</p>
                            </div>
                          ) : (
                            <>
                              <p className="text-gray-400 text-lg">No tasks found matching your search.</p>
                              <button 
                                onClick={() => setSearchQuery("")}
                                className="mt-4 text-base font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 text-gray-400 hover:text-blue-400 after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200"
                              >
                                Clear search
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Coding Terminal Content - only shown when active */}
          {showCodingTerminal && (
            selectedTask && (
              <div className="flex-1 min-h-0 flex flex-col">
                {/* Left Tabs */}
                <div className="mt-0 px-0 py-1 bg-transparent">
                  <div className="flex items-center justify-between gap-2">
                    {/* Tabs (left-aligned, scrollable) */}
                    <div className="flex items-center space-x-6 overflow-x-auto whitespace-nowrap min-w-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                      <button 
                        className={`text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 after:content-[\"\"] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 ${leftTab === 'task' ? 'text-blue-400 after:opacity-100' : 'text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200'}`}
                        onClick={() => setLeftTab('task')}
                      >
                        Task
                        <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                          {isMac ? '⌘+[' : 'Ctrl+['}
                        </span>
                      </button>
                      {rightTab !== 'submissions' && (
                        <button 
                          className={`text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 after:content-[\"\"] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 ${leftTab === 'preview' ? 'text-blue-400 after:opacity-100' : 'text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200'}`}
                          onClick={() => setLeftTab('preview')}
                        >
                          My Preview
                          <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                            {isMac ? '⌘+]' : 'Ctrl+]'}
                          </span>
                        </button>
                      )}
                      {rightTab === 'submissions' && viewedSubmission && (
                        <button 
                          className={`text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 after:content-[\"\"] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 ${leftTab === 'project-details' ? 'text-blue-400 after:opacity-100' : 'text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200'}`}
                          onClick={() => setLeftTab('project-details')}
                        >
                          Project Details
                          <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                            {isMac ? '⌘+]' : 'Ctrl+]'}
                          </span>
                        </button>
                      )}
                      {/* <button 
                        className={`text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 after:content-[\"\"] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 ${leftTab === 'submissions' ? 'text-blue-400 after:opacity-100' : 'text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200'}`}
                        onClick={() => setLeftTab('submissions')}
                      >
                        Submissions
                      </button> */}
                      {/* <button 
                        className={`text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 after:content-[\"\"] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 ${leftTab === 'leaderboard' ? 'text-blue-400 after:opacity-100' : 'text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200'}`}
                        onClick={() => setLeftTab('leaderboard')}
                      >
                        Leaderboard
                      </button> */}
                    </div>
                    {/* Go Back / Swap Buttons (right-aligned) */}
                    <div className={`flex items-center ${isSwapped ? 'flex-row-reverse space-x-reverse' : ''} space-x-2 ml-auto`}>
                      <button
                        onClick={handleGoBack}
                        className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-700/50 hover:bg-gray-600/50 transition-colors text-gray-300 hover:text-white"
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const vw = window.innerWidth || document.documentElement.clientWidth;
                          const vh = window.innerHeight || document.documentElement.clientHeight;
                          const margin = 8;
                          let left = rect.left + rect.width / 2;
                          left = Math.min(Math.max(left, margin), vw - margin);
                          const spaceAbove = rect.top;
                          const spaceBelow = vh - rect.bottom;
                          const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                          const top = placeAbove ? rect.top : rect.bottom;
                          setTooltipText('Back to tasks');
                          setTooltipLeft(left);
                          setTooltipTop(top);
                          setTooltipPlaceAbove(placeAbove);
                          setTooltipVisible(true);
                        }}
                        onMouseLeave={() => {
                          setTooltipVisible(false);
                        }}
                        onMouseMove={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const vw = window.innerWidth || document.documentElement.clientWidth;
                          const vh = window.innerHeight || document.documentElement.clientHeight;
                          const margin = 8;
                          let left = rect.left + rect.width / 2;
                          left = Math.min(Math.max(left, margin), vw - margin);
                          const spaceAbove = rect.top;
                          const spaceBelow = vh - rect.bottom;
                          const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                          const top = placeAbove ? rect.top : rect.bottom;
                          setTooltipLeft(left);
                          setTooltipTop(top);
                          setTooltipPlaceAbove(placeAbove);
                        }}
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <button
                        onClick={() => setIsSwapped(s => !s)}
                        className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-700/50 hover:bg-gray-600/50 transition-colors text-gray-300 hover:text-white"
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const vw = window.innerWidth || document.documentElement.clientWidth;
                          const vh = window.innerHeight || document.documentElement.clientHeight;
                          const margin = 8;
                          let left = rect.left + rect.width / 2;
                          left = Math.min(Math.max(left, margin), vw - margin);
                          const spaceAbove = rect.top;
                          const spaceBelow = vh - rect.bottom;
                          const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                          const top = placeAbove ? rect.top : rect.bottom;
                          setTooltipText('Swap panes');
                          setTooltipLeft(left);
                          setTooltipTop(top);
                          setTooltipPlaceAbove(placeAbove);
                          setTooltipVisible(true);
                        }}
                        onMouseLeave={() => {
                          setTooltipVisible(false);
                        }}
                        onMouseMove={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const vw = window.innerWidth || document.documentElement.clientWidth;
                          const vh = window.innerHeight || document.documentElement.clientHeight;
                          const margin = 8;
                          let left = rect.left + rect.width / 2;
                          left = Math.min(Math.max(left, margin), vw - margin);
                          const spaceAbove = rect.top;
                          const spaceBelow = vh - rect.bottom;
                          const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                          const top = placeAbove ? rect.top : rect.bottom;
                          setTooltipLeft(left);
                          setTooltipTop(top);
                          setTooltipPlaceAbove(placeAbove);
                        }}
                      >
                        <ArrowLeftRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Left Tab Content */}
                <div className="flex-1 min-h-0">
                  {rightTab === 'submissions' && leftTab === 'project-details' && viewedSubmission && (
                    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 flex-1 overflow-hidden h-full flex flex-col">
                      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
                        <iframe
                          title="Project Details"
                          srcDoc={(() => {
                          const title = viewedSubmission.title || "Untitled Submission";
                          const description = viewedSubmission.description || "No description provided.";
                          const escapeHtml = (text: string) => {
                            const div = document.createElement('div');
                            div.textContent = text;
                            return div.innerHTML;
                          };
                          const escapedTitle = escapeHtml(title);
                          const escapedDescription = escapeHtml(description).replace(/\n/g, "<br/>");
                          return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
    body { background: #20232a; color: #d6dde6; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }
    .pd-root { max-width: 900px; margin: 0 auto; padding: 24px; }
    .field-label { color: #8ac4ff; font-weight: 600; font-size: 14px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { margin-bottom: 32px; }
    .title-value { color: #e6f6ff; font-size: 2em; font-weight: 600; line-height: 1.3; }
    .description-value { color: #d6dde6; line-height: 1.6; font-size: 15px; }
    .description-value p { margin: 12px 0; }
  </style>
  <base target="_blank" />
</head>
<body>
  <div class="pd-root">
    <div class="field-label">Title</div>
    <div class="field-value title-value">${escapedTitle}</div>
    <div class="field-label">Description</div>
    <div class="field-value description-value">${escapedDescription}</div>
  </div>
  <script>
    document.addEventListener('copy', function(e) { e.preventDefault(); return false; });
    document.addEventListener('cut', function(e) { e.preventDefault(); return false; });
    document.addEventListener('paste', function(e) { e.preventDefault(); return false; });
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {
        e.preventDefault(); return false;
      }
    });
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
  </script>
</body>
</html>`;
                        })()}
                          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                          sandbox="allow-same-origin allow-scripts"
                        />
                      </div>
                    </div>
                  )}
                  {leftTab === 'task' && (
                    <TaskInstructionNew
                      taskDescription={getTaskDescription(selectedTask)}
                      showHeader={false}
                    />
                  )}
                  {leftTab === 'preview' && (
                    <div className="h-full">
                      <PreviewTab 
                        ref={previewTabRef}
                        files={currentFiles}
                        className="h-full"
                        taskName={allTasks.find(t => t.id === selectedTask)?.name || 'preview'}
                        actualEditorRef={actualEditorRef}
                        onRefresh={handlePreviewRefresh}
                      />
                    </div>
                  )}
                  {leftTab === 'submissions' && (
                    <UserSubmissions />
                  )}
                  {leftTab === 'leaderboard' && (
                    <div className="text-center text-gray-400 bg-gray-950 p-8 rounded-lg">
                      <h3 className="text-lg font-semibold mb-2">Leaderboard</h3>
                      <p>Leaderboard functionality coming soon...</p>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Vertical Resize Handle */}
        {showCodingTerminal && selectedTask && leftTab !== 'leaderboard' && (
          <div
            onMouseDown={handleMouseDown}
            className="flex-shrink-0 cursor-col-resize group"
            style={{ width: 4, order: 1 }}
          >
            <div className={`h-full w-px bg-gray-700 group-hover:bg-gray-600 mx-auto`} />
          </div>
        )}

        {/* Right Side - Coding Editor (kept mounted; hidden on some tabs) */}
        {showCodingTerminal && selectedTask && (
          <div
            className={`bg-gray-900 h-full flex-1 min-w-0 box-border overflow-hidden px-6 pt-2 pb-6`}
            style={{ order: isSwapped ? 0 as any : 2 as any, display: leftTab === 'leaderboard' ? 'none' : undefined }}
          >
            <div className="h-full flex flex-col min-h-0">
              {/* Code Editor Card */}
              <div className="bg-transparent w-full min-w-0 flex-1 flex flex-col min-h-0">
                {/* Top bar (mirrors left tabs style) */}
                <div className="mt-0 px-0 py-1 bg-transparent">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-6 overflow-x-auto whitespace-nowrap min-w-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                      <button
                        type="button"
                        className={`text-sm font-medium transition-all duration-200 relative bg-transparent hover:bg-transparent focus:bg-transparent active:bg-transparent border-none outline-none py-2 after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px hover:-translate-y-0.5 ${
                          rightTab === 'code'
                            ? 'text-blue-400 after:bg-blue-400 after:opacity-100 cursor-default'
                            : 'text-gray-400 hover:text-blue-400 after:bg-blue-400 after:opacity-0 hover:after:opacity-100'
                        } inline-flex`}
                        style={{ position: 'relative', display: 'inline-flex' }}
                        onClick={() => {
                          setRightTab('code');
                          setTooltipVisible(false);
                          // If on project-details, switch to task tab
                          if (leftTab === 'project-details') {
                            setLeftTab('task');
                          }
                        }}
                      >
                        Code
                        <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                          {isMac ? '⌘+(' : 'Ctrl+('}
                        </span>
                      </button>
                      <div
                        style={{ position: 'relative' }}
                        onWheel={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {isViewSubmissionsUnlocked ? (
                          <button
                            type="button"
                            className={`text-sm font-medium transition-all duration-200 relative bg-transparent hover:bg-transparent focus:bg-transparent active:bg-transparent border-none outline-none py-2 after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px hover:-translate-y-0.5 ${
                              rightTab === 'submissions'
                                ? 'text-blue-400 after:bg-blue-400 after:opacity-100'
                                : 'text-gray-400 hover:text-blue-400 after:bg-blue-400 after:opacity-0 hover:after:opacity-100'
                            } inline-flex items-center gap-1`}
                            style={{ position: 'relative', display: 'inline-flex' }}
                            onClick={() => {
                              setRightTab('submissions');
                              setTooltipVisible(false);
                            }}
                            onWheel={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            View Submissions
                            <span className="ml-1 text-[10px] opacity-70 inline-flex items-center align-middle leading-none">
                              {isMac ? '⌘+)' : 'Ctrl+)'}
                            </span>
                          </button>
                        ) : (
                          <span
                            className="text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 text-gray-400 opacity-60 cursor-not-allowed flex items-center gap-1 hover:tooltip-parent"
                            style={{ position: 'relative', display: 'inline-flex' }}
                            onMouseEnter={e => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const vw = window.innerWidth || document.documentElement.clientWidth;
                              const vh = window.innerHeight || document.documentElement.clientHeight;
                              const margin = 8;
                              let left = rect.left + rect.width / 2;
                              left = Math.min(Math.max(left, margin), vw - margin);
                              const spaceAbove = rect.top;
                              const spaceBelow = vh - rect.bottom;
                              const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                              const top = placeAbove ? rect.top : rect.bottom;
                              setTooltipText(viewSubmissionsTooltip);
                              setTooltipLeft(left);
                              setTooltipTop(top);
                              setTooltipPlaceAbove(placeAbove);
                              setTooltipVisible(true);
                            }}
                            onMouseLeave={() => {
                              setTooltipVisible(false);
                            }}
                            onMouseMove={e => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const vw = window.innerWidth || document.documentElement.clientWidth;
                              const vh = window.innerHeight || document.documentElement.clientHeight;
                              const margin = 8;
                              let left = rect.left + rect.width / 2;
                              left = Math.min(Math.max(left, margin), vw - margin);
                              const spaceAbove = rect.top;
                              const spaceBelow = vh - rect.bottom;
                              const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
                              const top = placeAbove ? rect.top : rect.bottom;
                              setTooltipLeft(left);
                              setTooltipTop(top);
                              setTooltipPlaceAbove(placeAbove);
                            }}
                            onWheel={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <span className="flex items-center gap-1">
                              🔒 View Submissions
                              <span className="ml-1 text-[10px] opacity-60 inline-flex items-center align-middle leading-none">
                                {isMac ? '⌘+)' : 'Ctrl+)'}
                              </span>
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    {rightTab === 'code' && (
                    <div className="flex items-center space-x-2 ml-auto">
                      <button
                          className="px-2.5 py-1.5 rounded-md transition-colors text-xs bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                        onClick={() => {
                          try {
                            window.dispatchEvent(new Event('open-submit-modal'));
                          } catch {}
                        }}
                      >
                        Submit Project
                      </button>
                    </div>
                    )}
                  </div>
                </div>
                {/* Editor */}
                <div className="flex-1 min-w-0 min-h-0">
                  <div className="h-full min-w-0 flex flex-col min-h-0">
                    <div className="flex-1 min-h-0">
                      <div style={{ display: rightTab === 'code' ? 'flex' : 'none', flexDirection: 'column', height: '100%', width: '100%' }}>
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
                      setTaskDescriptions={setTaskDescriptions}
                      setFunctionSignatures={setFunctionSignatures}
                      setUnitTests={setUnitTests}
                      setExpCondition={setExpCondition}
                      setModel={setModel}
                      setMaxTokensTask={setMaxTokensTask}
                      editor={editorRef.current}
                      unit_tests={unitTests}
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
                      onEditorMouseDown={handleEditorMouseDown}
                      code={code}
                      setCode={setCode}
                      // Enable multi-file UI with dummy files in read-only navigation mode
                      enableMultiFile={true}
                      initialFiles={initialFiles}
                      readOnlyFiles={false}
                      testCases={testCases}
                      projectId={currentTaskMeta?.projectId ?? null}
                      userId={numericUserId}
                      taskName={currentTaskMeta?.name ?? null}
                      // Pane visibility
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
                        onClearMessages={async () => {
                          try {
                            await fetch(`${ENV.BACKEND_URL}/api/agent-history/clear`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                            });
                          } catch (e) {
                            // no-op: clearing history is best-effort
                          }
                          setAssistantMessages((prev: any[]) =>
                            prev.filter((msg: any) => msg.type === 'suggestions')
                          );
                        }}
                          inputValue={assistantInputValue}
                          onInputChange={setAssistantInputValue}
                          onSubmit={handleAssistantSubmit}
                          onSuggestionClick={handleSuggestionSelection}
                          awaitingResponse={awaitingResponse}
                          summaryGenerated={summaryGenerated}
                          isEditorLoading={isSpinning}
                        onHalt={() => {
                          try { assistantAbortControllerRef.current?.abort(); } catch {}
                        }}
                        assistantPlacement={assistantPlacement}
                        onAssistantPlacementChange={setAssistantPlacement}
                        />
                      )}
                      // Save shortcut callback for preview updates
                      onSaveShortcut={handleSaveShortcut}
                      // File content change callback for real-time preview updates
                      onFileContentChange={handleFileContentChange}
                      // Agent changes for diff view
                      pendingAgentChanges={pendingAgentChanges}
                      onAcceptAgentChanges={(fileId?: string, content?: string) => {
                        // Changes are already applied in real-time, just clear pending state
                        const prevPending = pendingAgentChanges;
                        const isKeepAction = fileId && content && prevPending?.modified?.[fileId] && 
                                           String(content).trim() === String(prevPending.modified[fileId]).trim();
                        const isRejectAction = fileId && content && prevPending?.original?.[fileId] && 
                                             String(content).trim() === String(prevPending.original[fileId]).trim();
                        
                        if (fileId && content) {
                          // Remove this file type from pending changes
                          setPendingAgentChanges((prev: any) => {
                            if (!prev) return null;
                            const newModified = { ...(prev.modified || {}) };
                            const newOriginal = { ...(prev.original || {}) };
                            delete newModified[fileId];
                            delete newOriginal[fileId];
                            // If no more files, clear everything
                            if (Object.keys(newModified).length === 0) {
                              return null;
                            }
                            return { ...prev, modified: newModified, original: newOriginal };
                          });
                          
                          // Log code with appropriate mode and refresh preview
                          // refreshPreview calls onRefresh with 'external', which handlePreviewRefresh skips logging for
                          if (isKeepAction) {
                            setTimeout(() => {
                              void sendCodeLog('keep', { fileId });
                              try {
                                previewTabRef.current?.refreshPreview();
                              } catch (error) {
                                console.warn('Failed to refresh preview on keep:', error);
                              }
                            }, 100);
                          } else if (isRejectAction) {
                            setTimeout(() => {
                              void sendCodeLog('reject', { fileId });
                              try {
                                previewTabRef.current?.refreshPreview();
                              } catch (error) {
                                console.warn('Failed to refresh preview on reject:', error);
                              }
                            }, 100);
                          }
                        } else {
                          // Accept all remaining changes (fallback - shouldn't be used in new workflow)
                          setPendingAgentChanges(null);
                        }

                        // No explicit preview refresh; preview will reflect latest editor state
                      }}
                      onRejectAgentChanges={(actionType?: 'keep_all' | 'reject_all') => {
                        // Determine action type from parameter or fallback to checking pendingAgentChanges
                        const hasModifiedFiles = pendingAgentChanges?.modified && 
                                                Object.keys(pendingAgentChanges.modified).length > 0;
                        const action: 'keep_all' | 'reject_all' = actionType || 
                                                                 (hasModifiedFiles ? 'keep_all' : 'reject_all');
                        
                        setPendingAgentChanges(null);
                        
                        // Log code with appropriate mode and refresh preview (after state is cleared so we capture final code state)
                        // refreshPreview calls onRefresh with 'external', which handlePreviewRefresh skips logging for
                        setTimeout(() => {
                          void sendCodeLog(action, {});
                          try {
                            previewTabRef.current?.refreshPreview();
                          } catch (error) {
                            console.warn(`Failed to refresh preview on ${action}:`, error);
                          }
                        }, 100);
                      }}
                    />
                      </div>
                      <div style={{ display: rightTab === 'submissions' ? 'flex' : 'none', flexDirection: 'column', height: '100%', width: '100%' }}>
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
          </div>
        )}
      </div>

      {/* Transparent overlay for mouse tracking during drag */}
      {(isResizing || isVerticalResizing || isEditorResizing) && (
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
      {tooltipVisible && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: tooltipLeft,
            top: tooltipTop,
            transform: tooltipPlaceAbove ? 'translate(-50%, -100%) translateY(-8px)' : 'translate(-50%, 8px)',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
            zIndex: 100000,
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {tooltipText}
        </div>,
        document.body
      )}
      
    </div>
  );
}