"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import PageScaffold from "../components/PageScaffold";
import SkillCheckPage from "../pages/SkillCheckPage";
import LoadingSpinner from "../components/LoadingSpinner";
import { useUserStudyPopup } from "../components/UserStudyPopup";
import { useAuth } from "../utils/auth";
import { isStudyEnded } from "../config/study";

type SkillCheckMode = 'pre-test' | 'post-test' | 'locked-pre-test' | 'locked-post-test' | 'retake';

export default function SkillCheckRoute() {
  const { popupState, isCalculating, preTestCompleted, postTestCompleted } = useUserStudyPopup();
  const { user } = useAuth();
  const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  const studyEnded = isStudyEnded();
  const [localPreTestCompleted, setLocalPreTestCompleted] = useState<boolean | null>(null);
  const [localPostTestCompleted, setLocalPostTestCompleted] = useState<boolean | null>(null);
  const hasFetchedRef = useRef(false);

  // Only fetch completion status as a fallback if context values are not available
  // This happens when the page loads before UserStudyPopupProvider has calculated the state
  useEffect(() => {
    if (studyEnded) {
      return;
    }
    // Use context values if available (preferred - avoids redundant API call)
    if (preTestCompleted !== null && postTestCompleted !== null) {
      return;
    }
    
    // Fallback: fetch only if context values are not available and we haven't fetched yet
    if (popupState === 'none' && numericUserId && !hasFetchedRef.current && 
        (preTestCompleted === null || postTestCompleted === null)) {
      hasFetchedRef.current = true;
      const timestamp = Date.now();
      // Use the combined endpoint to fetch both phases in a single call
      fetch(`/api/skill-check/completion-status-both?user_id=${encodeURIComponent(numericUserId)}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      }).then((response) => {
        if (response.ok) {
          response.json().then(data => {
            setLocalPreTestCompleted(data.pre_test?.completed || false);
            setLocalPostTestCompleted(data.post_test?.completed || false);
          });
        } else {
          setLocalPreTestCompleted(false);
          setLocalPostTestCompleted(false);
        }
      }).catch((error) => {
        console.error('Error fetching completion status:', error);
        setLocalPreTestCompleted(false);
        setLocalPostTestCompleted(false);
      });
    }
    // Reset the ref if popupState changes away from 'none'
    if (popupState !== 'none') {
      hasFetchedRef.current = false;
    }
  }, [popupState, numericUserId, preTestCompleted, postTestCompleted, studyEnded]);

  // Derive skillCheckMode from popupState and completion status
  // Prefer context values, fall back to local state if context values aren't available yet
  const skillCheckMode: SkillCheckMode = useMemo(() => {
    if (studyEnded) return 'retake';
    if (isCalculating) return 'locked-pre-test';
    if (popupState === 'pre-test') return 'pre-test';
    if (popupState === 'post-test') return 'post-test';
    // If popupState is 'none' or 'skill-check-prompt', determine locked state from completion status
    if (popupState === 'none' || popupState === 'skill-check-prompt') {
      // Prefer context values from UserStudyPopupProvider (no API call needed)
      const effectivePostTestCompleted = postTestCompleted ?? localPostTestCompleted;
      const effectivePreTestCompleted = preTestCompleted ?? localPreTestCompleted;
      
      // If we have the completion status, use it to determine the locked state
      if (effectivePreTestCompleted !== null && effectivePostTestCompleted !== null) {
        return effectivePostTestCompleted ? 'locked-post-test' : 'locked-pre-test';
      }
      // While loading, default to locked-pre-test
      return 'locked-pre-test';
    }
    return 'locked-pre-test';
  }, [isCalculating, popupState, preTestCompleted, postTestCompleted, localPreTestCompleted, localPostTestCompleted, studyEnded]);

  const showBackground = skillCheckMode === 'locked-pre-test' || skillCheckMode === 'locked-post-test';

  return (
    <PageScaffold showBackground={showBackground} widerMaxWidth reducedPadding>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[calc(100vh-3rem)]">
            <LoadingSpinner size="lg" color="white" />
          </div>
        }
      >
        <SkillCheckPage skillCheckMode={skillCheckMode} isCalculating={isCalculating ?? false} />
      </Suspense>
    </PageScaffold>
  );
}
