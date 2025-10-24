"use client";
import { useState, useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
  Clock,
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
import PreviewTab from "./components/PreviewTab";
import { MessageData } from "./components/Message";
import ChatbotPane from "./components/ChatbotPane";
import AssistantTerminalPane from "./components/AssistantTerminalPane";
import { load_next_task } from "./functions/task_logic";
import { ENV } from "./config/env";

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTasks, setFilteredTasks] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");
  const [theme, setTheme] = useState<'native' | 'light' | 'dark'>('dark');
  const [assistantPlacement, setAssistantPlacement] = useState<'bottom' | 'side'>('bottom');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showCodingTerminal, setShowCodingTerminal] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  // Left pane tabs when in a task
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipText, setTooltipText] = useState("");
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const [tooltipTop, setTooltipTop] = useState(0);
  const [tooltipPlaceAbove, setTooltipPlaceAbove] = useState(true);
  const [leftTab, setLeftTab] = useState<'task' | 'preview' | 'leaderboard' | 'submissions'>('task');
  
  // Vibe page layout state
  const [code, setCode] = useState("");
  const [editorHeight, setEditorHeight] = useState(0);
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [logProbs, setLogProbs] = useState<any>(null);
  const [messageAIIndex, setMessageAIIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const editorRef = useRef<any>(null);
  const actualEditorRef = useRef<any>(null);
  const chatRef = useRef<any>(null);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const pendingLeftWidthRef = useRef<number>(0);
  const rafScheduledRef = useRef<boolean>(false);
  const lastConstrainedWidthRef = useRef<number>(0);
  const [isSwapped, setIsSwapped] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const taskAbortControllerRef = useRef<AbortController | null>(null);
  
  // Resize state
  const [leftColumnWidth, setLeftColumnWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [taskInstructionHeight, setTaskInstructionHeight] = useState(0);
  const [isVerticalResizing, setIsVerticalResizing] = useState(false);
  const [isEditorResizing, setIsEditorResizing] = useState(false);
  
  // Pane visibility
  const [showTaskInstructions, setShowTaskInstructions] = useState(true);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  
  // Task data
  const [taskDescriptions, setTaskDescriptions] = useState<string[]>([]);
  const [initialFiles, setInitialFiles] = useState<any[]>([]);
  const [currentFiles, setCurrentFiles] = useState<any[]>([]);
  const [testCases, setTestCases] = useState<any[]>([]);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
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
  const [assistantMessages, setAssistantMessages] = useState<any[]>([
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
    { type: 'assistant', message: 'Analyzing your latest edits…' },
    { type: 'user', message: 'Please run all tests.' },
    { type: 'tool', message: 'tools/run-tests {"all": true}' },
    { type: 'assistant', message: 'All tests passed! 🎉' },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [assistantInputValue, setAssistantInputValue] = useState("");
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [awaitingManualSuggestions, setAwaitingManualSuggestions] = useState(false);
  
  // Task state
  const [responseId, setResponseId] = useState("");
  const [taskId, setTaskId] = useState("");
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

  // Update currentFiles when initialFiles change
  useEffect(() => {
    setCurrentFiles(initialFiles);
  }, [initialFiles]);

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

  // Function to handle file save and update current files
  const handleFileSave = (fileId: string) => {
    // Get current file contents from the editor
    if (actualEditorRef?.current?.getAllFileContents) {
      const allContents = actualEditorRef.current.getAllFileContents();
      
      // Update currentFiles with the latest contents
      setCurrentFiles(prevFiles => {
        const updateFileContent = (files: any[]): any[] => {
          return files.map(file => {
            if (file.id === fileId && allContents[fileId] !== undefined) {
              return { ...file, content: allContents[fileId] };
            }
            if (file.children && Array.isArray(file.children)) {
              return { ...file, children: updateFileContent(file.children) };
            }
            return file;
          });
        };
        
        return updateFileContent(prevFiles);
      });
      
      // Trigger preview refresh if the saved file is a web file
      // Find the file by ID to get its name
      const findFileById = (files: any[], id: string): any => {
        for (const file of files) {
          if (file.id === id) return file;
          if (file.children) {
            const found = findFileById(file.children, id);
            if (found) return found;
          }
        }
        return null;
      };
      
      const savedFile = findFileById(currentFiles, fileId);
      if (savedFile && (
        savedFile.name.toLowerCase().endsWith('.html') || 
        savedFile.name.toLowerCase().endsWith('.htm') || 
        savedFile.name.toLowerCase().endsWith('.css') || 
        savedFile.name.toLowerCase().endsWith('.js')
      )) {
        // Force a re-render of the preview by updating a refresh key
        setPreviewRefreshKey(prev => prev + 1);
      }
    }
  };

  // Ignore live content changes for preview; only refresh on save
  const handleFileContentChange = () => {};

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

  // Generate initial files for each task type
  const getInitialFilesForTask = async (taskId: string, abortSignal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/task-files?taskId=${taskId}`, { signal: abortSignal });
      if (response.ok) {
        const data = await response.json();
        return data.files || [];
      } else {
        console.error('Failed to load task files:', response.statusText);
        return [];
      }
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError') {
        return [];
      }
      console.error('Error loading task files:', error);
      return [];
    }
  };

  // Helper functions to get task data
  const getTaskRequirements = (taskId: string): string[] => {
    const task = allTasks.find(t => t.id === taskId);
    return task?.requirements || [];
  };

  const getTaskVideoDemo = (taskId: string): string | undefined => {
    const task = allTasks.find(t => t.id === taskId);
    return task?.videoDemo;
  };

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

  // Initialize filtered tasks
  useEffect(() => {
    setFilteredTasks(allTasks);
  }, [allTasks]);

  // Keyboard shortcuts for sidebar toggle and AI assistant toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable;
      if (isTyping) return;

      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      const key = (event.key || '').toLowerCase();

      // Tab: Toggle sidebar whenever user isn't typing (prevents focus navigation)
      if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'Tab') {
        event.preventDefault();
        setSidebarOpen(prev => !prev);
        return;
      }

      // Cmd/Ctrl + I: Toggle AI assistant visibility
      if (isCmdOrCtrl && key === 'i') {
        event.preventDefault();
        setShowAIAssistant(prev => !prev);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle URL query parameters to auto-select tasks (only when URL actually changes)
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
        // Reset when navigating back to browse without a task
        setExpandedTask(null);
        setShowCodingTerminal(false);
        setSelectedTask(null);
      }
    };
    
    handleTaskParam();
  }, [searchParams.get('task'), allTasks.length, pathname, showCodingTerminal, selectedTask]);

  // Hide all tooltips when arriving at any page
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
    
    return () => clearTimeout(timer);
  }, [pathname]);

  // Also hide tooltips when activeTab changes (additional navigation trigger)
  useEffect(() => {
    setTooltipVisible(false);
    setTooltipText("");
  }, [activeTab]);

  // Force hide tooltips when showCodingTerminal changes (when entering/exiting task mode)
  useEffect(() => {
    setTooltipVisible(false);
    setTooltipText("");
  }, [showCodingTerminal]);

  // When switching to Tasks tab, ensure URL and state reflect the list view
  // But only if there's no task parameter in the URL
  useEffect(() => {
    const taskParam = searchParams.get('task');
    if (activeTab === 'tasks' && !taskParam) {
      setExpandedTask(null);
      setShowCodingTerminal(false);
      setSelectedTask(null);
      try {
        if (window.location.pathname !== '/browse') {
          window.history.pushState(null, '', '/browse');
        }
      } catch (e) {
        // no-op
      }
    }
  }, [activeTab, searchParams]);

  // Keep UI in sync with browser back/forward
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
              return;
            }
          }
          setExpandedTask(null);
          setShowCodingTerminal(false);
          setSelectedTask(null);
        }
      } catch (e) {
        // no-op
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
      setShowCodingTerminal(true);
      // Keep AI assistant hidden for now
      setShowAIAssistant(false);
      // Default left pane to Task tab
      setLeftTab('task');
      setIsTransitioning(false);
    });

    const description = getTaskDescription(taskId);
    setTaskDescriptions([description]);

    const files = await getInitialFilesForTask(taskId, abortController.signal);
    setInitialFiles(files);

    const task = allTasks.find(t => t.id === taskId);
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
    actualEditorRef.current = editor;
  };

  // Helper function to get status icon (LeetCode style)
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <div className="relative">
            <CheckCircle className="peer h-5 w-5 text-green-500 hover:text-green-400 transition-colors cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
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
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
              In Progress
            </div>
          </div>
        );
      case "not-started":
      default:
        return (
          <div className="relative">
            <Circle className="peer h-5 w-5 text-gray-500 hover:text-gray-400 transition-colors cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
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
        theme={theme}
        onThemeChange={setTheme}
        assistantPlacement={assistantPlacement}
        onAssistantPlacementChange={setAssistantPlacement}
        isAssistantVisible={showAIAssistant}
        onAssistantVisibleChange={setShowAIAssistant}
      />

      {/* View menu button removed */}

      {/* Main Content */}
      <div ref={containerRef} className={`${isResizing ? '' : 'transition-all duration-500 ease-in-out'} ${sidebarOpen ? 'ml-64' : 'ml-12'} flex h-screen overflow-x-hidden ${showCodingTerminal ? 'px-6' : ''}`}>
        {/* Left Side */}
        <div
          ref={leftPaneRef}
          className={`flex flex-col box-border ${showCodingTerminal ? 'pt-2 pb-6 px-6' : ''} h-full max-w-full ${isResizing ? '' : 'transition-[width] duration-500'} ${showCodingTerminal && selectedTask && (leftTab === 'submissions' || leftTab === 'leaderboard') ? 'flex-1 min-w-0' : ''}`}
          style={{ width: showCodingTerminal && !(leftTab === 'submissions' || leftTab === 'leaderboard') ? leftColumnWidth : '100%', willChange: isResizing ? 'width' as any : undefined, order: isSwapped ? 2 as any : 0 as any }}
        >
          {/* Header, Search Bar, and Content Container - keep visible unless coding terminal is active */}
          {!showCodingTerminal && (
            <div className="px-40 pt-16 pb-6 w-full max-w-full flex flex-col h-full">
              {/* Header */}
              <div className="text-center mb-6 w-full">
                <h1 className="text-4xl font-light mb-2 text-center">
                  What do you want to build on {" "}
                  <span className="animated-gradient font-semibold">
                    Vibe Code Arena
                  </span>
                  ?
                </h1>
              </div>

              {/* Search Bar */}
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

              {/* Content Area */}
              <div className="flex-1 flex flex-col min-h-0">
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
                      </button>
                      <button 
                        className={`text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 after:content-[\"\"] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 ${leftTab === 'preview' ? 'text-blue-400 after:opacity-100' : 'text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200'}`}
                        onClick={() => setLeftTab('preview')}
                      >
                        Preview
                      </button>
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
                          setTooltipText('Go back to browse tasks');
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
                          setTooltipText('Swap pane order');
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
                  {leftTab === 'task' && (
                    <TaskInstructionNew
                      taskDescription={getTaskDescription(selectedTask)}
                      requirements={getTaskRequirements(selectedTask)}
                      videoDemo={getTaskVideoDemo(selectedTask)}
                      showHeader={false}
                    />
                  )}
                  {leftTab === 'preview' && (
                    <div className="h-full">
                      <PreviewTab 
                        files={currentFiles}
                        className="h-full"
                        taskName={allTasks.find(t => t.id === selectedTask)?.name || 'preview'}
                        refreshKey={previewRefreshKey}
                        actualEditorRef={actualEditorRef}
                      />
                    </div>
                  )}
                  {leftTab === 'submissions' && (
                    <div className="text-center text-gray-400">
                      <h3 className="text-lg font-semibold mb-2">Submissions</h3>
                      <p>Submissions functionality coming soon...</p>
                    </div>
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
        {showCodingTerminal && selectedTask && leftTab !== 'submissions' && leftTab !== 'leaderboard' && (
          <div
            onMouseDown={handleMouseDown}
            className="flex-shrink-0 cursor-col-resize group"
            style={{ width: 4, order: 1 }}
            title="Drag to resize"
          >
            <div className={`h-full w-px bg-gray-700 group-hover:bg-gray-600 mx-auto`} />
          </div>
        )}

        {/* Right Side - Coding Editor (kept mounted; hidden on some tabs) */}
        {showCodingTerminal && selectedTask && (
          <div
            className={`bg-gray-900 h-full flex-1 min-w-0 box-border overflow-hidden px-6 pt-2 pb-6`}
            style={{ order: isSwapped ? 0 as any : 2 as any, display: (leftTab === 'submissions' || leftTab === 'leaderboard') ? 'none' : undefined }}
          >
            <div className="h-full flex flex-col min-h-0">
              {/* Code Editor Card */}
              <div className="bg-transparent w-full min-w-0 flex-1 flex flex-col min-h-0">
                {/* Top bar (mirrors left tabs style) */}
                <div className="mt-0 px-0 py-1 bg-transparent">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-6 overflow-x-auto whitespace-nowrap min-w-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                      <span className="text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 text-blue-400 after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400">
                        Code
                      </span>
                      <div
                        style={{ position: 'relative' }}
                        onWheel={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
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
                            setTooltipText('You need to submit a solution before viewing submissions.');
                            setTooltipLeft(left);
                            setTooltipTop(top);
                            setTooltipPlaceAbove(placeAbove);
                            setTooltipVisible(true);
                          }}
                          onMouseLeave={e => {
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
                          🔒 View Submissions
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-auto">
                      <button
                        className="px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 transition-colors text-white text-xs"
                        onClick={() => {
                          try {
                            window.dispatchEvent(new Event('open-submit-modal'));
                          } catch {}
                        }}
                      >
                        Submit Project
                      </button>
                    </div>
                  </div>
                </div>
                {/* Editor */}
                <div className="flex-1 min-w-0 min-h-0">
                  <div className="h-full min-w-0 flex flex-col min-h-0">
                    <div className="flex-1 min-h-0">
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
                      readOnlyFiles={true}
                      testCases={testCases}
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
                          title="AI Assistant"
                          items={assistantMessages}
                          onClearMessages={() => setAssistantMessages([])}
                          inputValue={assistantInputValue}
                          onInputChange={setAssistantInputValue}
                        />
                      )}
                      // File save callback for preview updates
                      onFileSave={handleFileSave}
                      // File content change callback for real-time preview updates
                      onFileContentChange={handleFileContentChange}
                    />
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
            backgroundColor: '#111827',
            color: '#ffffff',
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid #374151',
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