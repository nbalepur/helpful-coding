import { Clock, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import SkillCheckFlow from "../components/SkillCheckFlow";
import { useAuth } from "../utils/auth";

interface SkillCheckPageProps {
  skillCheckMode: 'pre-test' | 'post-test' | 'locked';
}

export default function SkillCheckPage({ skillCheckMode }: SkillCheckPageProps) {
  const { user } = useAuth();
  const userId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  const [isStarted, setIsStarted] = useState(false);
  const [currentQuestionType, setCurrentQuestionType] = useState<string | null>(null);
  const [currentCodeType, setCurrentCodeType] = useState<string | null>(null);
  const [completionStatus, setCompletionStatus] = useState<{
    completed: boolean;
    has_responses: boolean;
    loading: boolean;
    current_question_index: number;
  }>({ completed: false, has_responses: false, loading: true, current_question_index: 0 });

  // Check completion status on mount (for both pre-test and post-test)
  useEffect(() => {
    const checkCompletionStatus = async () => {
      if ((skillCheckMode !== 'pre-test' && skillCheckMode !== 'post-test') || !userId) {
        setCompletionStatus({ completed: false, has_responses: false, loading: false, current_question_index: 0 });
        return;
      }

      try {
        const phase = skillCheckMode === 'pre-test' ? 'pre-test' : 'post-test';
        const response = await fetch(
          `/api/skill-check/completion-status?user_id=${encodeURIComponent(userId)}&phase=${encodeURIComponent(phase)}`
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
  }, [skillCheckMode, userId]);
  
  const getDescription = () => {
    if (!isStarted || !currentQuestionType) {
      return skillCheckMode === 'pre-test' 
        ? "Please complete the skill check before starting the main coding tasks."
        : "Thank you for completing the main coding tasks! Please complete the skill check below to finish the research study.";
    }
    
    if (currentQuestionType === 'coding') {
      return currentCodeType === 'debug'
        ? "Please correct the given code to pass all test cases"
        : "Please implement this function to pass all test cases";
    }
    
    // For frontend, ux, experience, nasa_tli
    return "Please answer the following question";
  };
  
  return (
    <div className="flex-1 flex flex-col items-start justify-start pt-2 px-2 mx-auto w-full h-full">
      {!isStarted && (
        <h1 className="text-3xl font-semibold text-white mb-2">
          {skillCheckMode === 'pre-test' 
            ? 'Pre-Test Skill Check'
            : skillCheckMode === 'post-test'
            ? 'Post-Test Skill Check'
            : 'Skill Check'}
        </h1>
      )}
      {/* Completion Message - Show if skill check is completed */}
      {!isStarted && (skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && !completionStatus.loading && completionStatus.completed && (
        <div className="bg-green-900/20 rounded-lg border border-green-700/50 p-6 mb-4 w-full">
          <p className="text-gray-300 text-lg mb-2">
            Thanks for completing the skill check! {skillCheckMode === 'pre-test' && (
              <>Head over to the{" "}
              <Link href="/" className="text-green-400 hover:text-green-300 underline font-semibold">
                tasks page
              </Link>{" "}
              to start vibe coding 😈</>
            )}
            {skillCheckMode === 'post-test' && (
              <>Thank you for completing the research study!</>
            )}
          </p>
        </div>
      )}
      {/* Mode Message as Subheader - Only show when not started and not completed */}
      {!isStarted && !((skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed) && (
        skillCheckMode === 'locked' ? (
          <div className="bg-red-950/40 rounded-lg border-2 border-red-600/60 p-4 mb-4 w-full mt-4 shadow-lg shadow-red-900/20 flex items-center justify-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-white text-sm">
              The skill check is currently locked and not available at this time. Please check back later.
            </p>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-4">
            {getDescription()}
          </p>
        )
      )}
      <div className="flex flex-col gap-4 w-full flex-1 min-h-0">
        {/* Skill Check Flow - Show when started */}
        {isStarted && skillCheckMode !== 'locked' ? (
          <div className="flex-1 min-h-0 flex flex-col w-full">
            <SkillCheckFlow
              mode={skillCheckMode}
              initialIndex={completionStatus.has_responses && !completionStatus.completed ? completionStatus.current_question_index : 0}
              onComplete={() => {
                alert("Skill check completed! Thank you for your participation.");
                setIsStarted(false);
                setCurrentQuestionType(null);
                setCurrentCodeType(null);
                // Refresh completion status
                const phase = skillCheckMode === 'pre-test' ? 'pre-test' : 'post-test';
                fetch(`/api/skill-check/completion-status?user_id=${encodeURIComponent(userId!)}&phase=${encodeURIComponent(phase)}`)
                  .then(res => res.json())
                  .then(data => {
                    setCompletionStatus({
                      completed: data.completed || false,
                      has_responses: data.has_responses || false,
                      loading: false,
                      current_question_index: data.current_question_index || 0,
                    });
                  })
                  .catch(err => console.error('Error refreshing completion status:', err));
              }}
              onCancel={() => {
                setIsStarted(false);
                setCurrentQuestionType(null);
                setCurrentCodeType(null);
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
            {skillCheckMode !== 'locked' && !((skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed) && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h2 className="text-xl font-semibold text-white mb-3">What You'll Do</h2>
            <div className="text-gray-300 space-y-3 leading-relaxed text-sm">
              <p>
                As part of our research study on AI coding assistants, we are running "skill checks" to measure your general coding abilities and knowledge. This check will be broken down into two phases:
              </p>
              <div className="mt-4 space-y-3">
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center mt-0.5">
                    <span className="text-white text-xs font-semibold">1</span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">Multiple-Choice Questions</h3>
                    <p className="text-gray-300 text-sm">
                      You'll answer a series of multiple-choice questions covering:
                    </p>
                    <ul className="list-disc list-inside mt-1.5 text-gray-300 ml-3 text-sm">
                      <li>
                        {skillCheckMode === 'pre-test' 
                          ? "Your programming experience and background"
                          : "Your perceived effort when doing the tasks"}
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
                    <h3 className="text-base font-semibold text-white mb-1">Coding Tasks</h3>
                    <p className="text-gray-300 text-sm">
                      You'll then complete a series of coding tasks <strong className="text-white"> without AI assistance</strong>, where you will be given a problem statement and a set of test cases to pass. These tasks will test your ability to write code, design algorithms, and debug outputs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Time Estimate - Only show if not locked and not completed */}
        {skillCheckMode !== 'locked' && !((skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed) && (
          <div className="bg-blue-900/20 rounded-lg border border-blue-700/50 p-4">
            <div className="flex items-start space-x-2">
              <Clock className="text-blue-400 mt-0.5 flex-shrink-0" size={18} />
              <div>
                <h3 className="text-base font-semibold text-white mb-1">Time Commitment</h3>
                <p className="text-gray-300 text-sm">
                  The complete Skill Check assessment will take approximately <strong className="text-white">30 minutes</strong> to complete. 
                  Please set aside enough time to finish the assessment in one session.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Start Button - Only show if not locked, not completed, and loading is complete */}
        {skillCheckMode !== 'locked' && !((skillCheckMode === 'pre-test' || skillCheckMode === 'post-test') && completionStatus.completed) && !completionStatus.loading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setIsStarted(true)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 text-sm"
            >
              {completionStatus.has_responses && !completionStatus.completed
                ? (skillCheckMode === 'pre-test' ? 'Resume Skill Check (Pre-Test)' : 'Resume Skill Check (Post-Test)')
                : (skillCheckMode === 'pre-test' ? 'Start Skill Check (Pre-Test)' : 'Start Skill Check (Post-Test)')}
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

