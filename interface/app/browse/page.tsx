"use client";

// Disable static prerender to avoid CSR bailout issues
export const dynamic = 'force-dynamic';
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useRouteProtection, useAuth } from "../context/auth";
import { isTutorialCompletedFromSettings } from "../utils/userSettings";
import { isTutorialTask } from "../utils/tutorial";
import { isFunctionTaskLabel, isWebsiteTaskLabel } from "../utils/taskLabels";
import { Shuffle, Search } from "lucide-react";
import { useSidebar } from "../components/layout/AppLayout";
import TaskCardGrid from "../components/tasks/TaskCardGrid";
import FunctionTaskList from "../components/tasks/FunctionTaskList";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { useSnackbar } from "../components/ui/SnackbarProvider";
import SpaceThemeBackground from "../components/ui/SpaceThemeBackground";

/** Task type filter: website (replication, open-ended) vs function (write_function, debug_function). */
export type BrowseTaskType = "website" | "function";

const tabButtonClass =
  "text-sm font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 shadow-none hover:shadow-none hover:bg-transparent hover:-translate-y-0.5 after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 after:shadow-none hover:after:shadow-none";
const tabActiveClass = "text-blue-400 after:opacity-100";
const tabInactiveClass =
  "text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200";

const BROWSE_TAB_STORAGE_KEY = "browse-tab";

function getInitialBrowseTab(): BrowseTaskType {
  if (typeof window === "undefined") return "website";
  const saved = localStorage.getItem(BROWSE_TAB_STORAGE_KEY);
  return saved === "function" || saved === "website" ? saved : "website";
}

function BrowseInner() {
  const router = useRouter();
  // Use route protection hook
  const { isAuthenticated, isLoading } = useRouteProtection();
  const { user } = useAuth();
  const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  
  // All hooks must be called before any conditional returns
  const [searchQuery, setSearchQuery] = useState("");
  const [taskType, setTaskTypeState] = useState<BrowseTaskType>(getInitialBrowseTab);
  const setTaskType = useCallback((value: BrowseTaskType) => {
    setTaskTypeState(value);
    try {
      localStorage.setItem(BROWSE_TAB_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }, []);
  const [filteredTasks, setFilteredTasks] = useState<any[]>([]);
  const { isSidebarOpen: sidebarOpen } = useSidebar();
  
  // Clear snackbars when leaving the Browse page
  const { clearAllSnackbars } = useSnackbar();
  useEffect(() => {
    return () => {
      clearAllSnackbars();
    };
  }, [clearAllSnackbars]);

  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const lockedTaskIds = useMemo(() => new Set<string>(), []);
  const activeTaskId: string | null = null;
  const isTutorialNotCompleted = false;
  
  // Load tasks
  const loadTasks = useCallback(async (signal?: AbortSignal, forceRefresh: boolean = false) => {
    const cacheKey = numericUserId ? `cached_tasks_${numericUserId}` : 'cached_tasks_anonymous';
    
    // Try to load from cache first (unless forcing refresh)
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
          setAllTasks(tasks);
          setIsLoadingTasks(false);
          return;
        }
      } catch (error) {
      }
    }
    
    // Fetch from API
    try {
      const queryParams = numericUserId ? `?userId=${numericUserId}` : '';
      const fetchOptions: RequestInit = { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      };
      if (signal) {
        fetchOptions.signal = signal;
      }
      const res = await fetch(`/api/tasks${queryParams}`, fetchOptions);
      if (res.ok) {
        const data = await res.json();
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        // Save to cache
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ tasks }));
          } catch (error) {
          }
        }
        setAllTasks(tasks);
      } else {
        console.error('Failed to load tasks:', res.status, res.statusText);
        setAllTasks([]);
        setFilteredTasks([]);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error loading tasks:', error);
      setAllTasks([]);
      setFilteredTasks([]);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [numericUserId]);

  // Initial load of tasks
  useEffect(() => {
    const abortController = new AbortController();
    loadTasks(abortController.signal);
    
    return () => {
      abortController.abort();
    };
  }, [loadTasks]);

  // Helper: put all tutorial tasks first (web_tutorial + function_tutorial), then the rest
  const prioritizeTutorial = useCallback((tasks: any[]): any[] => {
    const tutorialTasks = tasks.filter((task: any) => isTutorialTask(task));
    const otherTasks = tasks.filter((task: any) => !isTutorialTask(task));
    return [...tutorialTasks, ...otherTasks];
  }, []);

  // Filter tasks: prioritize tutorial, then filter by search query only
  useEffect(() => {
    const tutorialCompleted = isTutorialCompletedFromSettings(user?.settings);
    const tasksWithUpdatedTutorial = allTasks.map((task: any) => {
      if (isTutorialTask(task)) {
        return { ...task, status: tutorialCompleted ? 'completed' : 'not-started' };
      }
      return task;
    });
    
    let tasksToShow = prioritizeTutorial(tasksWithUpdatedTutorial);

    const byType =
      taskType === "website"
        ? tasksToShow.filter((t: any) => isWebsiteTaskLabel(t?.label))
        : tasksToShow.filter((t: any) => isFunctionTaskLabel(t?.label));

    if (searchQuery.trim() !== "") {
      tasksToShow = byType.filter((task: any) =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.tags && task.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase())))
      );
    } else {
      tasksToShow = byType;
    }

    setFilteredTasks(tasksToShow);
  }, [searchQuery, taskType, allTasks, prioritizeTutorial, user?.settings]);

  const handleRandomTask = async () => {
    const tasksWithoutTutorial = filteredTasks.filter((task) => !isTutorialTask(task));
    if (tasksWithoutTutorial.length === 0) return;
    const randomIndex = Math.floor(Math.random() * tasksWithoutTutorial.length);
    const randomTask = tasksWithoutTutorial[randomIndex];
    router.push(`/vibe?task=${randomTask.id}`);
  };

  const handleGetStarted = (taskId: string) => {
    router.push(`/vibe?task=${taskId}`);
  };

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

  // Don't render anything if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-gray-900 text-white relative">
      <SpaceThemeBackground />

      {/* Main Content */}
      <div className={`${sidebarOpen ? 'ml-60' : 'ml-12'} flex h-screen overflow-x-hidden relative z-10`}>
        {/* Left Side */}
        <div className="flex flex-col box-border h-full max-w-full w-full">
          {/* Header, Search Bar, and Content Container */}
          <div className="px-40 pt-16 pb-6 w-full max-w-full flex flex-col h-full">
            {/* Greeting */}
            <h1 className="text-4xl font-light mb-2 text-center">
              Hi <span className="font-medium">{user?.username}</span>,
            </h1>
            
            {/* Header */}
            <div className="text-center mb-16 w-full">
              <h1 className="text-4xl font-light mb-2 text-center">
                What do you want to build on {" "}
                <span className="animated-gradient font-semibold">
                  Vibe Jam
                </span>
                ?
              </h1>
            </div>

            {/* Search Bar */}
            <div className="flex items-center justify-between w-full mb-6">
                {/* Left side - Search - 50% width */}
                <div className="flex items-center w-1/2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search problems"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border-gray-600 rounded-lg bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                
                {/* Right side - Number of problems and Random button */}
                <div className="flex items-center space-x-4">
                  {/* Number of problems */}
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <div className="w-4 h-4 rounded-full border-2 border-gray-600 bg-gray-800 relative">
                        <div className="absolute inset-0 rounded-full bg-blue-500" style={{clipPath: 'circle(50% at 50% 50%)'}}></div>
                      </div>
                      <span className="text-sm text-gray-400">
                        {filteredTasks.length} problems
                      </span>
                    </div>
                  </div>
                  
                  {/* Random button with tooltip */}
                  <div className="relative group">
                    <button 
                      onClick={handleRandomTask}
                      className="px-3 h-[38px] rounded-lg bg-gray-800 border border-gray-600 hover:bg-gray-700 transition-colors flex items-center justify-center"
                    >
                      <Shuffle className="h-4 w-4 text-gray-400 group-hover:text-white transition-colors" />
                    </button>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300">
                      Surprise Me!
                    </div>
                  </div>
                </div>
            </div>

            {/* Task type tabs (same style as /vibe Task / My Preview) */}
            <div className="flex items-center space-x-6 mb-1 shadow-none">
              <button
                type="button"
                className={`${tabButtonClass} ${taskType === "website" ? tabActiveClass : tabInactiveClass}`}
                onClick={() => setTaskType("website")}
              >
                Website Tasks
              </button>
              <button
                type="button"
                className={`${tabButtonClass} ${taskType === "function" ? tabActiveClass : tabInactiveClass}`}
                onClick={() => setTaskType("function")}
              >
                Function Tasks
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Task List */}
              {filteredTasks.length > 0 && (
                <div className="flex-1 overflow-visible">
                  {taskType === "website" ? (
                    <TaskCardGrid
                      tasks={filteredTasks}
                      onGetStarted={handleGetStarted}
                      lockedTaskIds={lockedTaskIds}
                      activeTaskId={activeTaskId}
                      isLockingEnabled={false}
                      isTutorialNotCompleted={isTutorialNotCompleted}
                    />
                  ) : (
                    <FunctionTaskList
                      tasks={filteredTasks}
                      onGetStarted={handleGetStarted}
                      lockedTaskIds={lockedTaskIds}
                      activeTaskId={activeTaskId}
                      isLockingEnabled={false}
                      isTutorialNotCompleted={isTutorialNotCompleted}
                    />
                  )}
                </div>
              )}

              {/* No results or loading state */}
              {filteredTasks.length === 0 && (
                <div className="py-12 w-full">
                  <div className="text-center">
                    {isLoadingTasks ? (
                      <div className="flex items-center justify-center space-x-3">
                        <LoadingSpinner size="lg" color="blue" />
                        <p className="text-gray-400 text-lg">Loading tasks...</p>
                      </div>
                    ) : searchQuery.trim() !== "" ? (
                      <>
                        <p className="text-gray-400 text-lg">No tasks found matching your search.</p>
                        <button
                          onClick={() => setSearchQuery("")}
                          className="mt-4 text-base font-medium transition-all duration-200 relative bg-transparent border-none outline-none py-2 hover:bg-transparent hover:-translate-y-0.5 text-gray-400 hover:text-blue-400 after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200"
                        >
                          Clear search
                        </button>
                      </>
                    ) : (
                      <p className="text-gray-400 text-lg">
                        No {taskType === "website" ? "website" : "function"} tasks available.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <LoadingSpinner size="xl" color="white" />
      </div>
    }>
      <BrowseInner />
    </Suspense>
  );
}