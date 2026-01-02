"use client";
import { ReactNode, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import UserStudyPopup, { PopupState, UserStudyPopupContext } from "./UserStudyPopup";
import { getCookie } from "../utils/cookies";
import { ENV } from "../config/env";
import { useAuth } from "../utils/auth";
import { POST_TEST_REQUIRED_TASKS } from "../config/tasks";

type TutorialCookieState = 'unseen' | 'seen' | 'dismissed';
const TUTORIAL_COOKIE_NAME = `${ENV.COOKIE_PREFIX}tutorial_state`;

// Pre-computed SHA-256 hash of "penguin" (hex)
const PASSWORD_HASH = '0a4346f806b28b3ce94905c3ac56fcd5ee2337d8613161696aba52eb0c3551cc';

/**
 * Hash a string using SHA-256
 */
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

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
  const searchParams = useSearchParams();
  const { user, isLoading: isAuthLoading } = useAuth();
  const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  
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
  
  // Calculate the appropriate popup state based on user progress
  const calculatePopupState = useCallback(async (): Promise<PopupState> => {
    // If secret password is present, bypass all popup logic
    if (hasSecretPassword) {
      return 'none';
    }
    
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
      
      // Fetch all required data in parallel for better performance
      const [testStatusResponse, submissionsResponse, tasksResponse] = await Promise.all([
        fetch(`/api/skill-check/completion-status-both?user_id=${numericUserId}`),
        fetch(`${ENV.BACKEND_URL}/api/users/${numericUserId}/submissions`),
        fetch(`/api/tasks`)
      ]);
      
      // Parse test status (combines pre-test and post-test in one call)
      let preTestCompletedValue = false;
      let postTestCompletedValue = false;
      if (testStatusResponse.ok) {
        const testStatusData = await testStatusResponse.json();
        preTestCompletedValue = testStatusData.pre_test?.completed || false;
        postTestCompletedValue = testStatusData.post_test?.completed || false;
        debugInfo.preTestCompleted = preTestCompletedValue;
        debugInfo.postTestCompleted = postTestCompletedValue;
      } else {
        debugInfo.preTestCompleted = false;
        debugInfo.postTestCompleted = false;
      }
      
      // Store the completion status in state for use by other components
      setPreTestCompleted(preTestCompletedValue);
      setPostTestCompleted(postTestCompletedValue);
      
      // Use the local variables for the rest of the function
      const preTestCompleted = preTestCompletedValue;
      const postTestCompleted = postTestCompletedValue;
      
      // Parse submissions
      let submissionsData = { items: [] };
      if (submissionsResponse.ok) {
        submissionsData = await submissionsResponse.json();
        debugInfo.hasAnySubmissions = submissionsData.items && submissionsData.items.length > 0;
      }
      
      const submissions = submissionsData.items || [];
      const submittedProjectIds = new Set<number>(
        submissions.map((sub: any) => sub.projectId).filter((id: any): id is number => id != null)
      );
      
      // Parse tasks and map projectId to task name
      let tasks: any[] = [];
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        tasks = tasksData.tasks || [];
        
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
      if (!preTestCompleted) {
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
      if (!postTestCompleted) {
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
  }, [numericUserId, hasSecretPassword]);
  
  // Manage the popup state
  const [popupState, setPopupState] = useState<PopupState>('none');
  const [isCalculating, setIsCalculating] = useState(false);
  const [preTestCompleted, setPreTestCompleted] = useState<boolean | null>(null);
  const [postTestCompleted, setPostTestCompleted] = useState<boolean | null>(null);
  const isCalculatingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  
  // Expose a function to trigger recalculation (for when user completes task)
  // This is the ONLY place we make API calls to check test completion status
  const recalculateState = useCallback(async () => {
    if (isCalculatingRef.current) {
      return; // Prevent concurrent calculations
    }
    isCalculatingRef.current = true;
    setIsCalculating(true);
    try {
      const newState = await calculatePopupState();
      setPopupState(newState);
    } finally {
      isCalculatingRef.current = false;
      setIsCalculating(false);
    }
  }, [calculatePopupState]);
  
  // Initialize popup state on first page load (after auth loads)
  // This only runs once when auth is ready
  useEffect(() => {
    if (isAuthLoading || !numericUserId || hasInitializedRef.current) {
      return;
    }
    
    // Secret password bypass
    if (hasSecretPassword) {
      setPopupState('none');
      hasInitializedRef.current = true;
      return;
    }
    
    // Recalculate on first load only
    hasInitializedRef.current = true;
    recalculateState();
  }, [isAuthLoading, numericUserId, hasSecretPassword, recalculateState]);
  
  // Handle tutorial close - first hide the tutorial, then recalculate to show next popup
  const handleTutorialClose = useCallback(() => {
    // First, hide the tutorial popup immediately
    setPopupState('none');
    // Then recalculate state after a brief delay to show pre-test (if needed)
    // This gives a smooth transition from tutorial to pre-test
    setTimeout(() => {
      recalculateState();
    }, 100);
  }, [recalculateState]);
  
  return (
    <UserStudyPopupContext.Provider value={{ 
      popupState, 
      setPopupState, 
      recalculateState, 
      isCalculating,
      onTutorialClose: handleTutorialClose,
      preTestCompleted,
      postTestCompleted
    }}>
      <UserStudyPopup />
      {children}
    </UserStudyPopupContext.Provider>
  );
}

