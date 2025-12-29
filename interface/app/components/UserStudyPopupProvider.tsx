"use client";
import { ReactNode, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import UserStudyPopup, { PopupState, UserStudyPopupContext } from "./UserStudyPopup";
import { getCookie } from "../utils/cookies";
import { ENV } from "../config/env";
import { useAuth } from "../utils/auth";
import { POST_TEST_REQUIRED_TASKS } from "../config/tasks";

type TutorialCookieState = 'unseen' | 'seen' | 'dismissed';
const TUTORIAL_COOKIE_NAME = `${ENV.COOKIE_PREFIX}tutorial_state`;

interface UserStudyPopupProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps the UserStudyPopup and provides context to children.
 * This allows the popup to be included in the server-side layout.
 * 
 * Dynamically calculates popup state based on:
 * - Tutorial cookie status
 * - User submissions (for pre-test check)
 * - Task completion status (for post-test check)
 * - Skill check completion status
 * 
 * Other components can use useUserStudyPopup() hook to access and set the popup state.
 */
export default function UserStudyPopupProvider({ children }: UserStudyPopupProviderProps) {
  const pathname = usePathname();
  const { user, isLoading: isAuthLoading } = useAuth();
  const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  
  // Calculate the appropriate popup state based on user progress
  const calculatePopupState = useCallback(async (): Promise<PopupState> => {
    // Collect debug information
    const debugInfo: any = {
      userId: numericUserId,
      tutorialState: null as TutorialCookieState | null,
      hasAnySubmissions: null as boolean | null,
      preTestCompleted: null as boolean | null,
      postTestCompleted: null as boolean | null,
      allRequiredTasksCompleted: null as boolean | null,
      completedTaskNames: [] as string[],
      requiredTaskNames: POST_TEST_REQUIRED_TASKS,
      finalDecision: null as PopupState | null,
      error: null as any,
    };

    // If no user ID (not authenticated), don't show any popup
    if (!numericUserId) {
      debugInfo.finalDecision = 'none';
      console.log('[UserStudyPopupProvider] Decision details:', debugInfo);
      return 'none';
    }
    
    try {
      // Check tutorial cookie first
      const tutorialState = (getCookie(TUTORIAL_COOKIE_NAME) as TutorialCookieState | null) || 'unseen';
      debugInfo.tutorialState = tutorialState;
      
      // Always check pre-test and post-test completion status (set as booleans)
      const preTestResponse = await fetch(`/api/skill-check/completion-status?user_id=${numericUserId}&phase=pre-test`);
      if (preTestResponse.ok) {
        const preTestData = await preTestResponse.json();
        debugInfo.preTestCompleted = preTestData.completed || false;
      } else {
        debugInfo.preTestCompleted = false;
      }

      const postTestResponse = await fetch(`/api/skill-check/completion-status?user_id=${numericUserId}&phase=post-test`);
      if (postTestResponse.ok) {
        const postTestData = await postTestResponse.json();
        debugInfo.postTestCompleted = postTestData.completed || false;
      } else {
        debugInfo.postTestCompleted = false;
      }
      
      // Get submissions and determine completed tasks (for logging and post-test check)
      const submissionsResponse = await fetch(`${ENV.BACKEND_URL}/api/users/${numericUserId}/submissions`);
      let submissionsData = { items: [] };
      if (submissionsResponse.ok) {
        submissionsData = await submissionsResponse.json();
        debugInfo.hasAnySubmissions = submissionsData.items && submissionsData.items.length > 0;
      }
      
      const submissions = submissionsData.items || [];
      const submittedProjectIds = new Set<number>(
        submissions.map((sub: any) => sub.projectId).filter((id: any): id is number => id != null)
      );
      
      // Fetch all tasks to map projectId to task name
      const tasksResponse = await fetch(`/api/tasks`);
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        const tasks = tasksData.tasks || [];
        
        // Create mapping of projectId to task name
        const projectIdToTaskName = new Map<number, string>();
        tasks.forEach((task: any) => {
          if (task.projectId && task.name) {
            projectIdToTaskName.set(task.projectId, task.name);
          }
        });
        
        // Find completed task names from submissions
        const completedTaskNames = new Set<string>();
        submittedProjectIds.forEach((projectId: number) => {
          const taskName = projectIdToTaskName.get(projectId);
          if (taskName) {
            completedTaskNames.add(taskName);
          }
        });
        
        debugInfo.completedTaskNames = Array.from(completedTaskNames);
        debugInfo.allRequiredTasksCompleted = POST_TEST_REQUIRED_TASKS.every(
          taskName => completedTaskNames.has(taskName)
        );
      }
      
      // Simplified decision flow:
      // 1. If user hasn't seen tutorial, show tutorial
      if (tutorialState === 'unseen') {
        debugInfo.finalDecision = 'tutorial';
        console.log('[UserStudyPopupProvider] Decision details:', debugInfo);
        return 'tutorial';
      }
      
      // 2. Otherwise, if user has not done the pre-test, show pre-test
      if (!debugInfo.preTestCompleted) {
        debugInfo.finalDecision = 'pre-test';
        console.log('[UserStudyPopupProvider] Decision details:', debugInfo);
        return 'pre-test';
      }
      
      // 3. Otherwise, if user has not completed all required tasks, show nothing
      if (!debugInfo.allRequiredTasksCompleted) {
        debugInfo.finalDecision = 'none';
        console.log('[UserStudyPopupProvider] Decision details:', debugInfo);
        return 'none';
      }
      
      // 4. Otherwise, if user has not done the post-test, show post-test
      if (!debugInfo.postTestCompleted) {
        debugInfo.finalDecision = 'post-test';
        console.log('[UserStudyPopupProvider] Decision details:', debugInfo);
        return 'post-test';
      }
      
      // 5. Otherwise, show nothing
      debugInfo.finalDecision = 'none';
      console.log('[UserStudyPopupProvider] Decision details:', debugInfo);
      return 'none';
    } catch (error) {
      debugInfo.error = error;
      debugInfo.finalDecision = 'none';
      console.error('[UserStudyPopupProvider] Error calculating popup state:', error);
      console.log('[UserStudyPopupProvider] Decision details:', debugInfo);
      // On error, default to none to avoid blocking the user
      return 'none';
    }
  }, [numericUserId]);
  
  // Manage the popup state
  const [popupState, setPopupState] = useState<PopupState>('none');
  const [isCalculating, setIsCalculating] = useState(true);
  
  // Calculate popup state on mount and when dependencies change
  // Wait for auth to finish loading before calculating
  useEffect(() => {
    if (isAuthLoading) {
      return; // Wait for auth to finish loading
    }
    
    const updateState = async () => {
      setIsCalculating(true);
      const newState = await calculatePopupState();
      setPopupState(newState);
      setIsCalculating(false);
    };
    
    updateState();
  }, [calculatePopupState, isAuthLoading]);
  
  // Recalculate on pathname change (navigation) - but wait for auth to load
  useEffect(() => {
    if (isAuthLoading || isCalculating) {
      return;
    }
    calculatePopupState().then(newState => {
      setPopupState(newState);
    });
  }, [pathname, calculatePopupState, isCalculating, isAuthLoading]);
  
  // Expose a function to trigger recalculation (for when user completes skill check or submits project)
  const recalculateState = useCallback(async () => {
    const newState = await calculatePopupState();
    setPopupState(newState);
  }, [calculatePopupState]);
  
  return (
    <UserStudyPopupContext.Provider value={{ popupState, setPopupState, recalculateState, isCalculating }}>
      <UserStudyPopup />
      {children}
    </UserStudyPopupContext.Provider>
  );
}
