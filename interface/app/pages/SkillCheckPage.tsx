import { Clock, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SkillCheckFlow from "../components/SkillCheckFlow";
import { useAuth } from "../utils/auth";
import LoadingSpinner from "../components/LoadingSpinner";
import { useUserStudyPopup } from "../components/UserStudyPopup";
import { generateUuidV4 } from "../utils/cookies";
import { POST_TEST_REQUIRED_TASKS } from "../config/tasks";
import { ENV } from "../config/env";
import { PASSWORD_HASH, hashString } from "../utils/password";
import RetakeQuestionModal from "../components/RetakeQuestionModal";
import { useSnackbar } from "../components/SnackbarProvider";
import { isStudyEnded } from "../config/study";

interface SkillCheckPageProps {
  skillCheckMode: 'pre-test' | 'post-test' | 'locked-pre-test' | 'locked-post-test' | 'retake';
  isCalculating?: boolean;
}

const DEFAULT_RETAKE_COUNTS = {
  frontendMcqa: 10,
  uxMcqa: 10,
  coding: 3,
  debugging: 3,
};

export default function SkillCheckPage({ skillCheckMode, isCalculating = false }: SkillCheckPageProps) {
  const { user } = useAuth();
  const { recalculateState } = useUserStudyPopup();
  const { showSnackbar } = useSnackbar();
  const searchParams = useSearchParams();
  const userId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  const [isStarted, setIsStarted] = useState(false);
  const [currentQuestionType, setCurrentQuestionType] = useState<string | null>(null);
  const [currentCodeType, setCurrentCodeType] = useState<string | null>(null);
  const [isRetakeMode, setIsRetakeMode] = useState(false);
  const [retakeSessionId, setRetakeSessionId] = useState<string | null>(null);
  const [showRetakeModal, setShowRetakeModal] = useState(false);
  const [retakeQuestionCounts, setRetakeQuestionCounts] = useState<{
    frontendMcqa: number;
    uxMcqa: number;
    coding: number;
    debugging: number;
  } | null>(null);
  const [completionStatus, setCompletionStatus] = useState<{
    completed: boolean;
    has_responses: boolean;
    loading: boolean;
    current_question_index: number;
  }>({ completed: false, has_responses: false, loading: true, current_question_index: 0 });
  const [studyComplete, setStudyComplete] = useState(false);
  const [checkingStudyStatus, setCheckingStudyStatus] = useState(true);
  const studyEnded = isStudyEnded();
  const isForcedRetake = studyEnded || skillCheckMode === 'retake';
  const effectiveRetakeMode = isRetakeMode || isForcedRetake;

  const startRetakeWithDefaults = () => {
    if (!retakeSessionId) {
      setRetakeSessionId(generateUuidV4());
    }
    if (!retakeQuestionCounts) {
      setRetakeQuestionCounts(DEFAULT_RETAKE_COUNTS);
    }
    setIsRetakeMode(true);
    setIsStarted(true);
  };

  // Load confetti script dynamically
  useEffect(() => {
    const checkAndLoadConfetti = () => {
      if (typeof window !== 'undefined') {
        // Check if already loaded
        if ((window as any).confetti) {
          return;
        }
        
        // Try to load canvas-confetti which is simpler and more reliable
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
        script.async = true;
        script.onload = () => {
          setTimeout(() => {
            if ((window as any).confetti) {
              // Confetti loaded successfully
            }
          }, 100);
        };
        document.head.appendChild(script);
      }
    };
    
    checkAndLoadConfetti();
  }, []);

  // Function to trigger confetti animation (same as project submission)
  const triggerConfetti = () => {
    const confettiLib = (window as any).confetti;
    
    if (confettiLib) {
      const duration = 3 * 1000; // 3 seconds
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 99999 };

      const randomInRange = (min: number, max: number) => {
        return Math.random() * (max - min) + min;
      };

      const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);

        // since particles fall down, start a bit higher than random
        confettiLib(
          Object.assign({}, defaults, {
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          })
        );
        confettiLib(
          Object.assign({}, defaults, {
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          })
        );
      }, 250);
    }
  };

  // Check if study is complete (POST_TEST tasks completed and post-test completed)
  useEffect(() => {
    const checkStudyStatus = async () => {
      if (!userId || effectiveRetakeMode) {
        setCheckingStudyStatus(false);
        return;
      }

      try {
        // Check if POST_TEST tasks are completed and post-test is completed
        const [submissionsResponse, tasksResponse, skillCheckResponse] = await Promise.all([
          fetch(`${ENV.BACKEND_URL}/api/users/${userId}/submissions`),
          fetch(`/api/tasks`),
          fetch(`/api/skill-check/completion-status-both?user_id=${userId}`),
        ]);

        // Parse submissions
        let submissionsData = { items: [] };
        if (submissionsResponse.ok) {
          submissionsData = await submissionsResponse.json();
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
        }

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

        // Check if all required tasks are completed
        const allRequiredTasksCompleted = POST_TEST_REQUIRED_TASKS.every(
          taskName => completedTaskNames.has(taskName)
        );

        // Check if post-test is completed
        let postTestCompleted = false;
        if (skillCheckResponse.ok) {
          const skillCheckData = await skillCheckResponse.json();
          postTestCompleted = skillCheckData.post_test?.completed || false;
        }

        // Study is complete if both conditions are met
        if (allRequiredTasksCompleted && postTestCompleted) {
          setStudyComplete(true);
        }
      } catch (error) {
        console.error('Error checking study status:', error);
      } finally {
        setCheckingStudyStatus(false);
      }
    };

    checkStudyStatus();
  }, [userId, effectiveRetakeMode]);

  // Check completion status on mount (for both pre-test and post-test, not for retake)
  useEffect(() => {
    const checkCompletionStatus = async () => {
      if ((skillCheckMode !== 'pre-test' && skillCheckMode !== 'post-test') || !userId || effectiveRetakeMode) {
        setCompletionStatus({ completed: false, has_responses: false, loading: false, current_question_index: 0 });
        return;
      }

      try {
        const phase = skillCheckMode === 'pre-test' ? 'pre-test' : 'post-test';
        // Add timestamp to prevent caching
        const timestamp = Date.now();
        const response = await fetch(
          `/api/skill-check/completion-status?user_id=${encodeURIComponent(userId)}&phase=${encodeURIComponent(phase)}&_t=${timestamp}`,
          {
            cache: 'no-store', // Prevent browser caching
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          }
        );
        if (response.ok) {
          const data = await response.json();
          setCompletionStatus({
            completed: data.completed || false,
            has_responses: data.has_responses || false,
            loading: false,
            current_question_index: data.current_question_index || 0,
          });
        } else {
          setCompletionStatus({ completed: false, has_responses: false, loading: false, current_question_index: 0 });
        }
      } catch (error) {
        console.error('Error checking completion status:', error);
        setCompletionStatus({ completed: false, has_responses: false, loading: false, current_question_index: 0 });
      }
    };

    checkCompletionStatus();
  }, [skillCheckMode, userId, effectiveRetakeMode]);
  
  const getDescription = () => {
    if (!isStarted || !currentQuestionType) {
      if (effectiveRetakeMode) {
        return "Practice the skill check and review answers as you go.";
      }
      return skillCheckMode === 'pre-test' 
        ? "Please complete the skill check before starting the website building tasks."
        : "Thank you for completing the website building tasks! Please complete the skill check below to finish the research study.";
    }
    
    if (currentQuestionType === 'coding') {
      return currentCodeType === 'debug'
        ? "Please correct the given code to pass all test cases"
        : "Please implement this function to pass all test cases";
    }
    
    // For frontend, ux, experience, nasa_tli
    return "Please answer the following question";
  };
  
  // Show loading state while calculating to avoid flickering
  if (isCalculating || checkingStudyStatus) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-2 mx-auto w-full min-h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-center space-x-3">
          <LoadingSpinner size="lg" color="blue" />
          <p className="text-gray-400 text-lg">Loading Skill Check Progress</p>
        </div>
      </div>
    );
  }

  // Show loading state when verifying completion after finishing skill check
  if (!isStarted && completionStatus.loading && (skillCheckMode === 'pre-test' || skillCheckMode === 'post-test')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-2 mx-auto w-full min-h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-center space-x-3">
          <LoadingSpinner size="lg" color="blue" />
          <p className="text-gray-400 text-lg">Loading Skill Check Progress</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col items-start justify-start pt-2 px-2 mx-auto w-full h-full">
      {!isStarted && (
        <h1 className="text-3xl font-semibold text-white mb-2 mt-4">
          {effectiveRetakeMode
            ? 'Retake Skill Check (For Fun)'
            : skillCheckMode === 'pre-test' 
            ? 'Pre-Test Skill Check'
            : skillCheckMode === 'post-test'
            ? 'Post-Test Skill Check'
            : 'Skill Check'}
        </h1>
      )}
      {/* Completion Message - Show if skill check is completed */}
      {!isStarted && (skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed && !effectiveRetakeMode && (
        <div className="bg-blue-900/20 rounded-lg border border-blue-700/50 p-6 mb-4 w-full mt-4">
          <p className="text-gray-300 text-lg">
            Thanks for completing the skill check! {skillCheckMode === 'pre-test' && (
              <>Head over to the{" "}
              <Link href="/" className="text-blue-400 hover:text-blue-300 underline font-semibold">
                browse page
              </Link>{" "}
              to start building websites in VibeJam 🚀</>
            )}
            {skillCheckMode === 'post-test' && (
              <>
                You have completed the research study. If you had fun building websites in VibeJam and want to do more, you can head over to the{" "}
                <Link href="/browse" className="text-blue-400 hover:text-blue-300 underline font-semibold">
                  browse page
                </Link>
                , where we've unlocked 50+ tasks for you to refine your AI-assisted coding skills and compete with other users 🎉
                <div className="mt-4 pt-4 border-t border-blue-700/50">
                  <p className="text-gray-300 mb-3">Want to practice more? Try the skill check again with more questions!</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowRetakeModal(true);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 text-sm"
                    >
                      Retake Skill Check (For Fun)
                    </button>
                    <Link
                      href="/stats"
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors duration-200 text-sm inline-block"
                    >
                      View Your Stats
                    </Link>
                  </div>
                </div>
              </>
            )}
          </p>
        </div>
      )}
      {/* Mode Message as Subheader - Only show when not started and not completed */}
      {!isStarted && !((skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed && !effectiveRetakeMode) && (
        skillCheckMode === 'locked-pre-test' ? (
          <div className="bg-blue-900/20 rounded-lg border border-blue-700/50 p-6 mb-4 w-full mt-4">
            <p className="text-gray-300 text-lg">
              Thanks for completing the skill check! Head over to the{" "}
              <Link href="/browse" className="text-blue-400 hover:text-blue-300 underline font-semibold">
                tasks page
              </Link>{" "}
              to start building websites in VibeJam 🚀
            </p>
          </div>
        ) : skillCheckMode === 'locked-post-test' ? (
          <div className="bg-blue-900/20 rounded-lg border border-blue-700/50 p-6 mb-4 w-full mt-4">
            <p className="text-gray-300 text-lg">
              <>You have completed the research study! If you had fun building websites in VibeJam and want to do more, you can head over to the{" "}
                <Link href="/browse" className="text-blue-400 hover:text-blue-300 underline font-semibold">
                  browse page
                </Link>
                , where we've unlocked 50+ tasks for you to refine your AI-assisted coding skills and compete with other users 🎉
                <div className="mt-4 pt-4 border-t border-blue-700/50">
                  <p className="text-gray-300 mb-3">Want to practice more? Try the skill check again with more questions!</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowRetakeModal(true);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 text-sm"
                    >
                      Retake Skill Check (For Fun)
                    </button>
                    <Link
                      href="/stats"
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors duration-200 text-sm inline-block"
                    >
                      View Your Stats
                    </Link>
                  </div>
                </div>
              </>
            </p>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-4">
            {getDescription()}
          </p>
        )
      )}
      <div className="flex flex-col gap-4 w-full flex-1 min-h-0">
        {/* Skill Check Flow - Show when started (or when in retake mode) */}
        {isStarted && (skillCheckMode !== 'locked-pre-test' && skillCheckMode !== 'locked-post-test' || effectiveRetakeMode) ? (
          <div className="flex-1 min-h-0 flex flex-col w-full">
            <SkillCheckFlow
              mode={effectiveRetakeMode ? 'retake' : (skillCheckMode === 'pre-test' || skillCheckMode === 'post-test' ? skillCheckMode : 'pre-test')}
              retakeSessionId={effectiveRetakeMode ? retakeSessionId : null}
              retakeQuestionCounts={effectiveRetakeMode ? retakeQuestionCounts : null}
              initialIndex={(() => {
                const idx = completionStatus.has_responses && !completionStatus.completed && !effectiveRetakeMode ? completionStatus.current_question_index : 0;
                return idx;
              })()}
              onComplete={() => {
                setIsStarted(false);
                setCurrentQuestionType(null);
                setCurrentCodeType(null);
                
                // Always trigger confetti animation when skill check completes
                triggerConfetti();
                
                if (effectiveRetakeMode) {
                  // Show snackbar with link to stats page for retake mode
                  showSnackbar(
                    <>
                      Great Work! You can check whether your skills have improved on the{' '}
                      <Link 
                        href="/stats" 
                        style={{ 
                          textDecoration: 'underline', 
                          fontWeight: 600,
                          color: '#2563eb',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#1d4ed8'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#2563eb'}
                      >
                        Stats
                      </Link>{' '}
                      page
                    </>,
                    8000
                  );
                  // For retake, just reset - no need to check completion status
                  if (isRetakeMode) {
                    setIsRetakeMode(false);
                  }
                  setRetakeSessionId(null);
                  setRetakeQuestionCounts(null);
                  setCompletionStatus({ completed: false, has_responses: false, loading: false, current_question_index: 0 });
                } else {
                  // Show loading spinner while we verify completion status
                  setCompletionStatus(prev => ({
                    ...prev,
                    completed: false,
                    loading: true,
                  }));
                  // Refresh completion status and popup state
                  const phase = skillCheckMode === 'pre-test' ? 'pre-test' : 'post-test';
                  fetch(`/api/skill-check/completion-status?user_id=${encodeURIComponent(userId!)}&phase=${encodeURIComponent(phase)}`)
                    .then(res => res.json())
                    .then(data => {
                      // Update status based on API response
                      setCompletionStatus({
                        completed: data.completed || false,
                        has_responses: data.has_responses || false,
                        loading: false,
                        current_question_index: data.current_question_index || 0,
                      });
                      // Refresh popup state so it knows skill check is done (this prevents the popup from showing)
                      recalculateState?.();
                    })
                    .catch(err => {
                      console.error('Error refreshing completion status:', err);
                      // If API call fails, assume it's completed (user just finished it)
                      setCompletionStatus(prev => ({
                        ...prev,
                        completed: true,
                        loading: false,
                      }));
                      // Still refresh popup state
                      recalculateState?.();
                    });
                }
              }}
              onCancel={() => {
                setIsStarted(false);
                setCurrentQuestionType(null);
                setCurrentCodeType(null);
                if (isRetakeMode) {
                  setIsRetakeMode(false);
                  setRetakeSessionId(null);
                  setRetakeQuestionCounts(null);
                }
              }}
              onQuestionChange={(questionType, codeType) => {
                setCurrentQuestionType(questionType);
                setCurrentCodeType(codeType || null);
              }}
            />
          </div>
        ) : (
          <>
            {/* Instructions - Only show if not locked and not completed */}
            {skillCheckMode !== 'locked-pre-test' && skillCheckMode !== 'locked-post-test' && !((skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed && !effectiveRetakeMode) && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h2 className="text-xl font-semibold text-white mb-3">What You'll Do</h2>
            <div className="text-gray-300 space-y-3 leading-relaxed text-sm">
              <p>
                {effectiveRetakeMode
                  ? 'Use this skill check to practice and review your answers as you go.'
                  : 'As part of our research study on AI coding assistants, we are running "skill checks" to measure your general coding abilities and knowledge. This check will be broken down into two phases:'}
              </p>
              <div className="mt-4 space-y-3">
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center mt-0.5">
                    <span className="text-white text-xs font-semibold">1</span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">Multiple-Choice Questions ({"<"}20 minutes)</h3>
                    <p className="text-gray-300 text-sm">
                      You'll answer a series of multiple-choice questions covering:
                    </p>
                    <ul className="list-disc list-inside mt-1.5 text-gray-300 ml-3 text-sm">
                      <li>
                        {effectiveRetakeMode
                          ? "A mix of experience, frontend, and UX knowledge questions"
                          : skillCheckMode === 'pre-test' 
                            ? "Your programming experience and background"
                            : "Your perceived effort when completing the tasks"}
                      </li>
                      <li>{"Your knowledge of frontend syntax and programming (HTML, CSS, JavaScript)"}</li>
                      <li>{"Your knowledge of user experience (UX) design principles"}</li>
                    </ul>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center mt-0.5">
                    <span className="text-white text-xs font-semibold">2</span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">Coding Tasks ({"<"}40 minutes)</h3>
                    <p className="text-gray-300 text-sm mb-1.5">
                      You'll then complete a series of coding tasks <strong className="text-white">without AI assistance</strong>, where you must implement a function to pass a set of test cases. You will either start from:
                    </p>
                    <ul className="list-disc list-inside mt-1.5 text-gray-300 ml-3 text-sm">
                      <li>A blank implementation</li>
                      <li>An existing, faulty implementation</li>
                    </ul>
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-sm mt-4">
                If you get stuck on any question, you can hit the "Report" button at the top right of the screen to skip it. This button appears after 30 seconds to ensure good-faith attempts.
              </p>
            </div>
          </div>
        )}

        {/* Time Estimate - Only show if not locked and not completed */}
        {skillCheckMode !== 'locked-pre-test' && skillCheckMode !== 'locked-post-test' && !((skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed && !effectiveRetakeMode) && (
          <div className="bg-blue-900/20 rounded-lg border border-blue-700/50 p-4">
            <div className="flex items-start space-x-2">
              <Clock className="text-blue-400 mt-0.5 flex-shrink-0" size={18} />
              <div>
                <h3 className="text-base font-semibold text-white mb-1">Time Commitment</h3>
                <p className="text-gray-300 text-sm">
                  We expect the Skill Check assessment to take a maximum of <strong className="text-white">60 minutes</strong> to complete. 
                  Please set aside enough time to finish the assessment in one session.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Start Button - Only show if not locked, not completed, and loading is complete */}
        {skillCheckMode !== 'locked-pre-test' && skillCheckMode !== 'locked-post-test' && !((skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed && !effectiveRetakeMode) && !completionStatus.loading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                if (effectiveRetakeMode) {
                  startRetakeWithDefaults();
                  return;
                }
                setIsStarted(true);
              }}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 text-sm"
            >
              {effectiveRetakeMode
                ? 'Start Skill Check (Retake)'
                : completionStatus.has_responses && !completionStatus.completed
                  ? (skillCheckMode === 'pre-test' ? 'Resume Skill Check (Pre-Test)' : 'Resume Skill Check (Post-Test)')
                  : (skillCheckMode === 'pre-test' ? 'Start Skill Check (Pre-Test)' : 'Start Skill Check (Post-Test)')}
            </button>
          </div>
        )}
          </>
        )}
      </div>
      <RetakeQuestionModal
        show={showRetakeModal}
        onClose={() => setShowRetakeModal(false)}
        onNext={(counts) => {
          const sessionId = generateUuidV4();
          setRetakeSessionId(sessionId);
          setRetakeQuestionCounts(counts);
          setIsRetakeMode(true);
          setIsStarted(true);
          setShowRetakeModal(false);
        }}
      />
    </div>
  );
}

