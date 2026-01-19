"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Editor } from "@monaco-editor/react";
import Markdown from "react-markdown";
import { Flag } from "lucide-react";
import { ENV } from "../config/env";
import { useAuth } from "../utils/auth";
import { useSnackbar } from "./SnackbarProvider";
import ReportModal from "./ReportModal";
import LoadingSpinner from "./LoadingSpinner";

interface Question {
  id: string;
  type: string;
  question_type: string;
  question?: string;
  choices?: string[];
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
  choiceD?: string;
  answer?: string;
  task_id?: number;
  python_code?: string;
  js_code?: string;
  test_cases?: string;
  test_cases_py?: string;
  test_cases_js?: string;
  docstring_py?: string;
  docstring_js?: string;
  code_type?: string;
  arguments?: string[]; // Function arguments from code_data_full.jsonl (for retake mode)
  solution?: string; // Solution code from code_data_full.jsonl (for retake mode)
}

interface SkillCheckFlowProps {
  mode: 'pre-test' | 'post-test' | 'retake';
  retakeSessionId?: string | null;
  retakeQuestionCounts?: {
    frontendMcqa: number;
    uxMcqa: number;
    coding: number;
    debugging: number;
  } | null;
  initialIndex?: number;
  onComplete: () => void;
  onCancel: () => void;
  onQuestionChange?: (questionType: string, codeType?: string) => void;
}

export default function SkillCheckFlow({ mode, retakeSessionId = null, retakeQuestionCounts = null, initialIndex = 0, onComplete, onCancel, onQuestionChange }: SkillCheckFlowProps) {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const userId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  
  // Configurable paste character limit (default: 100)
  const PASTE_CHAR_LIMIT = 100;
  // Minimum time away (in ms) before showing navigation warning (default: 5 seconds)
  const NAVIGATION_WARNING_THRESHOLD_MS = 5000;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codingLanguage, setCodingLanguage] = useState<'python' | 'javascript'>('python');
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<{
    allPassed: boolean | null;
    errorMessage: string | null;
    stdout: string;
    stderr: string;
    loading: boolean;
  }>({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: false });
  const editorRef = useRef<any>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const codeQuestionStartedRef = useRef<Set<string>>(new Set()); // Track which code questions have been logged as "started"
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const navigationAwayTimeRef = useRef<number | null>(null); // Track when user navigated away
  const isNavigatedAwayRef = useRef<boolean>(false); // Track if user is currently away
  const [showReportButton, setShowReportButton] = useState(false); // Track if 30 seconds have passed for current question
  const [checkedAnswers, setCheckedAnswers] = useState<Set<string>>(new Set()); // Track which MCQA questions have been checked in retake mode
  const [viewedSolutions, setViewedSolutions] = useState<Set<string>>(new Set()); // Track which coding questions have had solution viewed in retake mode

  useEffect(() => {
    // Clear all state when mode changes (especially important for retake mode)
    // This prevents old questions/answers from briefly showing
    setQuestions([]);
    setAnswers({});
    setOtherText({});
    setTestResults({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: false });
    setCurrentIndex(0);
    setError(null);
    setCheckedAnswers(new Set());
    setViewedSolutions(new Set());
    codeQuestionStartedRef.current.clear();
    
    // For retake mode, force Python only
    if (mode === 'retake') {
      setCodingLanguage('python');
    }
    
    // For retake mode, wait for retakeQuestionCounts to be set before loading
    if (mode === 'retake' && !retakeQuestionCounts) {
      console.log('[SkillCheckFlow] Waiting for retakeQuestionCounts to be set...');
      return;
    }
    
    loadQuestions();
  }, [mode, retakeQuestionCounts]);

  // Update currentIndex when initialIndex changes (for resuming)
  // Skip this for retake mode to avoid race conditions - retake always starts at 0
  useEffect(() => {
    if (mode !== 'retake' && initialIndex >= 0 && questions.length > 0 && initialIndex < questions.length) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, questions.length, mode]);

  // Initialize otherText when question changes and has existing answer
  // Also log "started" state for code questions when they first load
  useEffect(() => {
    if (questions.length > 0 && currentIndex < questions.length) {
      const question = questions[currentIndex];
      const answer = answers[question.id];
      if (question && answer && typeof answer === 'object' && !Array.isArray(answer) && answer.other) {
        setOtherText(prev => ({
          ...prev,
          [question.id]: answer.other
        }));
      }
      // Reset test results when question changes
      setTestResults({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: false });
      
      // Log "started" state for code questions when they first load
      if (question && question.type === 'coding' && userId && !codeQuestionStartedRef.current.has(question.id)) {
        codeQuestionStartedRef.current.add(question.id);
        logCodeResponse({
          question_id: question.id,
          question_type: question.code_type || 'normal',
          py_code: answer?.pythonCode || question.python_code || '',
          js_code: answer?.jsCode || question.js_code || '',
          submitted_language: codingLanguage,
          state: 'started'
        });
      }
    }
  }, [currentIndex, questions, answers, codingLanguage, userId]);

  // Show report button after 30 seconds for each question (except experience and NASA TLI)
  useEffect(() => {
    if (questions.length > 0 && currentIndex < questions.length) {
      const currentQuestion = questions[currentIndex];
      // Don't show report button for experience or NASA TLI questions
      if (currentQuestion && (currentQuestion.type === 'experience' || currentQuestion.type === 'nasa_tli')) {
        setShowReportButton(false);
        return;
      }
      
      // Reset report button visibility when question changes
      setShowReportButton(false);
      
      // Set timer to show report button after 30 seconds
      const timer = setTimeout(() => {
        setShowReportButton(true);
      }, 30000); // 30 seconds in milliseconds
      
      // Cleanup timer on question change or unmount
      return () => {
        clearTimeout(timer);
      };
    }
  }, [currentIndex, questions.length, questions]);

  // Clear test results when switching between Python and JavaScript
  useEffect(() => {
    setTestResults({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: false });
  }, [codingLanguage]);

  // Ensure Python is used in retake mode for coding questions
  useEffect(() => {
    if (mode === 'retake' && questions.length > 0 && currentIndex < questions.length) {
      const currentQuestion = questions[currentIndex];
      if (currentQuestion && currentQuestion.type === 'coding' && codingLanguage !== 'python') {
        setCodingLanguage('python');
      }
    }
  }, [mode, currentIndex, questions, codingLanguage]);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      // Ensure old state is cleared before loading (double-check)
      setQuestions([]);
      setCurrentIndex(0);
      
      // For retake mode, don't pass user_id (random sampling, no assignment)
      // But pass question counts - REQUIRED for retake mode
      let url = `/api/skill-check/questions?mode=${mode}`;
      if (mode === 'retake') {
        if (!retakeQuestionCounts) {
          setError('Retake mode requires question counts to be provided. Please try again.');
          setLoading(false);
          return;
        }
        url += `&frontend_count=${retakeQuestionCounts.frontendMcqa}`;
        url += `&ux_count=${retakeQuestionCounts.uxMcqa}`;
        url += `&coding_count=${retakeQuestionCounts.coding}`;
        url += `&debugging_count=${retakeQuestionCounts.debugging}`;
      } else if (userId) {
        url += `&user_id=${encodeURIComponent(String(userId))}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to load questions');
      }
      const data = await response.json();
      
      // Use all questions (no filtering)
      // For retake mode, ensure all questions are loaded before showing any
      const filteredQuestions: Question[] = data.questions || [];
      
      // Verify we have questions (especially important for retake mode)
      if (mode === 'retake' && filteredQuestions.length === 0) {
        throw new Error('No questions available for retake');
      }
      
      // For retake mode, always start at index 0 (ignore initialIndex to avoid flickering)
      // For other modes, use initialIndex for resuming
      const startIndex = mode === 'retake' ? 0 : ((initialIndex >= 0 && initialIndex < filteredQuestions.length) ? initialIndex : 0);
      
      // Set all questions and state in one batch to prevent flickering
      // Use a single state update cycle to ensure everything updates together
      setQuestions(filteredQuestions);
      setCurrentIndex(startIndex);
      setLoading(false);
      
      // Notify parent of initial question type
      if (onQuestionChange && filteredQuestions.length > 0) {
        const question = filteredQuestions[startIndex];
        onQuestionChange(question.type, question.code_type);
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleAnswer = (questionId: string, answer: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleComplete = useCallback(() => {
    // TODO: Submit answers to backend
    onComplete();
  }, [answers, onComplete]);

  // Helper function to log MCQA response
  const logMCQAResponse = useCallback(async (question: Question, answer: any) => {
    if (!userId || !question) return;
    
    try {
      // Extract answer text and letters
      const answerText: string[] = [];
      const answerLetter: string[] = [];
      
      if (question.type === 'coding') {
        // Don't log coding questions here
        return;
      }
      
      // Normalize choices into a simple array of texts
      let choices: string[] = [];
      let usesLetterKeys = false;
      
      if (Array.isArray(question.choices) && question.choices.length > 0) {
        // Standard case: choices is an array of strings
        choices = question.choices;
      } else {
        // Fallback to choiceA/choiceB/choiceC/choiceD format
        const letterChoices: { key: string; value?: string }[] = [
          { key: 'A', value: question.choiceA },
          { key: 'B', value: question.choiceB },
          { key: 'C', value: question.choiceC },
          { key: 'D', value: question.choiceD },
        ].filter(c => !!c.value);
        choices = letterChoices.map(c => c.value!) as string[];
        usesLetterKeys = letterChoices.length > 0;
      }
      
      // If there are no discrete choices (e.g., complex survey objects), we will still
      // log a raw representation of the answer further below.
      
      // Normalize the raw answer into either selected values or selected keys
      let selectedValues: string[] = [];
      let selectedKeys: string[] = [];
      let selectedIndices: number[] = [];
      
      if (typeof answer === 'string') {
        if (usesLetterKeys) {
          // Single select with letter keys (e.g., "A")
          selectedKeys = [answer];
        } else {
          // Single select with choice text
          selectedValues = [answer];
        }
      } else if (Array.isArray(answer)) {
        // Multi-select: could be array of texts or keys
        if (usesLetterKeys) {
          selectedKeys = answer as string[];
        } else {
          selectedValues = answer as string[];
        }
      } else if (answer && typeof answer === 'object') {
        // Check if answer has index (from radio button with data-choice-index)
        if (typeof (answer as any).index === 'number' && (answer as any).index >= 0) {
          // Use index directly - most reliable method
          selectedIndices.push((answer as any).index);
        } else if (Array.isArray((answer as any).selected)) {
          // Object format with selected array, typically { selected: [...], other: string }
          if (usesLetterKeys) {
            selectedKeys = (answer as any).selected as string[];
          } else {
            selectedValues = (answer as any).selected as string[];
          }
        } else if (typeof (answer as any).value === 'string') {
          // Fallback: single value field
          if (usesLetterKeys) {
            selectedKeys = [(answer as any).value];
          } else {
            selectedValues = [(answer as any).value];
          }
        }
      }
      // Map selected values/keys/indices to answerText and answerLetter when we have choices
      if (choices.length) {
        // Priority 1: Use indices if available (most reliable)
        if (selectedIndices.length > 0) {
          selectedIndices.forEach((idx) => {
            if (idx >= 0 && idx < choices.length) {
              answerText.push(choices[idx]);
              answerLetter.push(String.fromCharCode(65 + idx)); // A, B, C, ...
            }
          });
        } else if (usesLetterKeys) {
          // Priority 2: Keys like "A", "B", "C" -> index + text
          selectedKeys.forEach((key) => {
            const upper = key.toUpperCase();
            const index = upper.charCodeAt(0) - 65; // A=0, B=1, ...
            if (index >= 0 && index < choices.length) {
              answerText.push(choices[index]);
              answerLetter.push(upper);
            }
          });
        } else {
          // Priority 3: Values are the actual choice texts (fallback, may fail due to text matching)
          selectedValues.forEach((value) => {
            const idx = choices.indexOf(value);
            if (idx >= 0) {
              answerText.push(choices[idx]);
              answerLetter.push(String.fromCharCode(65 + idx)); // A, B, C, ...
            }
          });
        }
      }

      // Fallback: for complex answers (e.g., rating matrices) where we cannot map to
      // discrete choices, store a raw JSON representation so nothing is lost.
      if (answerText.length === 0 && answerLetter.length === 0 && answer != null) {
        try {
          answerText.push(JSON.stringify(answer));
        } catch {
          answerText.push(String(answer));
        }
        answerLetter.push('RAW');
      }
      
      // Determine question type for logging
      const questionType = question.type; // 'experience', 'nasa_tli', 'ux', 'frontend'
      
      // Compute gold (correct) answer for MCQA questions (ux, frontend)
      const goldAnswerLetter: string[] = [];
      const goldAnswerText: string[] = [];
      if (questionType === 'ux' || questionType === 'frontend') {
        if (question.answer) {
          // Answer is stored as a string like "B" or array like ["B"]
          let answerStr: string = '';
          if (typeof question.answer === 'string') {
            answerStr = question.answer.trim().toUpperCase();
          } else if (Array.isArray(question.answer) && (question.answer as any[]).length > 0) {
            answerStr = String((question.answer as any[])[0]).trim().toUpperCase();
          }
          
          if (answerStr && answerStr.length > 0) {
            // Handle comma-separated answers like "B,C"
            const answerLetters = answerStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
            goldAnswerLetter.push(...answerLetters);
            
            // Map letters to answer texts using choices
            if (choices.length > 0) {
              answerLetters.forEach(letter => {
                const charCode = letter.charCodeAt(0);
                const aCode = 'A'.charCodeAt(0);
                if (charCode >= aCode && charCode <= aCode + 25) {
                  const idx = charCode - aCode;
                  if (idx >= 0 && idx < choices.length) {
                    goldAnswerText.push(choices[idx]);
                  }
                }
              });
            }
          }
        }
      }
      
      const requestBody: any = {
        user_id: userId,
        question_id: question.id,
        question_type: questionType,
        phase: mode === 'retake' && retakeSessionId ? `retake_${retakeSessionId}` : mode, // Log retake as 'retake_{uuid}'
        answer_text: answerText,
        answer_letter: answerLetter,
      };
      
      // Only include gold answers if we have them (for MCQA questions)
      if (goldAnswerText.length > 0 || goldAnswerLetter.length > 0) {
        requestBody.gold_answer_text = goldAnswerText;
        requestBody.gold_answer_letter = goldAnswerLetter;
      }
      
      await fetch(`${ENV.BACKEND_URL}/api/skill-check/log-mcqa-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      console.error('Failed to log MCQA response:', error);
    }
  }, [userId, mode]);

  // Track navigation away/back events (tab switching, new windows, etc.)
  // This works for ALL question types: MCQA, coding, experience, NASA TLI, etc.
  useEffect(() => {
    if (questions.length === 0 || !userId) return;

    // Helper function to log navigation event to database
    // Works for all question types - MCQA, coding, experience, NASA TLI, etc.
    const logNavigationEvent = async (timeAwayMs: number | null = null, showNotification: boolean = false) => {
      const currentQuestion = questions[currentIndex];
      if (!currentQuestion) return;
      
      try {
        await fetch(`${ENV.BACKEND_URL}/api/skill-check/log-navigation-event`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        body: JSON.stringify({
          user_id: userId,
          question_id: currentQuestion.id || null, // Works for all question types
          test_type: mode === 'retake' && retakeSessionId ? `retake_${retakeSessionId}` : mode, // Log retake as 'retake_{uuid}'
          time_away_ms: timeAwayMs,
        }),
        });
        
        // Show snackbar notification when navigation is detected and exceeds threshold
        // Don't show in retake mode
        if (showNotification && timeAwayMs !== null && timeAwayMs >= NAVIGATION_WARNING_THRESHOLD_MS && mode !== 'retake') {
          showSnackbar('We noticed that you navigated away from the page. Do not leave the page to look up answers.', 5000);
        }
      } catch (error) {
        console.error('Failed to log navigation event:', error);
      }
    };

    // Track visibility changes (tab switching, new windows, etc.)
    // Only tracks actual tab/window switches, NOT iframe clicks or other in-page interactions
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User navigated away (tab hidden, new window opened, window minimized, etc.)
        if (!isNavigatedAwayRef.current) {
          isNavigatedAwayRef.current = true;
          navigationAwayTimeRef.current = Date.now();
          logNavigationEvent(null); // Log when they leave (no duration yet)
        }
      } else {
        // User came back
        if (isNavigatedAwayRef.current && navigationAwayTimeRef.current) {
          const durationAway = Date.now() - navigationAwayTimeRef.current;
          isNavigatedAwayRef.current = false;
          logNavigationEvent(durationAway, true); // Log when they return with duration and show notification
          navigationAwayTimeRef.current = null;
        }
      }
    };

    // Track page unload (user closing tab/window, navigating to different page)
    const handleBeforeUnload = () => {
      if (isNavigatedAwayRef.current && navigationAwayTimeRef.current) {
        const durationAway = Date.now() - navigationAwayTimeRef.current;
        // Use sendBeacon for more reliable logging during page unload
        const currentQuestion = questions[currentIndex];
        const data = JSON.stringify({
          user_id: userId,
          question_id: currentQuestion?.id || null,
          test_type: mode,
          time_away_ms: durationAway,
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            `${ENV.BACKEND_URL}/api/skill-check/log-navigation-event`,
            new Blob([data], { type: 'application/json' })
          );
        } else {
          logNavigationEvent(durationAway);
        }
      } else {
        logNavigationEvent(null);
      }
    };

    // Only track visibilitychange (tab/window switches) and beforeunload (page navigation)
    // Removed blur/focus listeners as they fire on iframe clicks and other in-page interactions
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [questions, currentIndex, userId, mode, showSnackbar, NAVIGATION_WARNING_THRESHOLD_MS]);

  const handleCheckAnswer = useCallback(() => {
    // Mark current MCQA question as checked
    if (currentIndex < questions.length) {
      const currentQuestion = questions[currentIndex];
      if (currentQuestion && currentQuestion.question_type === 'mcqa' && mode === 'retake') {
        setCheckedAnswers(prev => new Set(prev).add(currentQuestion.id));
        // iframeContent will regenerate automatically due to checkedAnswers dependency
      }
    }
  }, [currentIndex, questions, mode]);

  const handleNext = useCallback(() => {
    // Log current question's answer before moving to next
    if (currentIndex < questions.length) {
      const currentQuestion = questions[currentIndex];
      const currentAnswer = answers[currentQuestion.id];
      if (currentQuestion && currentAnswer !== undefined && currentQuestion.type !== 'coding') {
        logMCQAResponse(currentQuestion, currentAnswer);
      }
    }
    
    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      // Reset test results when moving to next question
      setTestResults({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: false });
      // Scroll to top using ref
      if (topRef.current) {
        topRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
      // Notify parent of question type change
      if (onQuestionChange && questions[nextIndex]) {
        const question = questions[nextIndex];
        onQuestionChange(question.type, question.code_type);
      }
    } else {
      // All questions answered
      handleComplete();
    }
  }, [currentIndex, questions, answers, onQuestionChange, handleComplete, logMCQAResponse]);

  // Helper function to log code response
  const logCodeResponse = useCallback(async (data: {
    question_id: string;
    question_type: string;
    py_code?: string;
    js_code?: string;
    submitted_language: string;
    state: 'started' | 'failed' | 'passed';
  }) => {
    if (!userId) return;
    
    try {
      await fetch(`${ENV.BACKEND_URL}/api/skill-check/log-code-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          question_id: data.question_id,
          question_type: data.question_type,
          phase: mode === 'retake' && retakeSessionId ? `retake_${retakeSessionId}` : mode, // Log retake as 'retake_{uuid}'
          py_code: data.py_code || '',
          js_code: data.js_code || '',
          submitted_language: data.submitted_language,
          state: data.state,
        }),
      });
    } catch (error) {
      console.error('Failed to log code response:', error);
    }
  }, [userId, mode, retakeSessionId]);

  const handleViewSolution = useCallback(async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion || currentQuestion.type !== 'coding' || mode !== 'retake') {
      return;
    }

    let solution = currentQuestion.solution || '';
    if (!solution) {
      console.warn('No solution available for this question');
      return;
    }

    // Normalize newlines: replace multiple consecutive newlines (2 or more) with a single newline
    // First normalize line endings, then collapse multiple newlines, then trim trailing newlines
    solution = solution.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{2,}/g, '\n').replace(/\n+$/, '');

    // Mark solution as viewed
    setViewedSolutions(prev => new Set(prev).add(currentQuestion.id));

    // Update the answer with the solution
    const currentAnswer = answers[currentQuestion.id] || {};
    handleAnswer(currentQuestion.id, {
      ...currentAnswer,
      pythonCode: codingLanguage === 'python' ? solution : (currentAnswer.pythonCode || ''),
      jsCode: codingLanguage === 'javascript' ? solution : (currentAnswer.jsCode || ''),
    });

    // Log to database
    if (userId) {
      try {
        await fetch(`${ENV.BACKEND_URL}/api/skill-check/log-code-response`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            question_id: currentQuestion.id,
            question_type: currentQuestion.code_type || 'normal',
            phase: mode === 'retake' && retakeSessionId ? `retake_${retakeSessionId}` : mode,
            py_code: codingLanguage === 'python' ? solution : '',
            js_code: codingLanguage === 'javascript' ? solution : '',
            submitted_language: codingLanguage,
            state: 'view_solution',
          }),
        });
      } catch (error) {
        console.error('Failed to log view solution:', error);
      }
    }

    // Update the editor content via iframe message
    // Use a retry mechanism to ensure the iframe is ready
    const sendSolutionToEditor = (retries = 5) => {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage({
            type: 'setCode',
            code: solution,
            language: codingLanguage,
          }, '*');
        } catch (error) {
          console.error('Failed to send solution to editor:', error);
          if (retries > 0) {
            setTimeout(() => sendSolutionToEditor(retries - 1), 100);
          }
        }
      } else if (retries > 0) {
        setTimeout(() => sendSolutionToEditor(retries - 1), 100);
      }
    };
    
    // Send immediately, and retry if needed
    sendSolutionToEditor();
  }, [currentIndex, questions, answers, mode, retakeSessionId, userId, codingLanguage]);

  const runTestCases = useCallback(async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion || currentQuestion.type !== 'coding') {
      return;
    }

    const currentAnswer = answers[currentQuestion.id] || {};
    const userCode = codingLanguage === 'python' 
      ? (currentAnswer.pythonCode || currentQuestion.python_code || '')
      : (currentAnswer.jsCode || currentQuestion.js_code || '');
    
    const testCases = codingLanguage === 'python'
      ? (currentQuestion.test_cases_py || '')
      : (currentQuestion.test_cases_js || '');

    if (!userCode || !testCases) {
      setTestResults({
        allPassed: false,
        errorMessage: 'No code or test cases available',
        stdout: '',
        stderr: '',
        loading: false
      });
      return;
    }

    setTestResults({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: true });

    try {
      const response = await fetch(`${ENV.BACKEND_URL}/api/skill-check/run-tests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: userCode,
          test_cases: testCases,
          language: codingLanguage
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to run test cases');
      }

      const data = await response.json();
      const allPassed = data.all_passed || false;
      
      setTestResults({
        allPassed: allPassed,
        errorMessage: data.error_message || null,
        stdout: data.stdout || '',
        stderr: data.stderr || '',
        loading: false
      });
      
      // Log code response with test results
      logCodeResponse({
        question_id: currentQuestion.id,
        question_type: currentQuestion.code_type || 'normal',
        py_code: currentAnswer.pythonCode || currentQuestion.python_code || '',
        js_code: currentAnswer.jsCode || currentQuestion.js_code || '',
        submitted_language: codingLanguage,
        state: allPassed ? 'passed' : 'failed'
      });
    } catch (error: any) {
      setTestResults({
        allPassed: false,
        errorMessage: error.message || 'Failed to execute test cases',
        stdout: '',
        stderr: error.message || 'Failed to execute test cases',
        loading: false
      });
      
      // Log failed state
      logCodeResponse({
        question_id: currentQuestion.id,
        question_type: currentQuestion.code_type || 'normal',
        py_code: currentAnswer.pythonCode || currentQuestion.python_code || '',
        js_code: currentAnswer.jsCode || currentQuestion.js_code || '',
        submitted_language: codingLanguage,
        state: 'failed'
      });
    }
  }, [currentIndex, questions, answers, codingLanguage, logCodeResponse]);

  // Handle report submission
  const handleReportSubmit = useCallback(async (reportType: string, rationale: string) => {
    if (!userId || questions.length === 0 || currentIndex >= questions.length) {
      return;
    }

    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) {
      return;
    }

    setIsSubmittingReport(true);
    try {
      const response = await fetch(`${ENV.BACKEND_URL}/api/skill-check/report-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          question_id: currentQuestion.id,
          question_type: currentQuestion.type,
          phase: mode === 'retake' && retakeSessionId ? `retake_${retakeSessionId}` : mode, // Log retake as 'retake_{uuid}'
          code_type: currentQuestion.code_type || 'normal',  // For coding questions
          report_type: reportType,
          rationale: rationale,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit report');
      }

      // Close modal and move to next question
      setShowReportModal(false);
      
      // Move to next question or complete if it's the last question
      if (currentIndex < questions.length - 1) {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        // Reset test results when moving to next question
        setTestResults({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: false });
        // Scroll to top using ref
        setTimeout(() => {
          if (topRef.current) {
            topRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
          }
        }, 0);
        // Notify parent of question type change if callback exists
        if (onQuestionChange && questions[nextIndex]) {
          onQuestionChange(questions[nextIndex].type, questions[nextIndex].code_type);
        }
      } else {
        // Last question - complete the skill check
        handleComplete();
      }
    } catch (error) {
      console.error('Failed to submit report:', error);
      alert('Failed to submit report. Please try again! If the problem persists, please contact <a href="mailto:nbalepur@umd.edu">us</a>!');
    } finally {
      setIsSubmittingReport(false);
    }
  }, [userId, questions, currentIndex, mode, onQuestionChange, handleComplete]);

  const handleEditorChange = (value: string | undefined) => {
    const currentQuestion = questions[currentIndex];
    if (currentQuestion && currentQuestion.type === 'coding') {
      const currentAnswer = answers[currentQuestion.id] || {};
      handleAnswer(currentQuestion.id, {
        ...currentAnswer,
        jsCode: codingLanguage === 'javascript' ? (value || '') : (currentAnswer.jsCode || ''),
        pythonCode: codingLanguage === 'python' ? (value || '') : (currentAnswer.pythonCode || ''),
      });
    }
  };

  // Generate HTML content for iframe (for non-coding questions)
  // This must be declared before conditional returns to follow Rules of Hooks
  // Memoize based only on question, not answer, to prevent re-renders when clicking
  const iframeContent = useMemo(() => {
    if (questions.length === 0 || currentIndex >= questions.length) {
      return '';
    }
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) {
      return '';
    }
    
    // Handle coding questions
    if (currentQuestion.type === 'coding') {
      const initialAnswer = answers[currentQuestion.id] || {};
      const initialPythonCode = initialAnswer.pythonCode !== undefined ? initialAnswer.pythonCode : (currentQuestion.python_code || '');
      const initialJsCode = initialAnswer.jsCode !== undefined ? initialAnswer.jsCode : (currentQuestion.js_code || '');
      const initialLanguage = codingLanguage;
      const backendUrl = ENV.BACKEND_URL;
      // Store blank code for function signature parsing (use question's blank code, not user's code)
      const blankPythonCode = currentQuestion.python_code || '';
      const blankJsCode = currentQuestion.js_code || '';
      const taskId = currentQuestion.task_id || '';
      const docstringPy = currentQuestion.docstring_py || '';
      const docstringJs = currentQuestion.docstring_js || '';
      const questionArguments = currentQuestion.arguments || null; // Arguments from JSONL file (retake mode)
      const isRetakeMode = mode === 'retake';
      const isSolutionViewed = viewedSolutions.has(currentQuestion.id);
      
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1a1f2e;
      color: #e5e7eb;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 0;
      line-height: 1.6;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Transparent scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      background: transparent;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    /* Firefox scrollbar */
    * {
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
    .coding-container {
      background: #1a1f2e;
      border: none;
      border-radius: 0;
      padding: 0;
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .content-wrapper {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .docstring-container {
      background: #1e1e1e;
      border: 1px solid #374151;
      border-radius: 0;
      margin-bottom: 0;
      font-size: 13px;
      line-height: 1.7;
      color: #ce9178;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
    }
    .docstring-content-wrapper {
      padding: 12px 16px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
      pointer-events: auto;
    }
    .docstring-resize-handle {
      height: 8px;
      background: transparent;
      cursor: row-resize;
      flex-shrink: 0;
      position: relative;
      transition: background 0.2s;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      margin: 0;
      width: 100%;
    }
    .docstring-resize-handle:hover {
      background: rgba(55, 65, 81, 0.3);
    }
    .docstring-resize-handle::before {
      content: '';
      width: 100%;
      height: 2px;
      background-color: #374151;
      transition: background-color 0.2s;
      opacity: 1;
    }
    .docstring-resize-handle:hover::before {
      background-color: #4b5563;
      height: 3px;
    }
    .docstring-container strong {
      font-weight: bold;
      color: #ce9178;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    }
    .docstring-container code {
      background: rgba(17, 24, 39, 0.6);
      padding: 2px 6px;
      border-radius: 0;
      font-size: 0.95em;
      font-family: 'Monaco', 'Menlo', monospace;
      color: #ce9178;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    }
    .editor-wrapper {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: row;
      gap: 0;
      align-items: stretch;
    }
    .editor-container {
      flex: 0 0 75%;
      min-width: 200px;
      border: 1px solid #374151;
      border-radius: 0;
      overflow: hidden;
      position: relative;
      display: block;
      height: 100%;
      align-self: stretch;
    }
    .test-results-panel {
      flex: 0 0 25%;
      min-width: 200px;
      border: 1px solid #374151;
      border-radius: 0;
      background: #1f2937;
      padding: 12px;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      gap: 0;
      height: 100%;
      align-self: stretch;
    }
    .resize-handle {
      width: 4px;
      background: transparent;
      cursor: col-resize;
      flex-shrink: 0;
      position: relative;
      transition: background 0.2s;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      align-self: stretch;
    }
    .resize-handle:hover {
      background: rgba(55, 65, 81, 0.5);
    }
    .resize-handle::before {
      content: '';
      width: 3px;
      height: 100%;
      background-color: #374151;
      transition: background-color 0.2s;
      opacity: 1;
    }
    .resize-handle:hover::before {
      background-color: #4b5563;
    }
    .test-cases-section {
      flex: 1;
      min-height: 0;
      padding-top: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .test-results-header {
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      color: #e5e7eb;
      margin-bottom: 8px;
    }
    .test-output-box {
      flex: 1;
      min-height: 0;
      background: #000;
      border: 1px solid #374151;
      border-radius: 0;
      padding: 8px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      color: #e5e7eb;
      overflow-y: auto;
      line-height: 1.4;
    }
    .test-output-box.empty {
      color: #6b7280;
    }
    .test-output-box .stdout {
      color: #ffffff !important;
      white-space: pre-wrap;
      word-break: break-word;
      display: block;
    }
    .test-output-box .stderr {
      color: #ef4444 !important;
      white-space: pre-wrap;
      word-break: break-word;
      display: block;
    }
    .test-output-box .success-message {
      color: #10b981 !important;
      font-weight: 600;
      display: block;
    }
    .test-output-box .error-message {
      color: #ef4444 !important;
      font-weight: 600;
      display: block;
    }
    .test-output-box .separator {
      height: 1px;
      background: rgba(255, 255, 255, 0.2);
      margin: 8px 0;
      border: none;
      width: 100%;
      display: block;
    }
    .test-your-code-section {
      flex-shrink: 0;
      padding-bottom: 12px;
      display: flex;
      flex-direction: column;
      overflow: visible;
    }
    .test-your-code-header {
      font-weight: 600;
      font-size: 14px;
      color: #e5e7eb;
      margin-bottom: 8px;
    }
    .test-inputs-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 8px;
      flex-shrink: 0;
    }
    .test-input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .test-input-label {
      font-size: 11px;
      color: #9ca3af;
      font-weight: 500;
    }
    .test-input-field {
      background: #111827;
      border: 1px solid #374151;
      border-radius: 4px;
      padding: 6px 8px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 11px;
      color: #e5e7eb;
      width: 100%;
      box-sizing: border-box;
    }
    .test-input-field:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .test-run-button {
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 6px 24px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s ease-in-out;
      width: 100%;
      margin-top: 8px;
    }
    .test-run-button:hover:not(:disabled) {
      background: #1d4ed8;
    }
    .test-run-button:disabled {
      background: #374151;
      color: #6b7280;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="coding-container">
    <div class="content-wrapper">
      <div class="docstring-container" id="docstring-container">
        <div class="docstring-content-wrapper" id="docstring-content-wrapper"></div>
      </div>
      <div class="docstring-resize-handle" id="docstring-resize-handle"></div>
      <div class="editor-wrapper">
      <div class="editor-container" id="editor-container"></div>
        <div class="resize-handle" id="resize-handle"></div>
        <div class="test-results-panel" id="test-results-panel">
          <div class="test-your-code-section" id="test-your-code-section" ${isSolutionViewed ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
            <div class="test-your-code-header">Custom Inputs</div>
            <div class="test-inputs-container" id="test-inputs-container"></div>
            <button class="test-run-button" id="test-run-button" ${isSolutionViewed ? 'disabled' : ''}>Run</button>
          </div>
          <div class="test-cases-section" id="test-cases-section">
            <div class="test-results-header" id="test-results-header">Output</div>
            <div class="test-output-box empty" id="test-output-box"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function() {
      const questionId = '${currentQuestion.id}';
      let currentLanguage = '${initialLanguage}';
      let editor = null;
      const pasteCharLimit = ${PASTE_CHAR_LIMIT};
      const pythonCode = ${JSON.stringify(initialPythonCode)};
      const jsCode = ${JSON.stringify(initialJsCode)};
      // Blank code from question (for function signature parsing)
      const blankPythonCode = ${JSON.stringify(blankPythonCode)};
      const blankJsCode = ${JSON.stringify(blankJsCode)};
      const taskId = '${taskId}';
      const docstringPy = ${JSON.stringify(docstringPy)};
      const docstringJs = ${JSON.stringify(docstringJs)};
      const questionArguments = ${JSON.stringify(questionArguments)};
      const isRetakeMode = ${isRetakeMode};
      const isSolutionViewed = ${isSolutionViewed};
      
      // Track docstring height for resizing
      let minDocstringHeight = 100; // Will be calculated based on one line
      let maxDocstringHeight = 500; // Will be calculated based on full content
      
      // Function to calculate min and max heights for docstring
      function calculateDocstringHeights() {
        const docstringContainer = document.getElementById('docstring-container');
        const contentWrapper = document.getElementById('docstring-content-wrapper');
        if (!docstringContainer || !contentWrapper) return;
        
        // Temporarily remove height constraint to measure natural height
        const originalHeight = docstringContainer.style.height;
        const originalOverflow = docstringContainer.style.overflow;
        docstringContainer.style.height = 'auto';
        docstringContainer.style.overflow = 'visible';
        
        // Measure full content height (max height) - this is the natural height needed
        const fullHeight = docstringContainer.scrollHeight;
        maxDocstringHeight = fullHeight;
        
        // Measure minimum height based on font size
        // Get computed styles from content wrapper
        const computedStyle = window.getComputedStyle(contentWrapper);
        const fontSize = parseFloat(computedStyle.fontSize) || 13;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 12;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 12;
        
        // Minimum height = font size + padding (one line worth of space)
        minDocstringHeight = Math.ceil(fontSize + paddingTop + paddingBottom);
        minDocstringHeight = Math.max(minDocstringHeight, 30); // Ensure reasonable minimum
        
        // Restore original styles
        docstringContainer.style.height = originalHeight;
        docstringContainer.style.overflow = originalOverflow || 'hidden';
      }
      
      // Function to update docstring display based on current language
      function updateDocstring() {
        const docstringContainer = document.getElementById('docstring-container');
        const contentWrapper = document.getElementById('docstring-content-wrapper');
        const resizeHandle = document.getElementById('docstring-resize-handle');
        if (!docstringContainer || !contentWrapper) return;
        
        // Use JavaScript docstring when language is 'javascript', otherwise use Python docstring
        const docstring = currentLanguage === 'javascript' ? docstringJs : docstringPy;
        if (docstring && docstring.trim()) {
          // Escape HTML and preserve line breaks
          const escaped = docstring
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\\n/g, '<br>');
          // Convert single backticks to code tags
          const withCode = escaped.replace(/\`([^\`\\n]+?)\`/g, '<code>$1</code>');
          contentWrapper.innerHTML = '<span style="font-weight: 800;">Task:</span> ' + withCode;
          
          docstringContainer.style.display = 'flex';
          if (resizeHandle) {
            resizeHandle.style.display = 'flex';
          }
          
          // Calculate min and max heights after content is set
          setTimeout(function() {
            calculateDocstringHeights();
            
            // Use maximum height to show entire task description
            let initialHeight = Math.max(minDocstringHeight, maxDocstringHeight);
            docstringContainer.style.height = initialHeight + 'px';
          }, 10);
        } else {
          docstringContainer.style.display = 'none';
          if (resizeHandle) {
            resizeHandle.style.display = 'none';
          }
        }
      }
      
      // Initialize resize functionality
      function initDocstringResize() {
        const docstringContainer = document.getElementById('docstring-container');
        const resizeHandle = document.getElementById('docstring-resize-handle');
        if (!docstringContainer || !resizeHandle) return;
        
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        
        resizeHandle.addEventListener('mousedown', function(e) {
          isResizing = true;
          startY = e.clientY;
          startHeight = parseInt(window.getComputedStyle(docstringContainer).height, 10);
          document.addEventListener('mousemove', handleResize);
          document.addEventListener('mouseup', stopResize);
          e.preventDefault();
        });
        
        function handleResize(e) {
          if (!isResizing) return;
          const diff = e.clientY - startY;
          const newHeight = Math.max(minDocstringHeight, Math.min(startHeight + diff, maxDocstringHeight));
          docstringContainer.style.height = newHeight + 'px';
        }
        
        function stopResize() {
          isResizing = false;
          document.removeEventListener('mousemove', handleResize);
          document.removeEventListener('mouseup', stopResize);
        }
      }
      
      // Initialize docstring display
      updateDocstring();
      // Initialize resize functionality after a delay to ensure DOM is ready and heights are calculated
      setTimeout(initDocstringResize, 150);
      
      // Map of task_id to function parameters
      // Format: { task_id: [param1, param2, ...] }
      const FUNCTION_PARAMS_MAP = {
        'number_1': ['a'],
        'number_2': ['value'],
        'paren_1': ['paren_string'],
        'paren_2': ['paren_string'],
        'prefix_1': ['n'],
        'prefix_2': ['S'],
        'string_shift_1': ['x', 'shift'],
        'string_shift_2': ['message'],
      };
      
      function sendCodeUpdate(language, code) {
        window.parent.postMessage({
          type: 'skillCheckCodeUpdate',
          questionId: questionId,
          language: language,
          code: code
        }, '*');
      }
      
      function sendLanguageChange(language) {
        window.parent.postMessage({
          type: 'skillCheckLanguageChange',
          questionId: questionId,
          language: language
        }, '*');
      }
      
      // Load Monaco Editor
      require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
      require(['vs/editor/editor.main'], function() {
        const container = document.getElementById('editor-container');
        if (!container) {
          console.error('Editor container not found');
          return;
        }
        
        // Use window variables if available (preserves edits), otherwise use initial values
        const initialCode = currentLanguage === 'python' 
          ? (window.pythonCode !== undefined ? window.pythonCode : pythonCode)
          : (window.jsCode !== undefined ? window.jsCode : jsCode);
        
        // Ensure container has dimensions before initializing Monaco
        function initEditor() {
          if (!container) {
            console.error('Editor container not found');
            return;
          }
          
          // Force container to have minimum dimensions
          if (container.offsetHeight === 0 || container.offsetWidth === 0) {
            container.style.height = '300px';
            container.style.width = '100%';
          }
          
          // Wait a bit more if still no dimensions
          if (container.offsetHeight === 0) {
            setTimeout(initEditor, 100);
            return;
          }
        
        editor = monaco.editor.create(container, {
          value: initialCode,
          language: currentLanguage === 'python' ? 'python' : 'javascript',
          theme: 'vs-dark',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: 'on',
          wordWrap: 'on',
          automaticLayout: true,
            readOnly: isSolutionViewed,
            cursorBlinking: 'blink',
            cursorSmoothCaretAnimation: 'off',
            smoothScrolling: true,
            mouseWheelZoom: true,
            mouseWheelScrollSensitivity: 0.7,
            contextmenu: true,
            selectOnLineNumbers: true,
            roundedSelection: false,
            renderLineHighlight: 'line',
            folding: true,
            foldingStrategy: 'indentation',
            showFoldingControls: 'always',
            bracketPairColorization: { enabled: true },
            guides: { indentation: true },
            occurrencesHighlight: 'off',
            padding: { top: 0, bottom: 100 },
            quickSuggestions: {
              other: true,
              comments: true,
              strings: true
            },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            tabCompletion: 'on',
            wordBasedSuggestions: 'allDocuments',
        });
        
        // Intercept paste events to log what the user is about to paste
        // Monaco uses a hidden textarea for input, so we intercept at multiple levels
        const editorContainer = editor.getContainerDomNode();
        
        // Store reference to editor for focus checking
        window.monacoEditorRef = editor;
        
        // Process any pending setCode message now that editor is ready
        if (pendingSetCodeMessage) {
          processSetCodeMessage(pendingSetCodeMessage);
          pendingSetCodeMessage = null;
        }
        
        // Function to check if paste is happening in the editor
        function isPasteInEditor(e) {
          const target = e.target;
          const activeElement = document.activeElement;
          
          // Check if target or active element is within editor container
          if (editorContainer) {
            if (editorContainer.contains(target) || 
                editorContainer === target ||
                (activeElement && editorContainer.contains(activeElement))) {
              return true;
            }
          }
          return false;
        }
        
        // Function to handle paste and log the content, blocking if over character limit
        function logPaste(e) {
          if (isPasteInEditor(e)) {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (clipboardData) {
              const pastedText = clipboardData.getData('text/plain');
              
              // Block paste if content is over character limit
              if (pastedText && pastedText.length > pasteCharLimit) {
                e.preventDefault();
                e.stopPropagation();
                // Notify parent to show snackbar
                window.parent.postMessage({
                  type: 'skillCheckPasteBlocked',
                  pastedLength: pastedText.length,
                  limit: pasteCharLimit
                }, '*');
                return false;
              }
            }
          }
        }
        
        // Attach to window, document, and editor container in capture phase
        window.addEventListener('paste', logPaste, true);
        document.addEventListener('paste', logPaste, true);
        
        if (editorContainer) {
          editorContainer.addEventListener('paste', logPaste, true);
        }
        
        // Monaco uses a hidden textarea - find it and attach listener
        // Try multiple times as Monaco might create it asynchronously
        function attachToMonacoTextarea() {
          if (editorContainer) {
            const textarea = editorContainer.querySelector('textarea');
            if (textarea) {
              textarea.addEventListener('paste', function(e) {
                const clipboardData = e.clipboardData || window.clipboardData;
                if (clipboardData) {
                  const pastedText = clipboardData.getData('text/plain');
                  
                  // Block paste if content is over character limit
                  if (pastedText && pastedText.length > pasteCharLimit) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Notify parent to show snackbar
                    window.parent.postMessage({
                      type: 'skillCheckPasteBlocked',
                      pastedLength: pastedText.length,
                      limit: pasteCharLimit
                    }, '*');
                    return false;
                  }
                }
              }, true);
            } else {
              // Retry if textarea not found yet (up to 10 times)
              if (!window.monacoTextareaRetries) window.monacoTextareaRetries = 0;
              if (window.monacoTextareaRetries < 10) {
                window.monacoTextareaRetries++;
                setTimeout(attachToMonacoTextarea, 100);
              }
            }
          }
        }
        attachToMonacoTextarea();
        
        editor.onDidChangeModelContent(function() {
          const code = editor.getValue();
            // Update window variable to keep it in sync with editor
            if (currentLanguage === 'python') {
              window.pythonCode = code;
            } else {
              window.jsCode = code;
            }
          sendCodeUpdate(currentLanguage, code);
          
          // Update input fields when code changes (debounced)
          if (window.inputUpdateTimeout) {
            clearTimeout(window.inputUpdateTimeout);
          }
          window.inputUpdateTimeout = setTimeout(() => {
            updateInputFields();
          }, 500);
        });
        
        // Store editor reference globally for input field updates
        window.codeEditor = editor;
        }
        
        // Use requestAnimationFrame to ensure DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initEditor, 100);
          });
        } else {
          setTimeout(initEditor, 100);
        }
      });
      
      // Listen for language changes from parent
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'skillCheckLanguageChange') {
          const lang = event.data.language;
          if (lang === currentLanguage) return;
          
          // Clear test results pane when language changes
          const outputBox = document.getElementById('test-output-box');
          if (outputBox) {
            outputBox.innerHTML = '';
            outputBox.classList.add('empty');
          }
          
          // Note: Custom input results are now in the unified output box
          // They will be preserved when language changes, only test case results are cleared
          
          // Save current code
          if (editor) {
            if (currentLanguage === 'python') {
              window.pythonCode = editor.getValue();
            } else {
              window.jsCode = editor.getValue();
            }
          }
          
          currentLanguage = lang;
          
          // Update docstring display when language changes
          updateDocstring();
          
          // Update editor
          if (editor) {
            // Always use window variable if it exists (represents current state), otherwise use initial value
            let newCode;
            if (lang === 'python') {
              newCode = (window.pythonCode !== undefined) ? window.pythonCode : pythonCode;
            } else {
              newCode = (window.jsCode !== undefined) ? window.jsCode : jsCode;
            }
            editor.setValue(newCode);
            monaco.editor.setModelLanguage(editor.getModel(), lang === 'python' ? 'python' : 'javascript');
            sendCodeUpdate(lang, newCode);
          }
          
          sendLanguageChange(lang);
          
          // Update input fields when language changes (clear values)
          updateInputFields(true);
        }
      });
      
      // Store code in window for persistence
      // Always initialize from answers (source of truth) when iframe is created/regenerated
      // The window variables are used for language switching within the same iframe instance
      window.pythonCode = pythonCode || '';
      window.jsCode = jsCode || '';
      
      // Function to parse function signature and extract parameters
      // Define functions early so they're available when called
      function parseFunctionSignature(code, language, useBlankCode = false) {
        // If useBlankCode is true, use the blank code from the question instead of user's code
        if (useBlankCode) {
          if (language === 'python') {
            code = blankPythonCode || code;
          } else {
            code = blankJsCode || code;
          }
        }
        
        const params = [];
        let functionName = '';
        
        if (language === 'python') {
          // Match: def function_name(param1, param2, param3=default):
          const pythonRegex = /def\s+(\w+)\s*\(([^)]*)\)/;
          const match = code.match(pythonRegex);
          if (match) {
            functionName = match[1];
            const paramsStr = match[2];
            // Parse parameters, handling defaults
            paramsStr.split(',').forEach(param => {
              param = param.trim();
              if (param) {
                // Remove default values and type hints
                const paramName = param.split('=')[0].split(':')[0].trim();
                if (paramName && paramName !== 'self') {
                  params.push(paramName);
                }
              }
            });
          }
        } else { // javascript
          // Match: function name(param1, param2) or const name = function(param1, param2) or const name = (param1, param2) =>
          const jsRegexes = [
            /function\s+(\w+)\s*\(([^)]*)\)/,
            /const\s+(\w+)\s*=\s*function\s*\(([^)]*)\)/,
            /const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>/
          ];
          
          for (const regex of jsRegexes) {
            const match = code.match(regex);
            if (match) {
              functionName = match[1];
              const paramsStr = match[2];
              // Parse parameters
              paramsStr.split(',').forEach(param => {
                param = param.trim();
                if (param) {
                  // Remove default values and type hints
                  const paramName = param.split('=')[0].split(':')[0].trim();
                  if (paramName) {
                    params.push(paramName);
                  }
                }
              });
              break;
            }
          }
        }
        
        return { functionName, params };
      }
      
      // Function to create input fields based on function signature
      function updateInputFields(clearValues = false) {
        const container = document.getElementById('test-inputs-container');
        if (!container) return;
        
        // Save current input values before clearing (unless we're explicitly clearing)
        const savedValues = {};
        if (!clearValues) {
          const existingInputs = container.querySelectorAll('input.test-input-field');
          existingInputs.forEach(input => {
            const param = input.getAttribute('data-param');
            if (param && input.value) {
              savedValues[param] = input.value;
            }
          });
        }
        
        // First, try to get parameters from question arguments (retake mode)
        let params = [];
        if (isRetakeMode && questionArguments && Array.isArray(questionArguments) && questionArguments.length > 0) {
          params = questionArguments;
        } else if (taskId && FUNCTION_PARAMS_MAP[taskId]) {
          params = FUNCTION_PARAMS_MAP[taskId];
        } else {
          // Fallback: try to parse from blank code
          const parsed = parseFunctionSignature('', currentLanguage, true);
          params = parsed.params;
        }
        
        container.innerHTML = '';
        
        if (params.length === 0) {
          // No parameters found
          const noParamsMsg = document.createElement('div');
          noParamsMsg.style.fontSize = '11px';
          noParamsMsg.style.color = '#6b7280';
          noParamsMsg.style.fontStyle = 'italic';
          noParamsMsg.textContent = 'No function parameters detected';
          container.appendChild(noParamsMsg);
          return;
        }
        
        // Create input field for each parameter
        params.forEach(param => {
          const group = document.createElement('div');
          group.className = 'test-input-group';
          
          const label = document.createElement('label');
          label.className = 'test-input-label';
          label.textContent = param + ':';
          label.setAttribute('for', 'input-' + param);
          
          const input = document.createElement('input');
          input.type = 'text';
          input.id = 'input-' + param;
          input.className = 'test-input-field';
          input.placeholder = 'Enter value';
          input.setAttribute('data-param', param);
          
          // Restore saved value if it exists and we're not clearing
          if (!clearValues && savedValues[param]) {
            input.value = savedValues[param];
          }
          
          group.appendChild(label);
          group.appendChild(input);
          container.appendChild(group);
        });
      }
      
      // Function to run code with custom inputs
      async function runCodeWithInputs() {
        const runButton = document.getElementById('test-run-button');
        const outputBox = document.getElementById('test-output-box');
        
        if (!runButton || !outputBox) return;
        
        // Disable button and show loading
        runButton.disabled = true;
        runButton.textContent = 'Running...';
        
        // Clear and show loading
        outputBox.classList.remove('empty');
        outputBox.innerHTML = '<span style="color: #9ca3af;">Running code with custom inputs...</span>';
        
        try {
          const currentCode = currentLanguage === 'python' 
            ? (window.pythonCode !== undefined ? window.pythonCode : pythonCode)
            : (window.jsCode !== undefined ? window.jsCode : jsCode);
          
          // Get function name and parameters
          let functionName = '';
          let params = [];
          
          // First, try to get parameters from question arguments (retake mode)
          if (isRetakeMode && questionArguments && Array.isArray(questionArguments) && questionArguments.length > 0) {
            params = questionArguments;
            // Try to get function name from blank code
            const parsed = parseFunctionSignature('', currentLanguage, true);
            functionName = parsed.functionName;
          } else if (taskId && FUNCTION_PARAMS_MAP[taskId]) {
            params = FUNCTION_PARAMS_MAP[taskId];
            // Try to get function name from blank code
            const parsed = parseFunctionSignature('', currentLanguage, true);
            functionName = parsed.functionName;
          } else {
            // Fallback: parse from blank code
            const parsed = parseFunctionSignature('', currentLanguage, true);
            functionName = parsed.functionName;
            params = parsed.params;
          }
          
          // Collect input values
          const inputs = {};
          params.forEach(param => {
            const input = document.getElementById('input-' + param);
            if (input) {
              const value = input.value.trim();
              if (value) {
                // Try to parse as JSON (for numbers, booleans, arrays, objects)
                try {
                  inputs[param] = JSON.parse(value);
                } catch {
                  // If not valid JSON, treat as string
                  inputs[param] = value;
                }
              }
            }
          });
          
          // Call backend API
          const response = await fetch('${backendUrl}/api/skill-check/run-code', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code: currentCode,
              function_name: functionName,
              inputs: inputs,
              language: currentLanguage
            })
          });
          
          if (!response.ok) {
            throw new Error('Failed to execute code');
          }
          
          const data = await response.json();
          
          // Display results
          outputBox.innerHTML = '';
          outputBox.classList.remove('empty');
          
          if (data.stderr && data.stderr.trim()) {
            const stderrSpan = document.createElement('span');
            stderrSpan.className = 'stderr';
            stderrSpan.textContent = data.stderr;
            outputBox.appendChild(stderrSpan);
          }
          
          if (data.stdout && data.stdout.trim()) {
            const stdoutSpan = document.createElement('span');
            stdoutSpan.className = 'stdout';
            stdoutSpan.textContent = data.stdout;
            outputBox.appendChild(stdoutSpan);
          }
          
          if (!data.stdout && !data.stderr) {
            const emptySpan = document.createElement('span');
            emptySpan.style.color = '#6b7280';
            emptySpan.textContent = 'No output';
            outputBox.appendChild(emptySpan);
          }
          
        } catch (error) {
          outputBox.innerHTML = '';
          outputBox.classList.remove('empty');
          
          const errorSpan = document.createElement('span');
          errorSpan.className = 'stderr';
          errorSpan.textContent = 'Error: ' + (error.message || 'Failed to execute code');
          outputBox.appendChild(errorSpan);
        } finally {
          runButton.disabled = false;
          runButton.textContent = 'Run';
        }
      }
      
      // Set up Run button
      const runButton = document.getElementById('test-run-button');
      if (runButton) {
        runButton.addEventListener('click', runCodeWithInputs);
      }
      
      // Initialize input fields when page loads
      setTimeout(() => {
        updateInputFields();
      }, 500);
      
      
      // Store pending setCode message in case editor isn't ready yet
      let pendingSetCodeMessage = null;
      
      // Function to process setCode message
      function processSetCodeMessage(messageData) {
        if (!editor) {
          // Editor not ready yet, store the message
          pendingSetCodeMessage = messageData;
          return;
        }
        
        const { code, language } = messageData;
        if (code !== undefined) {
          if (language === 'python') {
            window.pythonCode = code;
            if (currentLanguage === 'python') {
              editor.setValue(code);
            }
          } else if (language === 'javascript') {
            window.jsCode = code;
            if (currentLanguage === 'javascript') {
              editor.setValue(code);
            }
          }
        }
        
        // Always make editor read-only after solution is viewed (regardless of language match)
        editor.updateOptions({ readOnly: true });
        
        // Disable test inputs and run button
        const testSection = document.getElementById('test-your-code-section');
        const runButton = document.getElementById('test-run-button');
        const inputsContainer = document.getElementById('test-inputs-container');
        if (testSection) {
          testSection.style.opacity = '0.5';
          testSection.style.pointerEvents = 'none';
        }
        if (runButton) {
          runButton.disabled = true;
        }
        if (inputsContainer) {
          const inputs = inputsContainer.querySelectorAll('input');
          inputs.forEach(input => {
            input.disabled = true;
          });
        }
      }
      
      // Listen for code updates from parent (for View Solution)
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'setCode') {
          processSetCodeMessage(event.data);
        }
      });
      
      // Listen for test results updates from parent
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'skillCheckTestResults') {
          const { allPassed, errorMessage, stdout, stderr, loading } = event.data;
          const outputBox = document.getElementById('test-output-box');
          
          if (!outputBox) return;
          
          outputBox.classList.remove('empty', 'has-error');
          
          if (loading) {
            outputBox.textContent = 'Running tests...';
            outputBox.classList.add('empty');
          } else if (allPassed === null) {
            // Never clear existing test results when allPassed is null
            // This preserves test results when code is edited
            // Only show empty state if box is already empty
            var hasContent = outputBox.innerHTML.trim() !== '' && outputBox.children.length > 0;
            if (!hasContent) {
              outputBox.innerHTML = '';
              outputBox.classList.add('empty');
            }
            // Otherwise, leave existing content untouched - don't clear test results on code changes
          } else {
            // Clear everything and show only the most recent test results
            outputBox.innerHTML = '';
            outputBox.classList.remove('empty', 'has-error');
            
            // Add stdout in white
            if (stdout && stdout.trim()) {
              var stdoutSpan = document.createElement('span');
              stdoutSpan.className = 'stdout';
              stdoutSpan.textContent = stdout.trim();
              outputBox.appendChild(stdoutSpan);
            }
            
            // Add stderr in red
            if (stderr && stderr.trim()) {
              if (outputBox.children.length > 0) {
                var separator = document.createElement('div');
                separator.className = 'separator';
                outputBox.appendChild(separator);
              }
              var stderrSpan = document.createElement('span');
              stderrSpan.className = 'stderr';
              stderrSpan.textContent = stderr.trim();
              outputBox.appendChild(stderrSpan);
            }
            
            // Add status line at the end - always add separator before status message if there's any content
            // Check actual DOM state to see if we have any child elements (stdout/stderr spans)
            var hasContentBeforeStatus = outputBox.children.length > 0;
            
            if (allPassed) {
              if (hasContentBeforeStatus) {
                var separator = document.createElement('div');
                separator.className = 'separator';
                outputBox.appendChild(separator);
              }
              var successSpan = document.createElement('span');
              successSpan.className = 'success-message';
              successSpan.textContent = 'All Test Cases Passed! 🎉';
              outputBox.appendChild(successSpan);
              outputBox.classList.remove('has-error');
            } else {
              // Always add separator before failure message if there's content
              if (hasContentBeforeStatus) {
                var separator = document.createElement('div');
                separator.className = 'separator';
                outputBox.appendChild(separator);
              }
              var errorSpan = document.createElement('span');
              errorSpan.className = 'error-message';
              errorSpan.textContent = 'Test Cases Failed ❌';
              outputBox.appendChild(errorSpan);
              outputBox.classList.add('has-error');
            }
          }
        }
      });
      
      // Resize handle functionality
      (function() {
        let resizeHandleEl = null;
        let editorContainerEl = null;
        let testPanelEl = null;
        let editorWrapperEl = null;
        let isResizing = false;
        let startX = 0;
        let startEditorWidth = 0;
        let startPanelWidth = 0;
        
        function initResize() {
          editorWrapperEl = document.querySelector('.editor-wrapper');
          editorContainerEl = document.getElementById('editor-container');
          testPanelEl = document.getElementById('test-results-panel');
          resizeHandleEl = document.getElementById('resize-handle');
          
          if (!editorWrapperEl || !editorContainerEl || !testPanelEl || !resizeHandleEl) {
            setTimeout(initResize, 100);
            return;
          }
          
          // Set initial 75/25 ratio if not already set
          if (editorContainerEl.style.flex === '' && testPanelEl.style.flex === '') {
            const wrapperWidth = editorWrapperEl.offsetWidth;
            const handleWidth = 4;
            const availableWidth = wrapperWidth - handleWidth;
            const editorWidth = Math.floor(availableWidth * 0.75);
            const panelWidth = availableWidth - editorWidth;
            editorContainerEl.style.flex = '0 0 ' + editorWidth + 'px';
            testPanelEl.style.flex = '0 0 ' + panelWidth + 'px';
          }
          
          resizeHandleEl.addEventListener('mousedown', function(e) {
            isResizing = true;
            startX = e.clientX;
            startEditorWidth = editorContainerEl.offsetWidth;
            startPanelWidth = testPanelEl.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
            e.stopPropagation();
          });
        }
        
        initResize();
        
        document.addEventListener('mousemove', function(e) {
          if (!isResizing || !editorContainerEl || !testPanelEl || !editorWrapperEl) return;
          
          const deltaX = e.clientX - startX;
          const wrapperWidth = editorWrapperEl.offsetWidth;
          const handleWidth = 4;
          const availableWidth = wrapperWidth - handleWidth;
          
          // Calculate new widths based on mouse movement
          let newEditorWidth = startEditorWidth + deltaX;
          let newPanelWidth = startPanelWidth - deltaX;
          
          // Constrain editor to 25% - 75% of available width
          const minEditorWidth = availableWidth * 0.25;
          const maxEditorWidth = availableWidth * 0.75;
          
          // Constrain panel to 25% - 75% of available width
          const minPanelWidth = availableWidth * 0.25;
          const maxPanelWidth = availableWidth * 0.75;
          
          // Apply constraints
          newEditorWidth = Math.max(minEditorWidth, Math.min(maxEditorWidth, newEditorWidth));
          newPanelWidth = Math.max(minPanelWidth, Math.min(maxPanelWidth, newPanelWidth));
          
          // Ensure they sum to available width (adjust if needed due to rounding)
          const total = newEditorWidth + newPanelWidth;
          if (Math.abs(total - availableWidth) > 1) {
            newPanelWidth = availableWidth - newEditorWidth;
          }
          
          editorContainerEl.style.flex = '0 0 ' + newEditorWidth + 'px';
          testPanelEl.style.flex = '0 0 ' + newPanelWidth + 'px';
        });
        
        document.addEventListener('mouseup', function() {
          if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
          }
        });
      })();
    })();
  </script>
</body>
</html>`;
    }

    // Get initial answer state, but don't regenerate when it changes
    const initialAnswer = answers[currentQuestion.id];
    const initialOtherText = otherText[currentQuestion.id] || '';
    
    // Check if this question has been checked (ONLY for retake mode MCQA)
    // Pre-test and post-test should NEVER show checkmarks/X or require "Check Answer"
    const isAnswerChecked = mode === 'retake' && currentQuestion.question_type === 'mcqa' && checkedAnswers.has(currentQuestion.id);
    
    // Get correct answer index for MCQA questions (only used in retake mode when checked)
    // Answer is stored as a string like "B" in the database, not an array
    let correctAnswerIndex: number | null = null;
    if (currentQuestion.question_type === 'mcqa' && currentQuestion.answer) {
      let answerLetter: string | null = null;
      
      // Handle both string format ("B") and array format (["B"]) for backward compatibility
      if (typeof currentQuestion.answer === 'string' && currentQuestion.answer.trim().length > 0) {
        answerLetter = currentQuestion.answer.trim().toUpperCase();
      } else if (Array.isArray(currentQuestion.answer) && currentQuestion.answer.length > 0) {
        const firstItem = currentQuestion.answer[0];
        if (typeof firstItem === 'string' && firstItem.trim().length > 0) {
          answerLetter = firstItem.trim().toUpperCase();
        }
      }
      
      // Convert letter to 0-based index (A=0, B=1, C=2, D=3, etc.)
      if (answerLetter && answerLetter.length > 0) {
        const charCode = answerLetter.charCodeAt(0);
        const aCode = 'A'.charCodeAt(0);
        if (charCode >= aCode && charCode <= aCode + 25) {
          correctAnswerIndex = charCode - aCode;
        }
      }
    }

    // Normalize choices to a simple array
    let choicesArray: string[] = [];
    if (currentQuestion.question_type === 'mcqa') {
      if (Array.isArray(currentQuestion.choices) && currentQuestion.choices.length > 0) {
        choicesArray = currentQuestion.choices;
      } else if (currentQuestion.choiceA || currentQuestion.choiceB || currentQuestion.choiceC || currentQuestion.choiceD) {
        // Fallback to choiceA-D format
        choicesArray = [
          currentQuestion.choiceA,
          currentQuestion.choiceB,
          currentQuestion.choiceC,
          currentQuestion.choiceD,
        ].filter((c): c is string => !!c);
      }
    } else if (currentQuestion.question_type === 'multi_select' || currentQuestion.question_type === 'multi_select_with_time' || currentQuestion.question_type === 'integer') {
      choicesArray = Array.isArray(currentQuestion.choices) ? currentQuestion.choices : [];
    }


    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      width: 100%;
      overflow: hidden;
    }
    body {
      background: #1a1f2e;
      color: #e5e7eb;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 0;
      line-height: 1.6;
      display: flex;
      flex-direction: column;
    }
    /* Transparent scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      background: transparent;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    /* Firefox scrollbar */
    * {
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
    /* Prevent text selection and copying for MCQA questions */
    body, .question-container, .question-text, .choices-container, .choice-label, .choice-markdown {
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    /* Allow selection only for input fields */
    input[type="text"], input[type="radio"], input[type="checkbox"] {
      -webkit-user-select: auto;
      -moz-user-select: auto;
      -ms-user-select: auto;
      user-select: auto;
    }
    .question-container {
      background: #1a1f2e;
      border: none;
      border-radius: 0;
      padding: 0;
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .content-wrapper {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .question-text {
      font-size: 18px;
      font-weight: normal;
      color: #e5e7eb;
      margin-bottom: 16px;
      line-height: 1.6;
    }
    .question-text ul {
      margin: 8px 0;
      padding-left: 24px;
      list-style-type: disc;
    }
    .question-text li {
      margin: 4px 0;
      padding-left: 4px;
    }
    .question-text p {
      margin: 8px 0;
    }
    .question-text p:first-child {
      margin-top: 0;
    }
    .question-text p:last-child {
      margin-bottom: 0;
    }
    .choices-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 0;
    }
    .choice-label {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #374151;
      background: rgba(31, 41, 55, 0.5);
      color: #d1d5db;
      cursor: pointer;
      transition: all 0.2s;
    }
    .choice-label:hover:not(.checked) {
      border-color: #4b5563;
      background: #1f2937;
    }
    .choice-label.selected {
      background: rgba(37, 99, 235, 0.2);
      border-color: #3b82f6;
      color: #fff;
    }
    .choice-label.selected.checked {
      background: rgba(37, 99, 235, 0.2);
      border-color: #3b82f6;
      color: #fff;
    }
    .choice-label.checked {
      cursor: not-allowed;
      opacity: 0.8;
    }
    .choice-label.checked:hover {
      /* Maintain the same styles as non-hover state when checked - no border change */
      border-color: inherit !important;
      background: inherit !important;
    }
    .choice-label.selected.checked:hover {
      /* Keep selected styling even on hover when checked - no border change */
      background: rgba(37, 99, 235, 0.2) !important;
      border-color: #3b82f6 !important;
      color: #fff !important;
    }
    .choice-label:not(.selected).checked:hover {
      /* Keep non-selected checked styling on hover - no border change */
      border-color: #374151 !important;
      background: rgba(31, 41, 55, 0.5) !important;
    }
    .choice-label input[type="radio"],
    .choice-label input[type="checkbox"] {
      margin-right: 12px;
      width: 16px;
      height: 16px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .choice-markdown {
      display: inline-block;
      min-width: 0;
    }
    .choice-markdown code:not(pre code) {
      display: inline;
      background: rgba(55, 65, 81, 0.8);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .choice-markdown pre {
      display: block;
      padding: 8px;
      margin: 4px 0;
      overflow-x: auto;
      background: rgba(55, 65, 81, 0.8);
      border-radius: 4px;
    }
    .choice-markdown pre code {
      display: block;
      background: transparent;
      padding: 0;
    }
    .choice-markdown p {
      margin: 0;
      display: inline;
    }
    .choice-markdown p:first-child {
      display: inline;
    }
    .choice-label .other-input {
      flex: 1;
      margin-left: 8px;
      padding: 6px 12px;
      background: rgba(55, 65, 81, 0.5);
      border: 1px solid #4b5563;
      border-radius: 4px;
      color: #fff;
      font-size: 14px;
    }
    .choice-label .other-input:focus {
      outline: none;
      border-color: #3b82f6;
    }
    code {
      background: #111827;
      color: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.875em;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    pre {
      background: #111827;
      color: #f3f4f6;
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 8px 0;
    }
    pre code {
      background: transparent;
      padding: 0;
    }
    /* Matrix-style rating table for experience questions */
    .matrix-container {
      margin-top: 8px;
      overflow-x: auto;
    }
    .matrix-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      background: #020617;
      border-radius: 8px;
      overflow: hidden;
    }
    .matrix-table thead {
      background: #020617;
    }
    .matrix-header-cell {
      padding: 10px 12px;
      font-size: 14px;
      font-weight: 600;
      color: #e5e7eb;
      text-align: center;
      border-bottom: 1px solid #374151;
      white-space: nowrap;
    }
    .matrix-header-empty {
      text-align: left;
      width: 35%;
    }
    .matrix-row {
      border-top: 1px solid #111827;
      background: transparent;
      transition: background 0.12s ease-out;
    }
    .matrix-row:nth-child(2n) {
      background: transparent;
    }
    .matrix-row:hover {
      background: rgba(15, 23, 42, 0.9);
    }
    .matrix-label-cell {
      padding: 10px 12px;
      color: #e5e7eb;
      font-size: 15px;
      white-space: nowrap;
    }
    .matrix-row-label {
      display: inline-block;
    }
    .matrix-cell {
      padding: 8px 0;
      text-align: center;
    }
    .matrix-radio {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: #3b82f6;
    }
    .matrix-other-input {
      margin-left: 8px;
      padding: 6px 10px;
      background: rgba(31, 41, 55, 0.8);
      border-radius: 6px;
      border: 1px solid #4b5563;
      color: #e5e7eb;
      font-size: 13px;
      min-width: 160px;
    }
    .matrix-other-input::placeholder {
      color: #6b7280;
    }
    .matrix-other-input:focus {
      outline: none;
      border-color: #3b82f6;
    }
    /* Integer input styling */
    .integer-input-container {
      margin-top: 12px;
    }
    .integer-input {
      width: 100%;
      padding: 12px 16px;
      background: rgba(31, 41, 55, 0.5);
      border: 1px solid #4b5563;
      border-radius: 8px;
      color: #e5e7eb;
      font-size: 16px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }
    .integer-input:focus {
      border-color: #3b82f6;
      background: rgba(31, 41, 55, 0.8);
    }
    .integer-input::placeholder {
      color: #6b7280;
    }
    /* Style the spinner buttons - bigger, darker background, white arrows */
    .integer-input::-webkit-inner-spin-button {
      opacity: 1;
      cursor: pointer;
      height: 30px;
      width: 30px;
      background: #1f2937;
      border-left: 1px solid #4b5563;
      border-radius: 0 8px 8px 0;
      margin-right: -1px;
      margin-top: -1px;
      margin-bottom: -1px;
    }
    .integer-input::-webkit-inner-spin-button:hover {
      background: #111827;
    }
    .integer-input::-webkit-inner-spin-button:active {
      background: #030712;
    }
    .integer-input::-webkit-outer-spin-button {
      opacity: 1;
    }
    /* Make sure input has enough padding for larger spinner */
    .integer-input {
      padding-right: 40px;
    }
    /* NASA TLI Scale styling */
    .tli-scale-container {
      margin-top: 24px;
    }
    .tli-scale-title {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
      text-align: center;
      margin-bottom: 0px;
    }
    .tli-scale-wrapper {
      position: relative;
      width: 100%;
      padding: 20px 0 50px 0;
    }
    .tli-scale-lines-container {
      position: relative;
      width: 100%;
      height: 60px;
      margin: 12px 0;
    }
    .tli-scale-line {
      position: absolute;
      left: 0;
      width: 100%;
      height: 2px;
      background-color: #9ca3af;
      z-index: 3;
    }
    .tli-scale-line-top {
      top: 0;
    }
    .tli-scale-line-bottom {
      top: 58px;
    }
    .tli-scale-ticks-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 60px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      pointer-events: none;
      z-index: 4;
    }
    .tli-scale-tick {
      width: 2px;
      background-color: #9ca3af;
      position: relative;
      flex-shrink: 0;
    }
    .tli-scale-tick.full {
      height: 60px;
      align-self: flex-start;
    }
    .tli-scale-tick.half {
      height: 30px;
      align-self: flex-end;
    }
    .tli-scale-spaces-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 60px;
      display: flex;
      pointer-events: none;
      z-index: 2;
    }
    .tli-scale-space-wrapper {
      flex: 1;
      position: relative;
      height: 100%;
      pointer-events: auto;
    }
    .tli-scale-space {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 60px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tli-scale-space:hover {
      background-color: rgba(59, 130, 246, 0.15);
    }
    .tli-scale-selection {
      position: absolute;
      inset: 0;
      background-color: #2563eb;
      pointer-events: none;
      z-index: 1;
    }
    .tli-scale-number {
      position: relative;
      z-index: 5;
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      pointer-events: none;
    }
    .tli-scale-labels {
      display: flex;
      justify-content: space-between;
      width: 100%;
      margin-top: 20px;
      font-size: 14px;
      color: #fff;
    }
    .tli-scale-label {
      font-weight: 500;
    }
    .tli-scale-note {
      text-align: center;
      margin-top: 12px;
      font-size: 20px;
      color: #d1d5db;
    }
  </style>
</head>
<body>
  <div class="question-container">
    <div class="content-wrapper">
      <div class="question-text" id="question-text"></div>
      <div class="choices-container" id="choices-container">
      </div>
    </div>
  </div>
  <script>
    (function() {
      function renderChoices(choices, questionId, questionType, initialAnswer, initialOtherText, isFrontend, isExperience, isNasaTli, questionText, isAnswerChecked, correctAnswerIndex) {
        if (questionType === 'mcqa') {
          if (!choices || !Array.isArray(choices)) {
            return '';
          }
          
          // Special handling for NASA TLI questions - render as horizontal scale
          if (isNasaTli) {
            const leftLabel = choices[0] || 'Very Low';
            const rightLabel = choices[choices.length - 1] || 'Very High';
            const numTicks = 20;
            const numSpaces = 20; // 0-19
            
            // Map question ID to title
            const tliTitles = {
              'nasa_1': 'Mental Demand',
              'nasa_2': 'Physical Demand',
              'nasa_3': 'Temporal Demand',
              'nasa_4': 'Performance',
              'nasa_5': 'Effort',
              'nasa_6': 'Frustration'
            };
            const title = tliTitles[questionId] || 'Mental Demand';
            
            // Parse initial answer - convert from 1-indexed (stored) to 0-indexed (for display)
            let selectedIndex = null;
            if (initialAnswer !== null && initialAnswer !== undefined) {
              if (typeof initialAnswer === 'number') {
                // Convert from 1-indexed (1-20) to 0-indexed (0-19)
                if (initialAnswer >= 1 && initialAnswer <= 20) {
                  selectedIndex = initialAnswer - 1;
                }
              } else if (typeof initialAnswer === 'object' && initialAnswer.index !== undefined) {
                // Convert from 1-indexed to 0-indexed
                if (initialAnswer.index >= 1 && initialAnswer.index <= 20) {
                  selectedIndex = initialAnswer.index - 1;
                }
              } else if (typeof initialAnswer === 'string') {
                // Try to match by choice text
                const idx = choices.indexOf(initialAnswer);
                if (idx !== -1) {
                  selectedIndex = idx;
                }
              }
            }
            
            // Ensure selectedIndex is in valid range (0-19)
            if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex >= numSpaces)) {
              selectedIndex = null;
            }
            
            const escapedTitle = title
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            const escapedLeftLabel = leftLabel
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            const escapedRightLabel = rightLabel
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            
            // Create 21 tick marks (0-20) creating 20 spaces (0-19) between them
            // First and last ticks are full height, others alternate between full and half
            let ticksHtml = '';
            let spacesHtml = '';
            
            // Create 21 ticks evenly spaced with alternating heights
            for (let i = 0; i <= numTicks; i++) {
              // First tick (0) and last tick (20) are full height
              // For others: even indices (2, 4, 6...) are full, odd indices (1, 3, 5...) are half
              const isFull = (i === 0 || i === numTicks || i % 2 === 0);
              const tickClass = isFull ? 'full' : 'half';
              ticksHtml += '<div class="tli-scale-tick ' + tickClass + '" data-tick-index="' + i + '"></div>';
            }
            
            // Check if this is the Performance question (nasa_4) for note text
            const isPerformance = questionId === 'nasa_4';
            
            // Create note text explaining the scale
            const noteText = isPerformance 
              ? 'Note: Lower numbers indicate better performance'
              : 'Note: Lower numbers indicate lower burden';
            const escapedNote = noteText
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            
            // Create 20 spaces, each positioned between consecutive ticks
            // Always show numbers for consistency
            for (let i = 0; i < numSpaces; i++) {
              const isSelected = selectedIndex === i;
              const selectionHtml = isSelected ? '<div class="tli-scale-selection"></div>' : '';
              const number = i + 1; // 1-indexed for display
              spacesHtml += '<div class="tli-scale-space-wrapper">' +
                '<div class="tli-scale-space" data-space-index="' + i + '">' +
                  selectionHtml +
                  '<span class="tli-scale-number">' + number + '</span>' +
                '</div>' +
              '</div>';
            }
            
            return '<div class="tli-scale-container">' +
              (title ? '<div class="tli-scale-title">' + escapedTitle + '</div>' : '') +
              '<div class="tli-scale-wrapper">' +
                '<div class="tli-scale-lines-container">' +
                  '<div class="tli-scale-line tli-scale-line-top"></div>' +
                  '<div class="tli-scale-line tli-scale-line-bottom"></div>' +
                  '<div class="tli-scale-ticks-container">' + ticksHtml + '</div>' +
                  '<div class="tli-scale-spaces-container">' + spacesHtml + '</div>' +
                '</div>' +
                '<div class="tli-scale-labels">' +
                  '<span class="tli-scale-label">' + escapedLeftLabel + '</span>' +
                  '<span class="tli-scale-label">' + escapedRightLabel + '</span>' +
                '</div>' +
                '<div class="tli-scale-note">' + escapedNote + '</div>' +
              '</div>' +
            '</div>';
          }
          
          const result = choices.map((choice, idx) => {
            const isOther = choice === 'Other';
            // Use index for value to avoid backtick issues in HTML attributes
            const inputValue = idx.toString();
            // Check if initial answer matches the choice
            // For MCQA, answer is stored as {index: number, text: string} object
            // For experience and NASA TLI questions, don't set default checked state
            let isChecked = false;
            if (!isExperience && !isNasaTli) {
              if (typeof initialAnswer === 'object' && initialAnswer !== null && initialAnswer.text) {
                // MCQA format: {index: number, text: string}
                isChecked = initialAnswer.text === choice;
              } else if (typeof initialAnswer === 'string') {
                // Fallback: direct string comparison
                isChecked = initialAnswer === choice;
              }
            }
            const checkedAttr = isChecked ? 'checked' : '';
            const otherValue = isOther ? initialOtherText : '';
            const choiceWithoutBackticks = choice.split(String.fromCharCode(96)).join('');
            const escapedChoiceText = choiceWithoutBackticks
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            
            // Determine if this choice is correct or if user selected it (for showing check/X)
            // Show checkmark on correct answer, X on user's incorrect selection
            let checkmarkHtml = '';
            if (isAnswerChecked && !isOther) {
              const isCorrectAnswer = correctAnswerIndex !== null && idx === correctAnswerIndex;
              // Check if user selected this choice (handle both object and string formats)
              const isUserSelected = (typeof initialAnswer === 'object' && initialAnswer !== null && initialAnswer.text === choice) || 
                                     (typeof initialAnswer === 'string' && initialAnswer === choice);
              
              if (isCorrectAnswer) {
                // Show green checkmark for correct answer (always show on correct answer) - inline after text
                checkmarkHtml = '<span style="margin-left: 8px; display: inline-flex; align-items: center; flex-shrink: 0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>';
              } else if (isUserSelected) {
                // Show red X for user's incorrect selection - inline after text
                checkmarkHtml = '<span style="margin-left: 8px; display: inline-flex; align-items: center; flex-shrink: 0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>';
              }
            }
            
            let spanContent = '';
            let spanAttributes = '';
            if (isFrontend) {
              spanAttributes = ' class="choice-markdown" data-original-text="' + escapedChoiceText + '" data-choice-content="' + (choice.replace(/"/g, '&quot;').replace(/'/g, '&#39;')) + '"';
            } else {
              const escapedForDisplay = choice
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              spanContent = escapedForDisplay;
            }
            
            // Always place checkmark after the span (outside) so it's not affected by markdown processing
            const html = '<label class="choice-label ' + (isChecked ? 'selected' : '') + (isAnswerChecked ? ' checked' : '') + '">' +
              '<input type="radio" name="question-' + questionId + '" value="' + inputValue + '" data-choice-index="' + idx + '" data-choice-text="' + escapedChoiceText + '" ' + checkedAttr + (isAnswerChecked ? ' disabled' : '') + ' />' +
              (isOther 
                ? '<span>Other</span><input type="text" class="other-input" value="' + (otherValue.replace(/"/g, '&quot;')) + '" placeholder="Please specify..." ' + (isAnswerChecked ? 'disabled' : '') + ' />'
                : '<span' + spanAttributes + '>' + spanContent + '</span>' + checkmarkHtml
              ) +
              '</label>';
            return html;
          }).join('');
          
          // Add feedback message when answer is checked
          // Note: choices is already validated at the top of the function
          let feedbackHtml = '';
          if (isAnswerChecked && correctAnswerIndex !== null && choices.length > 0) {
            // Determine if user's answer was correct
            let userSelectedIndex = null;
            if (typeof initialAnswer === 'object' && initialAnswer !== null && initialAnswer.index !== null && initialAnswer.index !== undefined) {
              userSelectedIndex = initialAnswer.index;
            } else if (typeof initialAnswer === 'string' && initialAnswer.trim() !== '') {
              // Try to find the index of the user's selected choice
              const userChoiceText = initialAnswer;
              const idx = choices.indexOf(userChoiceText);
              if (idx !== -1) {
                userSelectedIndex = idx;
              }
            } else if (typeof initialAnswer === 'object' && initialAnswer !== null && initialAnswer.text) {
              // MCQA format: {index: number, text: string}
              const userChoiceText = initialAnswer.text;
              const idx = choices.indexOf(userChoiceText);
              if (idx !== -1) {
                userSelectedIndex = idx;
              }
            }
            
            const isCorrect = userSelectedIndex !== null && userSelectedIndex === correctAnswerIndex;
            
            if (isCorrect) {
              feedbackHtml = '<div style="margin-top: 16px; padding: 12px 16px; color: #10b981; font-size: 15px; font-weight: 500; line-height: 1.5;">Great job! That is correct.</div>';
            } else {
              // Get the correct answer text
              let correctAnswerText = '';
              if (correctAnswerIndex !== null && correctAnswerIndex >= 0 && choices.length > 0 && correctAnswerIndex < choices.length) {
                correctAnswerText = choices[correctAnswerIndex];
                // Escape HTML special characters
                correctAnswerText = correctAnswerText
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
              }
              const correctAnswerDisplay = correctAnswerText ? ' The correct answer is: ' + correctAnswerText : '';
              feedbackHtml = '<div style="margin-top: 16px; padding: 12px 16px; color: #ef4444; font-size: 15px; font-weight: 500; line-height: 1.5;">Not quite right.' + correctAnswerDisplay + '</div>';
            }
          }
          
          return result + feedbackHtml;
        } else if (questionType === 'multi_select' || questionType === 'multi_select_with_time') {
          // Special handling for experience background multi_select questions
          const isProgrammingExperience = isExperience && questionText && questionText.indexOf('What programming / scripting languages are you proficient in?') === 0;
          const isAiToolsExperience = isExperience && questionText && questionText.indexOf('Which AI tools do you use specifically for coding?') === 0;
          
          // Use matrix UI for both regular multi_select and multi_select_with_time experience questions
          if (isProgrammingExperience || isAiToolsExperience) {
            const scale = isProgrammingExperience
              ? ['None', 'Beginner', 'Intermediate', 'Advanced']
              : ['None', 'Rarely', 'Sometimes', 'Very Often'];

            // Build or hydrate matrix-style answer object
            const baseAnswer = initialAnswer && typeof initialAnswer === 'object' && !Array.isArray(initialAnswer)
              ? initialAnswer
              : {};
            const responses = baseAnswer.responses && typeof baseAnswer.responses === 'object'
              ? baseAnswer.responses
              : {};
            const otherTextValue = typeof baseAnswer.other === 'string' ? baseAnswer.other : (initialOtherText || '');
            const isMultiSelectWithTime = questionType === 'multi_select_with_time';
            // For multi_select_with_time, store months per choice
            const monthsPerChoice = isMultiSelectWithTime && baseAnswer.months && typeof baseAnswer.months === 'object'
              ? baseAnswer.months
              : {};

            // For experience/NASA TLI questions, don't set default values
            if (!isExperience && !isNasaTli) {
              (choices || []).forEach((choice) => {
                if (!responses[choice]) {
                  responses[choice] = scale[0];
                }
                // Initialize months for each choice if not present
                if (isMultiSelectWithTime && !monthsPerChoice[choice]) {
                  monthsPerChoice[choice] = '';
                }
              });

              const answerObj = {
                scale: scale,
                responses: responses,
                other: otherTextValue,
                ...(isMultiSelectWithTime ? { months: monthsPerChoice } : {}),
              };

              // Send initial default (all "None") answer up to parent so navigation logic works
              // Only for non-experience/non-NASA TLI questions
              try {
                window.parent.postMessage({
                  type: 'skillCheckAnswer',
                  questionId: questionId,
                  answer: answerObj,
                  questionType: questionType
                }, '*');
              } catch (e) {
                // Best-effort only
              }
            } else {
              // For experience/NASA TLI, initialize empty months per choice if needed
              if (isMultiSelectWithTime) {
                (choices || []).forEach((choice) => {
                  if (!monthsPerChoice[choice]) {
                    monthsPerChoice[choice] = '';
                  }
                });
              }
            }

            // Matrix UI HTML
            const headerCells = scale.map((level) => {
              const escaped = level
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
              return '<th class="matrix-header-cell">' + escaped + '</th>';
            }).join('');
            
            // Add months header column for multi_select_with_time
            const monthsHeaderCell = isMultiSelectWithTime 
              ? '<th class="matrix-header-cell"># Months Used</th>'
              : '';

            const rowsHtml = (choices || []).map((choice, rowIdx) => {
              const isOther = choice === 'Other';
              // For experience/NASA TLI questions, don't default to scale[0], leave unselected
              const currentLevel = responses[choice] || (isExperience || isNasaTli ? null : scale[0]);
              const escapedChoice = choice
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

              const cells = scale.map((level, levelIdx) => {
                // For experience/NASA TLI questions, don't check any option by default
                const checked = (currentLevel && currentLevel === level) ? 'checked' : '';
                return (
                  '<td class="matrix-cell">' +
                  '<input type="radio" class="matrix-radio" data-matrix="1" ' +
                  'name="matrix-' + questionId + '-' + rowIdx + '" ' +
                  'data-item="' + escapedChoice + '" value="' + levelIdx + '" ' + checked + ' />' +
                  '</td>'
                );
              }).join('');
              
              // Add months input cell for multi_select_with_time (one per row)
              const monthsValueForChoice = isMultiSelectWithTime ? (monthsPerChoice[choice] || '') : '';
              const monthsCell = isMultiSelectWithTime
                ? '<td class="matrix-cell" style="vertical-align: middle;">' +
                  '<input type="number" class="matrix-months-input" data-choice="' + escapedChoice + '" min="1" step="1" value="' + (monthsValueForChoice.replace(/"/g, '&quot;')) + '" placeholder="Months" style="width: 80px; padding: 6px 8px; background: rgba(55, 65, 81, 0.5); border: 1px solid #4b5563; border-radius: 4px; color: #fff; font-size: 14px;" />' +
                  '</td>'
                : '';

              const labelHtml = isOther
                ? '<span class="matrix-row-label">Other</span>'
                : '<span class="matrix-row-label">' + escapedChoice + '</span>';

              const otherInputHtml = isOther
                ? '<input type="text" class="matrix-other-input" placeholder="Please specify..." value="' +
                  otherTextValue.replace(/"/g, '&quot;') +
                  '" />'
                : '';

              return (
                '<tr class="matrix-row">' +
                  '<td class="matrix-label-cell">' + labelHtml + otherInputHtml + '</td>' +
                  cells +
                  monthsCell +
                '</tr>'
              );
            }).join('');

            const tableHtml =
              '<div class="matrix-container">' +
                '<table class="matrix-table" data-matrix-question="1">' +
                  '<thead>' +
                    '<tr>' +
                      '<th class="matrix-header-cell matrix-header-empty"></th>' +
                      headerCells +
                      monthsHeaderCell +
                    '</tr>' +
                  '</thead>' +
                  '<tbody>' +
                    rowsHtml +
                  '</tbody>' +
                '</table>' +
              '</div>';

            return tableHtml;
          }
          
          // Regular multi_select or multi_select_with_time: use checkboxes
          const selectedChoices = initialAnswer && typeof initialAnswer === 'object' && !Array.isArray(initialAnswer)
            ? (initialAnswer.selected || [])
            : (Array.isArray(initialAnswer) ? initialAnswer : []);
          const isMultiSelectWithTime = questionType === 'multi_select_with_time';
          const monthsValue = isMultiSelectWithTime && initialAnswer && typeof initialAnswer === 'object' && !Array.isArray(initialAnswer)
            ? (initialAnswer.months || '')
            : '';
          
          const checkboxesHtml = choices.map((choice, idx) => {
            const isSelected = selectedChoices.includes(choice);
            const isOther = choice === 'Other';
            const otherValue = isOther ? (initialAnswer && typeof initialAnswer === 'object' && !Array.isArray(initialAnswer) ? (initialAnswer.other || '') : initialOtherText) : '';
            const inputValue = idx.toString();
            const choiceWithoutBackticks = choice.split(String.fromCharCode(96)).join('');
            const escapedChoiceText = choiceWithoutBackticks
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            
            let spanContent = '';
            let spanAttributes = '';
            if (isFrontend) {
              spanAttributes = ' class="choice-markdown" data-original-text="' + escapedChoiceText + '" data-choice-content="' + (choice.replace(/"/g, '&quot;').replace(/'/g, '&#39;')) + '"';
            } else {
              const escapedForDisplay = choice
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              spanContent = escapedForDisplay;
            }
            
            return '<label class="choice-label ' + (isSelected ? 'selected' : '') + '">' +
              '<input type="checkbox" ' + (isSelected ? 'checked' : '') + ' value="' + inputValue + '" data-choice-text="' + escapedChoiceText + '" />' +
              (isOther
                ? '<span>Other</span><input type="text" class="other-input" value="' + (otherValue.replace(/"/g, '&quot;')) + '" placeholder="Please specify..." />'
                : '<span' + spanAttributes + '>' + spanContent + '</span>'
              ) +
              '</label>';
          }).join('');
          
          // Add months input field for multi_select_with_time questions
          if (isMultiSelectWithTime) {
            return checkboxesHtml + 
              '<div style="margin-top: 16px; padding: 12px 16px; border-radius: 8px; border: 1px solid #374151; background: rgba(31, 41, 55, 0.5);">' +
              '<label style="display: block; margin-bottom: 8px; color: #d1d5db; font-size: 14px; font-weight: 500;"># Months Used</label>' +
              '<input type="number" class="months-input" min="1" step="1" value="' + (monthsValue.replace(/"/g, '&quot;')) + '" placeholder="Enter a positive integer" style="width: 100%; padding: 8px 12px; background: rgba(55, 65, 81, 0.5); border: 1px solid #4b5563; border-radius: 4px; color: #fff; font-size: 14px;" />' +
              '</div>';
          }
          
          return checkboxesHtml;
        } else if (questionType === 'integer') {
          // Simple integer input for years of experience
          let initialValue = '';
          if (typeof initialAnswer === 'string' || typeof initialAnswer === 'number') {
            initialValue = String(initialAnswer);
          }

          return '' +
            '<div class="integer-input-container">' +
              '<input type="number" class="integer-input" min="0" step="1" value="' + 
                (initialValue.replace(/"/g, '&quot;')) + 
                '" placeholder="Enter number of years" />' +
            '</div>';
        }
        return '';
      }
      
      // Render choices
      const choicesArray = ${JSON.stringify(choicesArray)};
      const questionId = '${currentQuestion.id}';
      const questionType = '${currentQuestion.question_type}';
      const questionText = ${JSON.stringify(currentQuestion.question || '')};
      const initialAnswer = ${JSON.stringify(initialAnswer)};
      const initialOtherText = ${JSON.stringify(initialOtherText)};
      const isFrontend = '${currentQuestion.type}' === 'frontend';
      const isExperience = '${currentQuestion.type}' === 'experience';
      const isNasaTli = '${currentQuestion.type}' === 'nasa_tli';
      const isAnswerChecked = ${isAnswerChecked ? 'true' : 'false'};
      const correctAnswerIndex = ${correctAnswerIndex !== null ? correctAnswerIndex : 'null'};
      
      // Render markdown in question text using marked library (do this first)
      const questionTextEl = document.getElementById('question-text');
      if (questionTextEl && questionText) {
        if (typeof marked !== 'undefined') {
          questionTextEl.innerHTML = marked.parse(questionText);
        } else {
          // Fallback if marked doesn't load
          questionTextEl.textContent = questionText;
        }
      }
      
      const container = document.getElementById('choices-container');
      if (container) {
        try {
          const html = renderChoices(choicesArray, questionId, questionType, initialAnswer, initialOtherText, isFrontend, isExperience, isNasaTli, questionText, isAnswerChecked, correctAnswerIndex);
          container.innerHTML = html;
        } catch (e) {
          console.error('Error rendering choices:', e);
          container.innerHTML = '<div style="color: #ef4444; padding: 12px;">Error loading choices. Please refresh the page.</div>';
        }
        
        container.querySelectorAll('.choice-markdown[data-choice-content]').forEach((span) => {
          const originalContent = span.getAttribute('data-choice-content');
          if (originalContent) {
            const decoded = originalContent
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"');
            span.textContent = decoded;
          }
        });
      }
      
      // Setup TLI scale handlers
      if (isNasaTli && questionType === 'mcqa') {
        const scaleContainer = container.querySelector('.tli-scale-container');
        if (scaleContainer) {
          const spaces = scaleContainer.querySelectorAll('.tli-scale-space');
          
          function selectSpace(index) {
            // Remove selection indicator from all spaces
            spaces.forEach((space) => {
              const existingSelection = space.querySelector('.tli-scale-selection');
              if (existingSelection) {
                existingSelection.remove();
              }
            });
            
            // Add selection indicator to the clicked space
            // index is 0-indexed (0-19) for display
            if (index >= 0 && index < 20) {
              const selectedSpace = Array.from(spaces).find((space) => {
                return parseInt(space.getAttribute('data-space-index'), 10) === index;
              });
              if (selectedSpace) {
                const selectionDiv = document.createElement('div');
                selectionDiv.className = 'tli-scale-selection';
                selectedSpace.appendChild(selectionDiv);
              }
            }
            
            // Convert from 0-indexed (0-19) to 1-indexed (1-20) for storage
            sendAnswer(index + 1);
          }
          
          spaces.forEach((space) => {
            space.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              const index = parseInt(this.getAttribute('data-space-index'), 10);
              if (!isNaN(index) && index >= 0 && index < 20) {
                selectSpace(index);
              }
            });
          });
        }
      }
      
      // Configure marked for proper rendering
      if (typeof marked !== 'undefined') {
        marked.setOptions({
          breaks: true,
          gfm: true
        });
      }
      
      // Render markdown in frontend question choices
      if (isFrontend && typeof marked !== 'undefined') {
        requestAnimationFrame(() => {
          document.querySelectorAll('.choice-markdown').forEach((span) => {
            const originalText = span.textContent || span.innerText || '';
            if (originalText.trim()) {
              span.innerHTML = marked.parse(originalText);
            }
          });
        });
      }
      
      function sendAnswer(answer) {
        window.parent.postMessage({
          type: 'skillCheckAnswer',
          questionId: questionId,
          answer: answer,
          questionType: questionType
        }, '*');
      }
      
      // Prevent label clicks from causing scroll
      // Also prevent clicks when inputs are disabled (after checking answer)
      document.querySelectorAll('.choice-label').forEach(label => {
        label.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const radio = this.querySelector('input[type="radio"]');
          const checkbox = this.querySelector('input[type="checkbox"]');
          // Don't allow changing answer if input is disabled (answer has been checked)
          if (radio && radio.disabled) {
            return false;
          }
          if (checkbox && checkbox.disabled) {
            return false;
          }
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return false;
        });
      });
      
      // Prevent input clicks from causing scroll
      // Also prevent clicks when inputs are disabled (after checking answer)
      document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
        input.addEventListener('click', function(e) {
          // Don't allow changing answer if input is disabled (answer has been checked)
          if (this.disabled) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
          e.stopPropagation();
        });
        // Prevent scroll when input receives focus
        input.addEventListener('focus', function(e) {
          // Don't allow focus if disabled
          if (this.disabled) {
            this.blur();
            return;
          }
          // Blur immediately to prevent scroll, but allow the change event to fire first
          setTimeout(() => this.blur(), 0);
        });
      });
      
      // Update selected class on labels based on checked state
      function updateSelectedClasses() {
        document.querySelectorAll('.choice-label').forEach(label => {
          const radio = label.querySelector('input[type="radio"]');
          const checkbox = label.querySelector('input[type="checkbox"]');
          if (radio && radio.checked) {
            label.classList.add('selected');
            // Remove selected from other radio labels in the same group
            const radioName = radio.getAttribute('name');
            document.querySelectorAll('input[type="radio"][name="' + radioName + '"]').forEach(r => {
              if (r !== radio) {
                const otherLabel = r.closest('.choice-label');
                if (otherLabel) {
                  otherLabel.classList.remove('selected');
                }
              }
            });
          } else if (radio) {
            label.classList.remove('selected');
          }
          if (checkbox && checkbox.checked) {
            label.classList.add('selected');
          } else if (checkbox) {
            label.classList.remove('selected');
          }
        });
      }
      
      // Handle radio buttons (non-matrix)
      document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', function() {
          // Don't allow changing answer if input is disabled (answer has been checked)
          if (this.disabled) {
            return;
          }
          const isMatrix = this.getAttribute('data-matrix') === '1';
          if (isMatrix) {
            return;
          }
          if (this.checked) {
            updateSelectedClasses();
            // Send answer with both index and text for proper mapping
            const choiceIndex = this.getAttribute('data-choice-index');
            const choiceText = this.getAttribute('data-choice-text') || this.value;
            // Send as object with index for reliable mapping
            sendAnswer({ index: choiceIndex !== null ? parseInt(choiceIndex, 10) : null, text: choiceText });
          }
        });
      });
      
      // Handle checkboxes
      document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
          updateSelectedClasses();
          // Get the actual choice texts from data-choice-text attributes
          const selected = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.getAttribute('data-choice-text') || cb.value);
          
          // For multi_select_with_time, include months value
          if (questionType === 'multi_select_with_time') {
            const monthsInput = document.querySelector('.months-input');
            const months = monthsInput ? (monthsInput.value || '') : '';
            sendAnswer({ selected: selected, months: months });
          } else {
            sendAnswer(selected);
          }
        });
      });
      
      // Initial update of selected classes
      updateSelectedClasses();
      
      // Matrix radio handlers for experience background questions
      (function setupMatrixHandlers() {
        const matrixTable = document.querySelector('table.matrix-table[data-matrix-question="1"]');
        if (!matrixTable) {
          return;
        }

        const scaleFromDom = (function() {
          const headerCells = matrixTable.querySelectorAll('thead .matrix-header-cell:not(.matrix-header-empty)');
          const scaleVals = [];
          headerCells.forEach((th) => {
            const txt = (th.textContent || '').trim();
            if (txt) scaleVals.push(txt);
          });
          return scaleVals;
        })();

        function buildMatrixAnswerFromDom() {
          const responses = {};
          const rows = matrixTable.querySelectorAll('tbody .matrix-row');
          rows.forEach((row) => {
            const labelCell = row.querySelector('.matrix-label-cell');
            if (!labelCell) return;
            let itemLabel = '';
            const labelSpan = labelCell.querySelector('.matrix-row-label');
            if (labelSpan) {
              itemLabel = (labelSpan.textContent || '').trim();
            }
            if (!itemLabel) return;
            const checked = row.querySelector('input[type="radio"][data-matrix="1"]:checked');
            let level = null; // treat no selection as null
            if (checked) {
              const idxStr = checked.value || '0';
              const idx = parseInt(idxStr, 10);
              if (!isNaN(idx) && idx >= 0 && idx < scaleFromDom.length) {
                level = scaleFromDom[idx];
              }
            }
            responses[itemLabel] = level;
          });

          const otherInput = matrixTable.querySelector('.matrix-other-input');
          const otherTextVal = otherInput ? (otherInput.value || '') : '';
          
          // Collect months per choice for multi_select_with_time
          const monthsPerChoice = {};
          if (questionType === 'multi_select_with_time') {
            const monthsInputs = matrixTable.querySelectorAll('.matrix-months-input');
            monthsInputs.forEach(input => {
              const choice = input.getAttribute('data-choice');
              if (choice) {
                const response = responses[choice];
                const noneValue = scaleFromDom[0] || 'None';
                // Auto-populate months to "0" if "None" is selected
                if (response === noneValue) {
                  monthsPerChoice[choice] = '0';
                  // Also update the input field visually
                  input.value = '0';
                } else {
                monthsPerChoice[choice] = input.value || '';
                }
              }
            });
          }

          const answerObj = {
            scale: scaleFromDom,
            responses: responses,
            other: otherTextVal,
          };
          
          // Include months for multi_select_with_time
          if (questionType === 'multi_select_with_time') {
            answerObj.months = monthsPerChoice;
          }
          
          return answerObj;
        }

        matrixTable.querySelectorAll('input[type="radio"][data-matrix="1"]').forEach(radio => {
          radio.addEventListener('change', function() {
            updateSelectedClasses();
            
            // Auto-populate months to "0" when "None" is selected for multi_select_with_time
            if (questionType === 'multi_select_with_time') {
              const row = this.closest('.matrix-row');
              if (row) {
                const labelCell = row.querySelector('.matrix-label-cell');
                if (labelCell) {
                  const labelSpan = labelCell.querySelector('.matrix-row-label');
                  if (labelSpan) {
                    const choice = (labelSpan.textContent || '').trim();
                    if (choice && choice !== 'Other') {
                      const idxStr = this.value || '0';
                      const idx = parseInt(idxStr, 10);
                      const noneValue = scaleFromDom[0] || 'None';
                      const monthsInput = row.querySelector('.matrix-months-input');
                      if (monthsInput) {
                        // If "None" is selected, auto-populate months to "0"
                        if (idx === 0 || scaleFromDom[idx] === noneValue) {
                          monthsInput.value = '0';
                        } else {
                          // If switching away from "None" and field is "0", clear it for user to enter actual value
                          if (monthsInput.value === '0') {
                            monthsInput.value = '';
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            
            const answerObj = buildMatrixAnswerFromDom();
            sendAnswer(answerObj);
          });
        });

        const otherInput = matrixTable.querySelector('.matrix-other-input');
        if (otherInput) {
          otherInput.addEventListener('input', function() {
            const answerObj = buildMatrixAnswerFromDom();
            sendAnswer(answerObj);
          });
        }
        
        // Handle months inputs for multi_select_with_time (one per row)
        const monthsInputs = matrixTable.querySelectorAll('.matrix-months-input');
        if (monthsInputs.length > 0 && questionType === 'multi_select_with_time') {
          monthsInputs.forEach(monthsInput => {
            monthsInput.addEventListener('input', function() {
              const answerObj = buildMatrixAnswerFromDom();
              sendAnswer(answerObj);
            });
          });
        }

        // Ensure initial "selected" classes are in sync
        updateSelectedClasses();
      })();
      
      // Handle "Other" text inputs
      document.querySelectorAll('.other-input').forEach(input => {
        input.addEventListener('input', function() {
          const label = this.closest('label');
          const radio = label.querySelector('input[type="radio"]');
          const checkbox = label.querySelector('input[type="checkbox"]');
          if (questionType === 'multi_select' || questionType === 'multi_select_with_time') {
            const selected = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
              .map(cb => cb.getAttribute('data-choice-text') || cb.value);
            const answerObj = { selected: selected, other: this.value };
            // Include months for multi_select_with_time
            if (questionType === 'multi_select_with_time') {
              const monthsInput = document.querySelector('.months-input');
              answerObj.months = monthsInput ? (monthsInput.value || '') : '';
            }
            sendAnswer(answerObj);
          } else {
            if (radio) {
              radio.checked = true;
              // Send answer with both index and text for proper mapping
              const choiceIndex = radio.getAttribute('data-choice-index');
              const choiceText = radio.getAttribute('data-choice-text') || radio.value;
              // Send as object with index for reliable mapping
              sendAnswer({ index: choiceIndex !== null ? parseInt(choiceIndex, 10) : null, text: choiceText });
            }
          }
        });
        input.addEventListener('click', function(e) {
          e.stopPropagation();
          const radio = this.closest('label').querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
          const checkbox = this.closest('label').querySelector('input[type="checkbox"]');
          if (checkbox) checkbox.checked = true;
        });
      });
      
      // Handle months input for multi_select_with_time questions
      const monthsInput = document.querySelector('.months-input');
      if (monthsInput && questionType === 'multi_select_with_time') {
        monthsInput.addEventListener('input', function() {
          const selected = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.getAttribute('data-choice-text') || cb.value);
          const otherInput = document.querySelector('.other-input');
          const otherValue = otherInput ? (otherInput.value || '') : '';
          sendAnswer({ selected: selected, months: this.value || '', other: otherValue });
        });
      }

      // Integer input handler for integer questions
      (function setupIntegerInputHandler() {
        const integerInput = document.querySelector('.integer-input');
        if (!integerInput) {
          return;
        }

        integerInput.addEventListener('input', function() {
          const value = this.value.trim();
          // Only send answer if it's a valid number
          if (value !== '' && !isNaN(parseInt(value, 10))) {
            sendAnswer(value);
          } else if (value === '') {
            // Send empty string to clear the answer
            sendAnswer('');
          }
        });

        // Also handle on blur to ensure the value is sent
        integerInput.addEventListener('blur', function() {
          const value = this.value.trim();
          if (value !== '' && !isNaN(parseInt(value, 10))) {
            sendAnswer(value);
          }
        });

        // Prevent non-numeric input
        integerInput.addEventListener('keydown', function(e) {
          // Allow: backspace, delete, tab, escape, enter, decimal point, and numbers
          if ([46, 8, 9, 27, 13, 110, 190].indexOf(e.keyCode) !== -1 ||
            // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            (e.keyCode === 65 && (e.ctrlKey || e.metaKey)) ||
            (e.keyCode === 67 && (e.ctrlKey || e.metaKey)) ||
            (e.keyCode === 86 && (e.ctrlKey || e.metaKey)) ||
            (e.keyCode === 88 && (e.ctrlKey || e.metaKey)) ||
            // Allow: home, end, left, right
            (e.keyCode >= 35 && e.keyCode <= 39)) {
            return;
          }
          // Ensure that it is a number and stop the keypress
          if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
            e.preventDefault();
          }
        });
      })();
      
      // Prevent copying, cutting, and pasting for MCQA questions
      // Block copy/cut/paste events
      document.addEventListener('copy', function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, true);
      
      document.addEventListener('cut', function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, true);
      
      document.addEventListener('paste', function(e) {
        // Only block paste on question text and choices, allow in input fields
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          // Allow paste in input fields (for "Other" text inputs)
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, true);
      
      // Block keyboard shortcuts (Ctrl+C, Cmd+C, Ctrl+A, Cmd+A, Ctrl+X, Cmd+X)
      document.addEventListener('keydown', function(e) {
        // Allow shortcuts in input fields
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        
        // Block Ctrl+C / Cmd+C (copy)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        // Block Ctrl+X / Cmd+X (cut)
        if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        // Block Ctrl+A / Cmd+A (select all) - but allow in input fields
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        // Block Ctrl+V / Cmd+V (paste) - but allow in input fields
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }, true);
      
      // Disable right-click context menu
      document.addEventListener('contextmenu', function(e) {
        // Allow context menu on input fields
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, true);
      
      // Prevent text selection via mouse drag
      document.addEventListener('selectstart', function(e) {
        const target = e.target;
        // Allow selection in input fields
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        return false;
      }, true);
    })();
  </script>
</body>
</html>`;
  }, [currentIndex, questions, checkedAnswers]); // Regenerate when question changes or when answer is checked

  // Listen for messages from iframe (must be before conditional returns)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'skillCheckAnswer') {
        const { questionId, answer, questionType } = event.data;
        if ((questionType === 'multi_select' || questionType === 'multi_select_with_time') && typeof answer === 'object' && answer !== null && (answer as any).other !== undefined) {
          setOtherText(prev => ({
            ...prev,
            [questionId]: (answer as any).other || ''
          }));
        }
        handleAnswer(questionId, answer);
      } else if (event.data.type === 'skillCheckCodeUpdate') {
        const { questionId, language, code } = event.data;
        const currentAnswer = answers[questionId] || {};
        handleAnswer(questionId, {
          ...currentAnswer,
          pythonCode: language === 'python' ? code : (currentAnswer.pythonCode || ''),
          jsCode: language === 'javascript' ? code : (currentAnswer.jsCode || ''),
        });
      } else if (event.data.type === 'skillCheckLanguageChange') {
        const { language } = event.data;
        // In retake mode, force Python only - ignore language change attempts
        if (mode === 'retake') {
          setCodingLanguage('python');
        } else {
          setCodingLanguage(language as 'python' | 'javascript');
        }
        // Reset test results when switching languages
        setTestResults({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: false });
      } else if (event.data.type === 'skillCheckPasteBlocked') {
        // Show snackbar when paste is blocked
        showSnackbar('⚠️ We cannot let users paste text longer than ' + PASTE_CHAR_LIMIT + ' characters to prevent cheating. Sorry for the inconvenience!', 5000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleAnswer, answers, showSnackbar, PASTE_CHAR_LIMIT]);

  // Send test results to iframe when they change
  useEffect(() => {
    if (iframeRef.current?.contentWindow && questions.length > 0 && currentIndex < questions.length) {
      const currentQuestion = questions[currentIndex];
      if (currentQuestion && currentQuestion.type === 'coding') {
        iframeRef.current.contentWindow.postMessage({
          type: 'skillCheckTestResults',
          allPassed: testResults.allPassed,
          errorMessage: testResults.errorMessage,
          stdout: testResults.stdout,
          stderr: testResults.stderr,
          loading: testResults.loading
        }, '*');
      }
    }
  }, [testResults, currentIndex, questions]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-3rem)]">
        <div className="text-center">
          <LoadingSpinner size="xl" color="blue" className="mx-auto mb-4" />
          <p className="text-gray-400">Loading questions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No questions available</p>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Safety check: ensure we have a valid question before rendering
  if (!questions.length || currentIndex >= questions.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <LoadingSpinner size="lg" color="blue" className="mx-auto mb-4" />
          <p className="text-gray-400">Loading questions...</p>
        </div>
      </div>
    );
  }

  // Safety check: ensure we have a valid question before rendering
  // This prevents accessing currentQuestion when questions array is empty or index is invalid
  if (!questions.length || currentIndex >= questions.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <LoadingSpinner size="lg" color="blue" className="mx-auto mb-4" />
          <p className="text-gray-400">Loading questions...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const currentAnswer = answers[currentQuestion.id];

  // Use a key that changes when mode changes to force React to destroy/recreate the component
  // This prevents old question state from briefly showing
  const questionKey = `${mode}_${retakeSessionId || 'none'}_${currentQuestion.id}`;
  
  return (
    <div className="flex flex-col flex-1 min-h-0" key={questionKey}>
      <div ref={topRef} />
      {/* Progress Bar */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="text-sm text-gray-400">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question Header - Instruction, Badge, Report Button */}
      {(() => {
        const badgeText = currentQuestion.type === 'experience' ? 'Background Question' :
                         currentQuestion.type === 'nasa_tli' ? 'Reflection Question' :
                         currentQuestion.type === 'frontend' ? 'Frontend Knowledge' :
                         currentQuestion.type === 'ux' ? 'UX Knowledge' :
                         currentQuestion.type === 'coding' ? (currentQuestion.code_type === 'debug' ? 'Debugging' : 'Coding') :
                         '';
        
        const badgeColor = currentQuestion.type === 'experience' ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' :
                          currentQuestion.type === 'nasa_tli' ? 'bg-green-600/20 text-green-400 border-green-500/30' :
                          currentQuestion.type === 'frontend' ? 'bg-orange-600/20 text-orange-400 border-orange-500/30' :
                          currentQuestion.type === 'ux' ? 'bg-pink-600/20 text-pink-400 border-pink-500/30' :
                          currentQuestion.type === 'coding' ? (currentQuestion.code_type === 'debug' ? 'bg-red-600/20 text-red-400 border-red-500/30' : 'bg-purple-600/20 text-purple-400 border-purple-500/30') :
                          '';
        
        const instructionText = currentQuestion.type === 'experience' ? 'Please answer the following background question' :
                               currentQuestion.type === 'nasa_tli' ? 'Please answer the following reflection question' :
                               currentQuestion.type === 'frontend' ? 'Please answer the following frontend knowledge question' :
                               currentQuestion.type === 'ux' ? 'Please answer the following UX knowledge question' :
                               currentQuestion.type === 'coding' ? (currentQuestion.code_type === 'debug' 
                                 ? 'Please debug the existing code implementation to pass all test cases'
                                 : 'Please implement the function below to pass all test cases') :
                               'Please answer the following question';
        
        const typeWordColor = currentQuestion.type === 'experience' ? 'text-blue-400' :
                             currentQuestion.type === 'nasa_tli' ? 'text-green-400' :
                             currentQuestion.type === 'frontend' ? 'text-orange-400' :
                             currentQuestion.type === 'ux' ? 'text-pink-400' :
                             currentQuestion.type === 'coding' ? 'text-purple-400' :
                             '';
        
        const typeWord = currentQuestion.type === 'experience' ? 'background' :
                        currentQuestion.type === 'nasa_tli' ? 'reflection' :
                        currentQuestion.type === 'frontend' ? 'frontend' :
                        currentQuestion.type === 'ux' ? 'UX' :
                        currentQuestion.type === 'coding' ? (currentQuestion.code_type === 'debug' ? 'debug' : 'implement') :
                        '';
        
        return (
          <div className="flex items-center justify-between mb-1 flex-shrink-0">
            <div className="flex items-center">
              <p className="text-gray-400 text-sm">
                {currentQuestion.type === 'coding' ? (
                  <>
                    Please <span className={`font-bold ${typeWordColor}`}>{typeWord}</span> {currentQuestion.code_type === 'debug' ? 'the existing code implementation to pass all test cases' : 'a new function to pass all test cases'}
                  </>
                ) : (
                  <>
                    Please answer the following <span className={`font-bold ${typeWordColor}`}>{typeWord}</span> question
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {currentQuestion.type === 'coding' && mode !== 'retake' && (
                // In pre-test/post-test mode, show both language options
                // In retake mode, hide language selection (Python only, no choice to make)
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCodingLanguage('python');
                      iframeRef.current?.contentWindow?.postMessage({ type: 'skillCheckLanguageChange', language: 'python' }, '*');
                    }}
                    className={`px-3 py-1 text-xs rounded border ${
                      codingLanguage === 'python'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    Python
                  </button>
                  <button
                    onClick={() => {
                      setCodingLanguage('javascript');
                      iframeRef.current?.contentWindow?.postMessage({ type: 'skillCheckLanguageChange', language: 'javascript' }, '*');
                    }}
                    className={`px-3 py-1 text-xs rounded border ${
                      codingLanguage === 'javascript'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    JavaScript
                  </button>
                </div>
              )}
              {/* Only show report button for non-experience and non-NASA TLI questions */}
              {currentQuestion.type !== 'experience' && currentQuestion.type !== 'nasa_tli' && (
                <div className={`relative group transition-opacity duration-200 ${showReportButton ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="w-8 h-8 rounded-full border border-transparent bg-transparent text-gray-400 hover:bg-gray-800 flex items-center justify-center transition-colors"
                  >
                    <Flag size={16} />
                  </button>
                  <div className="absolute left-1/2 bottom-full mb-2 transform -translate-x-1/2 px-2 py-1 bg-white text-black text-xs rounded border border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    Report / Give Up
                  </div>
                </div>
              )}
              <span className={`px-3 py-1 text-xs rounded-full border ${badgeColor}`}>
                {badgeText}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Question Content - Iframe for all questions */}
      <div className="flex-1 min-h-0 flex flex-col mt-2 mb-2 border-t border-b border-white border-opacity-20 py-4">
        <iframe
          key={`${mode}_${retakeSessionId || 'none'}_${currentQuestion.id}_${checkedAnswers.has(currentQuestion.id) ? 'checked' : 'unchecked'}`}
          ref={iframeRef}
          srcDoc={iframeContent}
          className="w-full flex-1 border-0 min-h-0"
          style={{ background: '#1a1f2e' }}
          title="Question Content"
        />
      </div>

      {/* Navigation Buttons - Sticky Footer */}
      <div className="sticky bottom-0 bg-gray-900 flex-shrink-0 z-10">
        <div className="flex items-center justify-between gap-2 pt-2 px-0">
          {/* Left side - Exit Survey button (ONLY in retake mode, NOT in pre-test/post-test) */}
          <div className="flex items-center">
            {mode === 'retake' && (
              <button
                onClick={onCancel}
                className="flex items-center px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Exit Skill Check
              </button>
            )}
          </div>
          {/* Right side - Existing buttons */}
          <div className="flex items-center gap-2">
            {currentQuestion.type === 'coding' && mode === 'retake' && !viewedSolutions.has(currentQuestion.id) && (
              <button
                onClick={handleViewSolution}
                disabled={viewedSolutions.has(currentQuestion.id)}
                className="flex items-center px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                View Solution (Give Up)
              </button>
            )}
            {currentQuestion.type === 'coding' && (
              <button
                onClick={runTestCases}
                disabled={testResults.loading || viewedSolutions.has(currentQuestion.id)}
                className="flex items-center px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testResults.loading ? 'Running Tests...' : 'Run All Test Cases'}
              </button>
            )}
            {/* For MCQA in retake mode: Show "Check Answer" first, then replace with "Next" after checking */}
            {mode === 'retake' && currentQuestion.question_type === 'mcqa' ? (
              !checkedAnswers.has(currentQuestion.id) ? (
                // Show "Check Answer" button before checking
                <button
                  onClick={handleCheckAnswer}
                  disabled={
                    !currentAnswer || 
                    currentAnswer === '' || 
                    (typeof currentAnswer === 'object' && (!currentAnswer.text || currentAnswer.text === ''))
                  }
                  className="flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Check Answer
                </button>
              ) : (
                // Show "Next" button after checking (replace "Check Answer")
                <button
                  onClick={handleNext}
                  disabled={false}
                  className="flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Skill Check'}
                </button>
              )
            ) : (
              // For all other cases (pre-test, post-test, non-MCQA), show normal "Next" button
              <button
                onClick={handleNext}
                disabled={
                  currentQuestion.type === 'coding' 
                 ? !viewedSolutions.has(currentQuestion.id) && (!(codingLanguage === 'python' ? currentAnswer?.pythonCode : currentAnswer?.jsCode) || testResults.allPassed !== true)
                : currentQuestion.question_type === 'multi_select'
                  ? (() => {
                      // Get all available choices for this question
                      const choices = Array.isArray(currentQuestion.choices) ? currentQuestion.choices : [];
                      if (choices.length === 0) {
                        // Fallback: if no choices array, allow proceeding (backward compatibility)
                        return !currentAnswer || (Array.isArray(currentAnswer) && currentAnswer.length === 0);
                      }
                      
                      if (!currentAnswer) {
                        return true; // No answer
                      }
                      
                      // Extract selected choices based on answer format
                      let selectedChoices: string[] = [];
                      
                      // Handle matrix-style answers (object with responses property)
                      if (typeof currentAnswer === 'object' && !Array.isArray(currentAnswer) && currentAnswer.responses) {
                        // For matrix-style, require ALL choices (except "Other") to have a response
                        const responses = currentAnswer.responses || {};
                        const requiredChoices = choices.filter(choice => choice !== 'Other');
                        
                        // Must have responses for all required choices
                        if (requiredChoices.length === 0) {
                          return false; // No required choices, allow proceeding
                        }
                        
                        const allChoicesHaveResponse = requiredChoices.every(choice => {
                          const val = responses[choice];
                          return val !== undefined && val !== null && String(val).trim() !== '';
                        });
                        
                        if (!allChoicesHaveResponse) {
                          return true; // Not all required choices have a response
                        }
                        
                        // If "Other" is in choices and has a non-"None" response, ensure otherText is filled
                        const scale = Array.isArray(currentAnswer.scale) ? currentAnswer.scale : [];
                        const noneValue = scale[0] || 'None';
                        if (choices.includes('Other') && responses['Other'] && responses['Other'] !== noneValue && !currentAnswer.other?.trim() && !otherText[currentQuestion.id]?.trim()) {
                          return true; // "Other" has a non-"None" response but no text provided
                        }
                        
                        return false; // All validations passed for matrix-style
                      }
                      
                      // Handle object format with 'selected' property (checkbox-style with "Other" field)
                      if (typeof currentAnswer === 'object' && !Array.isArray(currentAnswer) && currentAnswer.selected) {
                        selectedChoices = Array.isArray(currentAnswer.selected) ? currentAnswer.selected : [];
                      }
                      // Handle array format (checkbox-style without "Other" field)
                      else if (Array.isArray(currentAnswer)) {
                        selectedChoices = currentAnswer;
                      } else {
                        return true; // Invalid format
                      }
                      
                      // For checkbox-style multi_select, require ALL choices (except "Other") to be selected
                      const requiredChoices = choices.filter(choice => choice !== 'Other');
                      
                      // Must have selections for all required choices
                      if (requiredChoices.length === 0) {
                        // No required choices (only "Other" exists), allow proceeding
                        return false;
                      }
                      
                      // Must have at least as many selections as required choices (excluding "Other")
                      const selectedRequiredChoices = selectedChoices.filter(choice => choice !== 'Other');
                      if (selectedRequiredChoices.length < requiredChoices.length) {
                        return true; // Not all required choices are selected
                      }
                      
                      // Verify that every required choice is in the selected list
                      const allChoicesSelected = requiredChoices.every(choice => selectedChoices.includes(choice));
                      
                      if (!allChoicesSelected) {
                        return true; // Not all required choices selected
                      }
                      
                      // If "Other" is selected, ensure otherText is filled
                      if (selectedChoices.includes('Other')) {
                        const otherValue = (typeof currentAnswer === 'object' && !Array.isArray(currentAnswer) && currentAnswer.other) 
                          ? currentAnswer.other 
                          : otherText[currentQuestion.id];
                        if (!otherValue?.trim()) {
                          return true; // "Other" selected but no text provided
                        }
                      }
                      
                      return false; // All validations passed
                    })()
                  : currentQuestion.question_type === 'multi_select_with_time'
                          ? (() => {
                        if (!currentAnswer) {
                          return true; // No answer
                        }
                        
                        // Get all available choices for this question
                        const choices = Array.isArray(currentQuestion.choices) ? currentQuestion.choices : [];
                        
                        // Handle array format (checkbox-style)
                        if (Array.isArray(currentAnswer)) {
                          if (choices.length === 0) {
                            // Fallback: if no choices array, use old logic
                            return currentAnswer.length === 0 || (currentAnswer.length === 1 && currentAnswer[0] === 'Other' && !otherText[currentQuestion.id]);
                          }
                          
                          // Require ALL choices (except "Other") to be selected
                          const requiredChoices = choices.filter(choice => choice !== 'Other');
                          
                          if (requiredChoices.length === 0) {
                            // No required choices (only "Other" exists), allow proceeding
                            return false;
                          }
                          
                          // Must have at least as many selections as required choices (excluding "Other")
                          const selectedRequiredChoices = currentAnswer.filter((choice: string) => choice !== 'Other');
                          if (selectedRequiredChoices.length < requiredChoices.length) {
                            return true; // Not all required choices are selected
                          }
                          
                          // Verify that every required choice is in the selected list
                          const allChoicesSelected = requiredChoices.every(choice => currentAnswer.includes(choice));
                          if (!allChoicesSelected) {
                            return true; // Not all required choices selected
                          }
                          
                          // If "Other" is selected, ensure otherText is filled
                          if (currentAnswer.includes('Other') && !otherText[currentQuestion.id]?.trim()) {
                            return true; // "Other" selected but no text provided
                          }
                          
                          return false; // All validations passed for array format
                        }
                        
                        // Handle object format (matrix-style or checkbox-style with selected property)
                        if (typeof currentAnswer === 'object' && !Array.isArray(currentAnswer)) {
                          // For matrix-style answers (with responses), require ALL choices (except "Other") to have a response
                          if (currentAnswer.responses && Object.keys(currentAnswer.responses).length > 0) {
                            // First, check that ALL required choices have a response
                            const responses = currentAnswer.responses || {};
                            const requiredChoices = choices.filter(choice => choice !== 'Other');
                            
                            // Must have responses for all required choices
                            if (requiredChoices.length === 0) {
                              // No required choices, but still need to check months validation below
                            } else {
                              const allChoicesHaveResponse = requiredChoices.every(choice => {
                                const val = responses[choice];
                                return val !== undefined && val !== null && String(val).trim() !== '';
                              });
                              
                              if (!allChoicesHaveResponse) {
                                return true; // Not all required choices have a response
                              }
                            }
                            
                              // Check if any tool has a non-"None" response but missing months
                              const scale = Array.isArray(currentAnswer.scale) ? currentAnswer.scale : [];
                              const noneValue = scale[0] || 'None';
                            
                            // If "Other" is in choices and has a non-"None" response, ensure otherText is filled
                            if (choices.length > 0 && choices.includes('Other') && responses['Other'] && responses['Other'] !== noneValue && !currentAnswer.other?.trim() && !otherText[currentQuestion.id]?.trim()) {
                              return true; // "Other" has a non-"None" response but no text provided
                            }
                            for (const [choice, response] of Object.entries(responses)) {
                              // Skip "Other" - it doesn't need months validation
                              if (choice === 'Other') {
                                continue;
                              }
                                if (response !== noneValue) {
                                  // This tool has a frequency selected, check if months is provided
                                  if (!currentAnswer.months || typeof currentAnswer.months !== 'object') {
                                    return true; // Missing months object
                                  }
                                  const monthsForChoice = String(currentAnswer.months[choice] || '');
                                  if (!monthsForChoice || isNaN(parseInt(monthsForChoice)) || parseInt(monthsForChoice) < 1) {
                                    return true; // Missing or invalid months for this choice
                                  }
                                }
                              }
                            return false; // All choices have responses and all tools with selected frequencies have valid months
                          }
                          
                          // For checkbox-style answers (with selected property)
                          if (currentAnswer.selected) {
                            if (choices.length === 0) {
                              // Fallback: if no choices array, use old logic
                              const nonOtherSelections = currentAnswer.selected.filter((choice: string) => choice !== 'Other');
                              return currentAnswer.selected.length === 0 || 
                             (currentAnswer.selected.length === 1 && currentAnswer.selected[0] === 'Other' && !otherText[currentQuestion.id]) ||
                                     (nonOtherSelections.length > 0 && (
                             !currentAnswer.months || 
                             (typeof currentAnswer.months === 'object' 
                                         ? Object.entries(currentAnswer.months).some(([choice, m]: [string, any]) => {
                                             // Skip "Other" from months validation
                                             if (choice === 'Other') return false;
                                   const monthsStr = String(m || '');
                                   return !monthsStr || isNaN(parseInt(monthsStr)) || parseInt(monthsStr) < 1;
                                 })
                                         : isNaN(parseInt(String(currentAnswer.months))) || parseInt(String(currentAnswer.months)) < 1)
                                     ));
                            }
                            
                            // Require ALL choices (except "Other") to be selected
                            const requiredChoices = choices.filter(choice => choice !== 'Other');
                            
                            if (requiredChoices.length === 0) {
                              // No required choices (only "Other" exists), but still need to check months
                            } else {
                              // Must have at least as many selections as required choices (excluding "Other")
                              const selectedRequiredChoices = (currentAnswer.selected || []).filter((choice: string) => choice !== 'Other');
                              if (selectedRequiredChoices.length < requiredChoices.length) {
                                return true; // Not all required choices are selected
                              }
                              
                              // Verify that every required choice is in the selected list
                              const allChoicesSelected = requiredChoices.every(choice => (currentAnswer.selected || []).includes(choice));
                              if (!allChoicesSelected) {
                                return true; // Not all required choices selected
                              }
                            }
                            
                            // If "Other" is selected, ensure otherText is filled
                            if (currentAnswer.selected.includes('Other') && !otherText[currentQuestion.id]?.trim()) {
                              return true; // "Other" selected but no text provided
                            }
                            
                            // Check months validation
                            if (!currentAnswer.months) {
                              return true; // Missing months
                            }
                            
                            if (typeof currentAnswer.months === 'object') {
                              // Check if all selected choices (except "Other") have valid months
                              const hasInvalidMonths = currentAnswer.selected.some((choice: string) => {
                                // Skip "Other" - it doesn't need months validation
                                if (choice === 'Other') {
                                  return false;
                                }
                                const monthsStr = String(currentAnswer.months[choice] || '');
                                return !monthsStr || isNaN(parseInt(monthsStr)) || parseInt(monthsStr) < 1;
                              });
                              if (hasInvalidMonths) {
                                return true; // Some selected choices have invalid months
                              }
                            } else {
                              // Single months value - only validate if "Other" is not the only selection
                              const nonOtherSelections = currentAnswer.selected.filter((choice: string) => choice !== 'Other');
                              if (nonOtherSelections.length > 0) {
                                // Only validate months if there are non-"Other" selections
                                if (isNaN(parseInt(String(currentAnswer.months))) || parseInt(String(currentAnswer.months)) < 1) {
                                  return true; // Invalid months value
                                }
                              }
                            }
                            
                            return false; // All validations passed
                          }
                        }
                        
                        return true; // Unknown format
                      })()
                  : currentQuestion.question_type === 'integer'
                    ? !currentAnswer || currentAnswer === '' || isNaN(parseInt(String(currentAnswer), 10))
                  : !currentAnswer
            }
                className="flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Skill Check'}
              </button>
            )
          }
          </div>
        </div>
      </div>
      
      {/* Report Modal */}
      <ReportModal
        show={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReportSubmit}
        isSubmitting={isSubmittingReport}
      />
    </div>
  );
}

