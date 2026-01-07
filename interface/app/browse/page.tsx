"use client";

// Disable static prerender to avoid CSR bailout issues
export const dynamic = 'force-dynamic';
import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRouteProtection, useAuth } from "../utils/auth";
import { isPlaygroundCompletedFromSettings } from "../utils/userSettings";
import {
  Shuffle,
  Search,
  Filter,
} from "lucide-react";
import { useSidebar } from "../components/AppLayout";
import TaskCardGrid from "../components/TaskCardGrid";
import LoadingSpinner from "../components/LoadingSpinner";
import { POST_TEST_REQUIRED_TASKS } from "../config/tasks";
import { useSnackbar } from "../components/SnackbarProvider";
import { PASSWORD_HASH, hashString } from "../utils/password";

function BrowseInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Use route protection hook
  const { isAuthenticated, isLoading } = useRouteProtection();
  const { user } = useAuth();
  const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  
  // All hooks must be called before any conditional returns
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTasks, setFilteredTasks] = useState<any[]>([]);
  const { isSidebarOpen: sidebarOpen } = useSidebar();
  // Filter state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [statusFilters, setStatusFilters] = useState({
    'completed': true,
    'in-progress': true,
    'not-started': true
  });
  const [categoryFilters, setCategoryFilters] = useState({
    'open-ended': true,
    'replication': true
  });
  
  // Check for secret password bypass using hash comparison
  const [hasSecretPassword, setHasSecretPassword] = useState(false);
  
  useEffect(() => {
    const checkPassword = async () => {
      const password = searchParams?.get('password');
      if (password) {
        const passwordHash = await hashString(password);
        setHasSecretPassword(passwordHash === PASSWORD_HASH);
      } else {
        setHasSecretPassword(false);
      }
    };
    checkPassword();
  }, [searchParams]);
  
  // Generate background circle data once on mount
  const backgroundStars = useMemo(() => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899'];
    const animatedColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
    
    // Large stars (20)
    const largeStars = Array.from({ length: 20 }, () => ({
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 4 + 2,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.6 + 0.4,
    }));
    
    // Medium stars (40)
    const mediumStars = Array.from({ length: 40 }, () => ({
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 2 + 1,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.5 + 0.3,
    }));
    
    // Small dots (100)
    const smallDots = Array.from({ length: 100 }, () => ({
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 1.5 + 0.5,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.4 + 0.2,
    }));
    
    // Animated dots moving across screen
    const animatedDots = Array.from({ length: 12 }, () => ({
      color: animatedColors[Math.floor(Math.random() * animatedColors.length)],
      size: Math.random() * 8 + 4,
      top: Math.random() * 100,
      duration: Math.random() * 30 + 40,
      delay: Math.random() * 5,
      direction: (Math.random() > 0.5 ? 'left-to-right' : 'right-to-left') as 'left-to-right' | 'right-to-left',
      opacity: Math.random() * 0.6 + 0.4,
    }));
    
    return { largeStars, mediumStars, smallDots, animatedDots };
  }, []);
  
  // Clear snackbars when leaving the Browse page
  const { clearAllSnackbars } = useSnackbar();
  useEffect(() => {
    return () => {
      clearAllSnackbars();
    };
  }, [clearAllSnackbars]);

  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [allRequiredTasksCompleted, setAllRequiredTasksCompleted] = useState(false);
  const [lockedTaskIds, setLockedTaskIds] = useState<Set<string>>(new Set());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isPlaygroundNotCompleted, setIsPlaygroundNotCompleted] = useState(false);
  const filterModalRef = useRef<HTMLDivElement | null>(null);
  
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
          
          // Add playground task at the beginning of the list
          const playgroundCompleted = isPlaygroundCompletedFromSettings(user?.settings);
          const playgroundTask = {
            id: 'playground',
            name: 'Playground',
            title: 'Playground (Tutorial)',
            description: '<p>We recommend that you begin here: a practice environment where you can experiment with coding and test the AI assistant. Your changes won\'t be saved, and you can try out different features to get familiar with the interface.</p><p>Use this space to:</p><ul><li>Practice coding with the AI assistant</li><li>Test different features and functionality</li><li>Get comfortable with the editor and preview</li><li>Experiment freely without worrying about submissions</li></ul><p><strong>Note:</strong> This is a sandbox environment - your work will not be saved or logged.</p>',
            difficulty: 'Beginner',
            appType: 'practice',
            estimatedTime: '5-10 min',
            tags: ['practice', 'tutorial', 'sandbox'],
            preview: 'A practice environment for testing and learning',
            status: playgroundCompleted ? 'completed' : 'not-started',
            saved: false,
            label: 'Practice',
            category: 'tutorial'
          };
          
          setAllTasks([playgroundTask, ...tasks]);
          setIsLoadingTasks(false);
          return;
        }
      } catch (error) {
        console.debug('Error reading tasks cache:', error);
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
            console.debug('Error saving tasks cache:', error);
          }
        }
        
        // Add playground task
        const playgroundCompleted = isPlaygroundCompletedFromSettings(user?.settings);
        const playgroundTask = {
          id: 'playground',
          name: 'Playground',
          title: 'Playground (Tutorial)',
          description: '<p>We recommend that you begin here: a practice environment where you can experiment with coding and test the AI assistant. Your changes won\'t be saved, and you can try out different features to get familiar with the interface.</p><p>Use this space to:</p><ul><li>Practice coding with the AI assistant</li><li>Test different features and functionality</li><li>Get comfortable with the editor and preview</li><li>Experiment freely without worrying about submissions</li></ul><p><strong>Note:</strong> This is a sandbox environment - your work will not be saved or logged.</p>',
          difficulty: 'Beginner',
          appType: 'practice',
          estimatedTime: '5-10 min',
          tags: ['practice', 'tutorial', 'sandbox'],
          preview: 'A practice environment for testing and learning',
          status: playgroundCompleted ? 'completed' : 'not-started',
          saved: false,
          label: 'Practice',
          category: 'tutorial'
        };
        
        setAllTasks([playgroundTask, ...tasks]);
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

  // Helper function to create a seeded random number generator
  const createSeededRandom = useCallback((seed: string) => {
    // Convert seed string to a number
    let seedValue = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      seedValue = ((seedValue << 5) - seedValue) + char;
      seedValue = seedValue & seedValue; // Convert to 32-bit integer
    }
    
    // Seeded PRNG (Linear Congruential Generator)
    let state = Math.abs(seedValue) || 1;
    return () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }, []);

  // Helper function to shuffle an array (Fisher-Yates shuffle) with user-specific seed
  const shuffleArray = useCallback(<T,>(array: T[], seed: string): T[] => {
    if (array.length <= 1) return array;
    
    const shuffled = [...array];
    const random = createSeededRandom(seed);
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [createSeededRandom]);

  // Helper function to filter tasks by required status
  const filterTasksByRequiredStatus = useCallback((tasks: any[], userSeed: string): any[] => {
    const playgroundTask = tasks.find((task: any) => task.id === 'playground');
    const otherTasks = tasks.filter((task: any) => task.id !== 'playground');
    
    const completedTaskNames = new Set(
      otherTasks
        .filter((task: any) => task.status === 'completed')
        .map((task: any) => task.name)
    );
    
    const allRequiredTasksCompleted = POST_TEST_REQUIRED_TASKS.every(
      taskName => completedTaskNames.has(taskName)
    );
    
    if (allRequiredTasksCompleted) {
      // When all tasks are completed, return in current order (alphabetical)
      return playgroundTask ? [playgroundTask, ...otherTasks] : otherTasks;
    }
    
    // When not all required tasks are completed, filter and order them
    const requiredTaskNamesSet = new Set(POST_TEST_REQUIRED_TASKS);
    const filteredOtherTasks = otherTasks.filter((task: any) => requiredTaskNamesSet.has(task.name));
    
    // Separate into replication and open-ended tasks
    const replicationTasks = filteredOtherTasks.filter((task: any) => (task.label || 'open-ended') === 'replication');
    const openEndedTasks = filteredOtherTasks.filter((task: any) => (task.label || 'open-ended') === 'open-ended');
    
    // Shuffle each group with user-specific seed (consistent per user, random across users)
    const shuffledReplication = shuffleArray(replicationTasks, `${userSeed}_replication`);
    const shuffledOpenEnded = shuffleArray(openEndedTasks, `${userSeed}_openended`);
    
    // Return: Playground first, then replication tasks, then open-ended tasks
    const orderedTasks = [...shuffledReplication, ...shuffledOpenEnded];
    return playgroundTask ? [playgroundTask, ...orderedTasks] : orderedTasks;
  }, [shuffleArray]);

  // Filter tasks based on required status, filters, and search query
  useEffect(() => {
    const playgroundCompleted = isPlaygroundCompletedFromSettings(user?.settings);
    const tasksWithUpdatedPlayground = allTasks.map((task: any) => {
      if (task.id === 'playground') {
        return { ...task, status: playgroundCompleted ? 'completed' : 'not-started' };
      }
      return task;
    });
    
    // Check if all required tasks are completed
    const otherTasks = tasksWithUpdatedPlayground.filter((task: any) => task.id !== 'playground');
    const completedTaskNames = new Set(
      otherTasks
        .filter((task: any) => task.status === 'completed')
        .map((task: any) => task.name)
    );
    const allRequiredCompleted = POST_TEST_REQUIRED_TASKS.every(
      taskName => completedTaskNames.has(taskName)
    );
    setAllRequiredTasksCompleted(allRequiredCompleted);
    
    let tasksAfterRequiredFilter: any[];
    if (hasSecretPassword) {
      const seenIds = new Set<string>();
      tasksAfterRequiredFilter = tasksWithUpdatedPlayground.filter((task: any) => {
        if (seenIds.has(task.id)) {
          return false;
        }
        if (task.id !== 'playground' && (task.category === 'tutorial' || task.tags?.includes('tutorial'))) {
          return false;
        }
        seenIds.add(task.id);
        return true;
      });
    } else {
      // Create user-specific seed (use username if available, otherwise user ID, fallback to 'default')
      const userSeed = user?.username || (numericUserId ? `user_${numericUserId}` : 'default');
      tasksAfterRequiredFilter = filterTasksByRequiredStatus(tasksWithUpdatedPlayground, userSeed);
    }
    
    // Filter by status
    tasksAfterRequiredFilter = tasksAfterRequiredFilter.filter((task: any) => {
      if (task.id === 'playground') {
        return true;
      }
      const taskStatus = task.status || 'not-started';
      return statusFilters[taskStatus as keyof typeof statusFilters];
    });
    
    // Filter by category
    tasksAfterRequiredFilter = tasksAfterRequiredFilter.filter((task: any) => {
      if (task.id === 'playground') {
        return true;
      }
      const taskLabel = task.label || 'open-ended';
      return categoryFilters[taskLabel as keyof typeof categoryFilters];
    });
    
    // Filter by search query
    let finalFilteredTasks: any[];
    if (searchQuery.trim() === "") {
      finalFilteredTasks = tasksAfterRequiredFilter;
    } else {
      finalFilteredTasks = tasksAfterRequiredFilter.filter((task: any) =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.tags && task.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase())))
      );
    }
    
    // Calculate locked tasks and active task (only when not all required tasks are completed)
    if (!allRequiredCompleted && !hasSecretPassword) {
      const lockedIds = new Set<string>();
      let activeId: string | null = null;
      
      // Check if playground is completed
      const playgroundTask = finalFilteredTasks.find((task: any) => task.id === 'playground');
      const playgroundCompleted = playgroundTask?.status === 'completed';
      setIsPlaygroundNotCompleted(!playgroundCompleted);
      
      // Find the first uncompleted task (excluding playground)
      for (const task of finalFilteredTasks) {
        if (task.id === 'playground') continue; // Playground is always unlocked
        
        // If playground is not completed, lock all other tasks
        if (!playgroundCompleted) {
          lockedIds.add(task.id);
          continue;
        }
        
        const isCompleted = task.status === 'completed';
        
        if (!isCompleted && activeId === null) {
          // This is the active task (first uncompleted)
          activeId = task.id;
        } else if (!isCompleted && activeId !== null) {
          // This task comes after the active task, so it's locked
          lockedIds.add(task.id);
        }
      }
      
      setLockedTaskIds(lockedIds);
      setActiveTaskId(activeId);
    } else {
      // When all tasks are unlocked, clear locks
      setLockedTaskIds(new Set());
      setActiveTaskId(null);
    }
    
    setFilteredTasks(finalFilteredTasks);
  }, [searchQuery, allTasks, filterTasksByRequiredStatus, statusFilters, categoryFilters, hasSecretPassword, user, numericUserId]);

  // Close filter modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        filterModalRef.current && 
        !filterModalRef.current.contains(target) &&
        !target.closest('button')?.querySelector('svg[class*="lucide-filter"]')
      ) {
        setShowFilterModal(false);
      }
    };

    if (showFilterModal) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showFilterModal]);

  const handleRandomTask = async () => {
    const tasksWithoutPlayground = filteredTasks.filter(task => task.id !== 'playground');
    if (tasksWithoutPlayground.length === 0) return;
    const randomIndex = Math.floor(Math.random() * tasksWithoutPlayground.length);
    const randomTask = tasksWithoutPlayground[randomIndex];
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

  // Don't render anything if not authenticated - will redirect via useRouteProtection
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-gray-900 text-white relative">
      {/* Space Theme with Jam-Colored Stars */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Large stars */}
        {backgroundStars.largeStars.map((star, i) => (
          <div
            key={`star-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              backgroundColor: star.color,
              opacity: star.opacity,
              boxShadow: `0 0 ${star.size * 2}px ${star.color}, 0 0 ${star.size * 4}px ${star.color}`,
            }}
          />
        ))}
        
        {/* Medium stars */}
        {backgroundStars.mediumStars.map((star, i) => (
          <div
            key={`medium-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              backgroundColor: star.color,
              opacity: star.opacity,
              boxShadow: `0 0 ${star.size * 1.5}px ${star.color}`,
            }}
          />
        ))}
        
        {/* Small twinkling dots */}
        {backgroundStars.smallDots.map((dot, i) => (
          <div
            key={`dot-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              left: `${dot.left}%`,
              top: `${dot.top}%`,
              backgroundColor: dot.color,
              opacity: dot.opacity,
            }}
          />
        ))}
        
        {/* Animated jam-like dots moving across screen */}
        {backgroundStars.animatedDots.map((dot, i) => (
          <div
            key={`animated-dot-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              top: `${dot.top}%`,
              left: dot.direction === 'left-to-right' ? '-20px' : 'calc(100% + 20px)',
              backgroundColor: dot.color,
              opacity: dot.opacity,
              boxShadow: `0 0 ${dot.size * 1.5}px ${dot.color}, 0 0 ${dot.size * 3}px ${dot.color}`,
              animation: `moveAcross${dot.direction === 'left-to-right' ? 'Right' : 'Left'} ${dot.duration}s linear ${dot.delay}s infinite`,
            }}
          />
        ))}
      </div>

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
            {(allRequiredTasksCompleted || hasSecretPassword) && (
              <div className="flex items-center justify-between w-full mb-6">
                {/* Left side - Search questions, Filter button - 50% width */}
                <div className="flex items-center space-x-3 w-1/2">
                  {/* Search bar */}
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
                  
                  {/* Filter button with tooltip */}
                  <div className="relative group">
                    <button 
                      onClick={() => setShowFilterModal(!showFilterModal)}
                      className="px-3 h-[38px] rounded-lg bg-gray-800 border border-gray-600 hover:bg-gray-700 transition-colors flex items-center justify-center"
                    >
                      <Filter className="h-4 w-4 text-gray-400 group-hover:text-white transition-colors" />
                    </button>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-300">
                      Filter tasks
                    </div>
                    
                    {/* Filter dropdown */}
                    {showFilterModal && (
                      <div ref={filterModalRef} className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-[200] p-4">
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-white mb-2">Status</h3>
                          <div className="space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={statusFilters['completed']}
                                onChange={(e) => setStatusFilters({...statusFilters, 'completed': e.target.checked})}
                                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-300">Completed</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={statusFilters['in-progress']}
                                onChange={(e) => setStatusFilters({...statusFilters, 'in-progress': e.target.checked})}
                                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-300">In Progress</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={statusFilters['not-started']}
                                onChange={(e) => setStatusFilters({...statusFilters, 'not-started': e.target.checked})}
                                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-300">Not Started</span>
                            </label>
                          </div>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white mb-2">Category</h3>
                          <div className="space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={categoryFilters['open-ended']}
                                onChange={(e) => setCategoryFilters({...categoryFilters, 'open-ended': e.target.checked})}
                                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-300">Open-Ended</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={categoryFilters['replication']}
                                onChange={(e) => setCategoryFilters({...categoryFilters, 'replication': e.target.checked})}
                                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-300">Replication</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
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
                      Random task
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Task List */}
              {filteredTasks.length > 0 && (
                <div className="flex-1 overflow-visible">
                  <TaskCardGrid
                    tasks={filteredTasks}
                    onGetStarted={handleGetStarted}
                    lockedTaskIds={lockedTaskIds}
                    activeTaskId={activeTaskId}
                    isLockingEnabled={!allRequiredTasksCompleted && !hasSecretPassword}
                    isPlaygroundNotCompleted={isPlaygroundNotCompleted}
                  />
                </div>
              )}

              {/* No results or loading state */}
              {filteredTasks.length === 0 && (
                <div className="py-12 w-full">
                  <div className="text-center">
                    {searchQuery.trim() === "" ? (
                      <div className="flex items-center justify-center space-x-3">
                        <LoadingSpinner size="lg" color="blue" />
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