"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Editor } from "@monaco-editor/react";
import Markdown from "react-markdown";
import { Flag } from "lucide-react";
import { ENV } from "../config/env";
import { useAuth } from "../utils/auth";
import { useSnackbar } from "./SnackbarProvider";
import ReportModal from "./ReportModal";

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
}

interface SkillCheckFlowProps {
  mode: 'pre-test' | 'post-test';
  initialIndex?: number;
  onComplete: () => void;
  onCancel: () => void;
  onQuestionChange?: (questionType: string, codeType?: string) => void;
}

export default function SkillCheckFlow({ mode, initialIndex = 0, onComplete, onCancel, onQuestionChange }: SkillCheckFlowProps) {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const userId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  
  // Configurable paste character limit (default: 100)
  const PASTE_CHAR_LIMIT = 100;
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

  useEffect(() => {
    loadQuestions();
  }, [mode]);

  // Update currentIndex when initialIndex changes (for resuming)
  useEffect(() => {
    if (initialIndex >= 0 && questions.length > 0 && initialIndex < questions.length) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, questions.length]);

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

  // Clear test results when switching between Python and JavaScript
  useEffect(() => {
    setTestResults({ allPassed: null, errorMessage: null, stdout: '', stderr: '', loading: false });
  }, [codingLanguage]);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const userParam = userId ? `&user_id=${encodeURIComponent(String(userId))}` : '';
      const response = await fetch(`/api/skill-check/questions?mode=${mode}${userParam}`);
      if (!response.ok) {
        throw new Error('Failed to load questions');
      }
      const data = await response.json();
      
      // Use all questions (no filtering)
      const filteredQuestions: Question[] = data.questions || [];
      
      
      setQuestions(filteredQuestions);
      setLoading(false);
      // Set initial index if provided and valid
      const startIndex = (initialIndex >= 0 && initialIndex < filteredQuestions.length) ? initialIndex : 0;
      setCurrentIndex(startIndex);
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
    console.log('Answers:', answers);
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
        // Object format, typically { selected: [...], other: string }
        if (Array.isArray((answer as any).selected)) {
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
      // Map selected values/keys to answerText and answerLetter when we have choices
      if (choices.length) {
        if (usesLetterKeys) {
          // Keys like "A", "B", "C" -> index + text
          selectedKeys.forEach((key) => {
            const upper = key.toUpperCase();
            const index = upper.charCodeAt(0) - 65; // A=0, B=1, ...
            if (index >= 0 && index < choices.length) {
              answerText.push(choices[index]);
              answerLetter.push(upper);
            }
          });
        } else {
          // Values are the actual choice texts
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
      
      await fetch(`${ENV.BACKEND_URL}/api/skill-check/log-mcqa-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          question_id: question.id,
          question_type: questionType,
          phase: mode,
          answer_text: answerText,
          answer_letter: answerLetter,
        }),
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
    const logNavigationEvent = async (timeAwayMs: number | null = null) => {
      const currentQuestion = questions[currentIndex];
      if (!currentQuestion) return; // Safety check
      
      try {
        await fetch(`${ENV.BACKEND_URL}/api/skill-check/log-navigation-event`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            question_id: currentQuestion.id || null, // Works for all question types
            test_type: mode, // 'pre-test' or 'post-test'
            time_away_ms: timeAwayMs,
          }),
        });
      } catch (error) {
        console.error('Failed to log navigation event:', error);
      }
    };

    // Track visibility changes (tab switching, minimizing window, etc.)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User navigated away (tab hidden, window minimized, etc.)
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
          logNavigationEvent(durationAway); // Log when they return with duration
          navigationAwayTimeRef.current = null;
        }
      }
    };

    // Track window blur/focus (losing focus to another window/app)
    const handleBlur = () => {
      if (!isNavigatedAwayRef.current) {
        isNavigatedAwayRef.current = true;
        navigationAwayTimeRef.current = Date.now();
        logNavigationEvent(null); // Log when they leave (no duration yet)
      }
    };

    const handleFocus = () => {
      if (isNavigatedAwayRef.current && navigationAwayTimeRef.current) {
        const durationAway = Date.now() - navigationAwayTimeRef.current;
        isNavigatedAwayRef.current = false;
        logNavigationEvent(durationAway); // Log when they return with duration
        navigationAwayTimeRef.current = null;
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

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [questions, currentIndex, userId, mode]);

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
          phase: mode,
          py_code: data.py_code || '',
          js_code: data.js_code || '',
          submitted_language: data.submitted_language,
          state: data.state,
        }),
      });
    } catch (error) {
      console.error('Failed to log code response:', error);
    }
  }, [userId]);

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
          phase: mode,
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
      
      // Move to next question
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
      }
    } catch (error) {
      console.error('Failed to submit report:', error);
      alert('Failed to submit report. Please try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  }, [userId, questions, currentIndex, mode, onQuestionChange]);

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
      padding: 12px 32px 12px 16px;
      margin-bottom: 12px;
      font-size: 13px;
      line-height: 1.7;
      color: #ce9178;
      white-space: pre-wrap;
      word-wrap: break-word;
      flex-shrink: 0;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      pointer-events: none;
      position: relative;
    }
    .docstring-container.collapsed {
      padding: 12px 32px 12px 16px;
    }
    .docstring-container.collapsed .docstring-content {
      display: none;
    }
    .docstring-header {
      display: none;
      font-weight: 600;
      color: #ce9178;
      font-size: 13px;
    }
    .docstring-container.collapsed .docstring-header {
      display: block;
    }
    .docstring-content {
      display: block;
    }
    .docstring-collapse-button {
      position: absolute;
      top: 8px;
      right: 8px;
      background: transparent;
      border: none;
      color: #9ca3af;
      width: 20px;
      height: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      padding: 0;
    }
    .docstring-collapse-button svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .docstring-collapse-button:hover {
      color: #e5e7eb;
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
      flex: 1 1 50%;
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
      flex: 1 1 50%;
      min-height: 0;
      border-bottom: 1px solid #374151;
      padding-bottom: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
    }
    .test-run-button:hover:not(:disabled) {
      background: #1d4ed8;
    }
    .test-run-button:disabled {
      background: #374151;
      color: #6b7280;
      cursor: not-allowed;
    }
    .test-output-mini {
      background: #000;
      border: 1px solid #374151;
      border-radius: 4px;
      padding: 6px 8px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 11px;
      color: #e5e7eb;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0 0 8px 0;
    }
    .test-output-mini.empty {
      color: #6b7280;
    }
    .test-output-mini .output-stdout {
      color: #ffffff;
    }
    .test-output-mini .output-stderr {
      color: #ef4444;
    }
    .test-output-mini .output-result {
      color: #10b981;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="coding-container">
    <div class="content-wrapper">
      <div class="docstring-container" id="docstring-container"></div>
      <div class="editor-wrapper">
      <div class="editor-container" id="editor-container"></div>
        <div class="resize-handle" id="resize-handle"></div>
        <div class="test-results-panel" id="test-results-panel">
          <div class="test-your-code-section" id="test-your-code-section">
            <div class="test-your-code-header">Custom Inputs</div>
            <div class="test-inputs-container" id="test-inputs-container"></div>
            <div class="test-output-mini empty" id="test-output-mini">Output will appear here</div>
            <button class="test-run-button" id="test-run-button">Run</button>
          </div>
          <div class="test-cases-section" id="test-cases-section">
            <div class="test-results-header" id="test-results-header">Test Case Logs</div>
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
      
      // Track collapsed state
      let isDocstringCollapsed = false;
      
      // Helper function to get chevron icon SVG
      function getChevronIcon(isDown) {
        if (!isDown) {
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
        } else {
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
        }
      }
      
      // Function to toggle docstring collapse
      function toggleDocstringCollapse() {
        const docstringContainer = document.getElementById('docstring-container');
        const collapseButton = document.getElementById('docstring-collapse-button');
        if (!docstringContainer || !collapseButton) return;
        
        isDocstringCollapsed = !isDocstringCollapsed;
        if (isDocstringCollapsed) {
          docstringContainer.classList.add('collapsed');
          collapseButton.innerHTML = getChevronIcon(false);
        } else {
          docstringContainer.classList.remove('collapsed');
          collapseButton.innerHTML = getChevronIcon(true);
        }
      }
      
      // Function to update docstring display based on current language
      function updateDocstring() {
        const docstringContainer = document.getElementById('docstring-container');
        if (!docstringContainer) return;
        
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
          const buttonIcon = getChevronIcon(!isDocstringCollapsed);
          docstringContainer.innerHTML = 
            '<div class="docstring-header">Task</div>' +
            '<div class="docstring-content"><span style="font-weight: 800;">Task:</span> ' + withCode + '</div>' +
            '<button class="docstring-collapse-button" id="docstring-collapse-button">' + buttonIcon + '</button>';
          if (isDocstringCollapsed) {
            docstringContainer.classList.add('collapsed');
          } else {
            docstringContainer.classList.remove('collapsed');
          }
          
          // Attach click handler to the button
          const collapseButton = document.getElementById('docstring-collapse-button');
          if (collapseButton) {
            collapseButton.addEventListener('click', toggleDocstringCollapse);
          }
          
          docstringContainer.style.display = 'block';
        } else {
          docstringContainer.style.display = 'none';
        }
      }
      
      // Initialize docstring display
      updateDocstring();
      
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
            readOnly: false,
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
              console.log('User is about to paste:', pastedText);
              
              // Block paste if content is over character limit
              if (pastedText && pastedText.length > pasteCharLimit) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Paste blocked: content exceeds ' + pasteCharLimit + ' characters (' + pastedText.length + ' characters)');
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
                  console.log('User is about to paste:', pastedText);
                  
                  // Block paste if content is over character limit
                  if (pastedText && pastedText.length > pasteCharLimit) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Paste blocked: content exceeds ' + pasteCharLimit + ' characters (' + pastedText.length + ' characters)');
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
              console.log('Paste listener attached to Monaco textarea');
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
          
          // Clear custom inputs output when language changes
          const customOutputBox = document.getElementById('test-output-mini');
          if (customOutputBox) {
            customOutputBox.innerHTML = '';
            customOutputBox.classList.add('empty');
          }
          
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
        
        // First, try to get parameters from the custom map
        let params = [];
        if (taskId && FUNCTION_PARAMS_MAP[taskId]) {
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
        const outputBox = document.getElementById('test-output-mini');
        
        if (!runButton || !outputBox) return;
        
        // Disable button and show loading
        runButton.disabled = true;
        runButton.textContent = 'Running...';
        outputBox.classList.remove('empty');
        outputBox.innerHTML = '<span style="color: #9ca3af;">Running code...</span>';
        
        try {
          const currentCode = currentLanguage === 'python' 
            ? (window.pythonCode !== undefined ? window.pythonCode : pythonCode)
            : (window.jsCode !== undefined ? window.jsCode : jsCode);
          
          // Get function name and parameters
          let functionName = '';
          let params = [];
          
          // First, try to get parameters from the custom map
          if (taskId && FUNCTION_PARAMS_MAP[taskId]) {
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
            const stderrSpan = document.createElement('div');
            stderrSpan.className = 'output-stderr';
            stderrSpan.textContent = data.stderr;
            outputBox.appendChild(stderrSpan);
          }
          
          if (data.stdout && data.stdout.trim()) {
            const stdoutSpan = document.createElement('div');
            stdoutSpan.className = 'output-stdout';
            stdoutSpan.textContent = data.stdout;
            outputBox.appendChild(stdoutSpan);
          }
          
          if (!data.stdout && !data.stderr) {
            const emptySpan = document.createElement('div');
            emptySpan.style.color = '#6b7280';
            emptySpan.textContent = 'No output';
            outputBox.appendChild(emptySpan);
          }
          
        } catch (error) {
          outputBox.innerHTML = '';
          outputBox.classList.remove('empty');
          const errorSpan = document.createElement('div');
          errorSpan.className = 'output-stderr';
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
            // Clear previous content
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
    } else if (currentQuestion.question_type === 'multi_select' || currentQuestion.question_type === 'integer') {
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
    body {
      background: #1a1f2e;
      color: #e5e7eb;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 0;
      line-height: 1.6;
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
    }
    .content-wrapper {
      padding: 16px;
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
    .choice-label:hover {
      border-color: #4b5563;
      background: #1f2937;
    }
    .choice-label.selected {
      background: rgba(37, 99, 235, 0.2);
      border-color: #3b82f6;
      color: #fff;
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
      flex: 1;
      display: block;
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
    /* Integer slider styling */
    .slider-container {
      margin-top: 12px;
      padding: 12px 10px 10px;
      border-radius: 8px;
      border: 1px solid #374151;
      background: rgba(15, 23, 42, 0.8);
    }
    .experience-slider {
      width: 100%;
      cursor: pointer;
    }
    .experience-slider::-webkit-slider-thumb {
      background: #3b82f6;
    }
    .slider-ticks {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      gap: 4px;
    }
    .slider-tick {
      flex: 1;
      font-size: 12px;
      color: #9ca3af;
      text-align: center;
      cursor: pointer;
      padding: 2px 0;
      border-radius: 999px;
      transition: background 0.15s, color 0.15s;
      user-select: none;
    }
    .slider-tick-active {
      background: rgba(59, 130, 246, 0.2);
      color: #e5e7eb;
      font-weight: 500;
    }
    .slider-current-value {
      margin-top: 8px;
      font-size: 13px;
      color: #d1d5db;
    }
    .slider-current-label {
      font-weight: 600;
      color: #3b82f6;
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
      function renderChoices(choices, questionId, questionType, initialAnswer, initialOtherText, isFrontend, isExperience, questionText) {
        if (questionType === 'mcqa') {
          if (!choices || !Array.isArray(choices)) {
            return '';
          }
          
          const result = choices.map((choice, idx) => {
            const isOther = choice === 'Other';
            // Use index for value to avoid backtick issues in HTML attributes
            const inputValue = idx.toString();
            // Check if initial answer matches the choice
            const isChecked = (initialAnswer === choice) ? 'checked' : '';
            const otherValue = isOther ? initialOtherText : '';
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
            
            const html = '<label class="choice-label ' + (isChecked ? 'selected' : '') + '">' +
              '<input type="radio" name="question-' + questionId + '" value="' + inputValue + '" data-choice-text="' + escapedChoiceText + '" ' + isChecked + ' />' +
              (isOther 
                ? '<span>Other</span><input type="text" class="other-input" value="' + (otherValue.replace(/"/g, '&quot;')) + '" placeholder="Please specify..." />'
                : '<span' + spanAttributes + '>' + spanContent + '</span>'
              ) +
              '</label>';
            return html;
          }).join('');
          
          return result;
        } else if (questionType === 'multi_select') {
          // Special handling for experience background multi_select questions
          const isProgrammingExperience = isExperience && questionText && questionText.indexOf('What programming / scripting languages are you proficient in?') === 0;
          const isAiToolsExperience = isExperience && questionText && questionText.indexOf('Which AI tools do you use specifically for coding?') === 0;

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

            (choices || []).forEach((choice) => {
              if (!responses[choice]) {
                responses[choice] = scale[0];
              }
            });

            const answerObj = {
              scale: scale,
              responses: responses,
              other: otherTextValue,
            };

            // Send initial default (all "None") answer up to parent so navigation logic works
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

            const rowsHtml = (choices || []).map((choice, rowIdx) => {
              const isOther = choice === 'Other';
              const currentLevel = responses[choice] || scale[0];
              const escapedChoice = choice
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

              const cells = scale.map((level, levelIdx) => {
                const checked = currentLevel === level ? 'checked' : '';
                return (
                  '<td class="matrix-cell">' +
                  '<input type="radio" class="matrix-radio" data-matrix="1" ' +
                  'name="matrix-' + questionId + '-' + rowIdx + '" ' +
                  'data-item="' + escapedChoice + '" value="' + levelIdx + '" ' + checked + ' />' +
                  '</td>'
                );
              }).join('');

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
                    '</tr>' +
                  '</thead>' +
                  '<tbody>' +
                    rowsHtml +
                  '</tbody>' +
                '</table>' +
              '</div>';

            return tableHtml;
          }

          const selectedChoices = initialAnswer && typeof initialAnswer === 'object' && !Array.isArray(initialAnswer)
            ? (initialAnswer.selected || [])
            : (Array.isArray(initialAnswer) ? initialAnswer : []);
          return choices.map((choice, idx) => {
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
        } else if (questionType === 'integer') {
          if (!choices || !Array.isArray(choices) || choices.length === 0) {
            return '';
          }

          // Determine initial index from existing answer if possible
          let initialIndex = 0;
          if (typeof initialAnswer === 'string') {
            const idx = choices.indexOf(initialAnswer);
            if (idx >= 0) {
              initialIndex = idx;
            }
          }

          const tickLabels = choices.map((choice, idx) => {
            const escaped = String(choice)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            const activeClass = idx === initialIndex ? ' slider-tick-active' : '';
            return '<span class="slider-tick' + activeClass + '" data-index="' + idx + '">' + escaped + '</span>';
          }).join('');

          const currentValueEscaped = String(choices[initialIndex])
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

          return '' +
            '<div class="slider-container" data-slider-question="1">' +
              '<input type="range" min="0" max="' + (choices.length - 1) + '" step="1" ' +
                'value="' + initialIndex + '" class="experience-slider" />' +
              '<div class="slider-ticks">' + tickLabels + '</div>' +
              '<div class="slider-current-value">Selected: <span class="slider-current-label">' + currentValueEscaped + '</span></div>' +
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
      
      const container = document.getElementById('choices-container');
      if (container) {
        const html = renderChoices(choicesArray, questionId, questionType, initialAnswer, initialOtherText, isFrontend, isExperience, questionText);
        container.innerHTML = html;
        
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
      
      // Configure marked for proper rendering
      if (typeof marked !== 'undefined') {
        marked.setOptions({
          breaks: true,
          gfm: true
        });
      }
      
      // Render markdown in question text using marked library
      const questionTextEl = document.getElementById('question-text');
      if (questionTextEl && questionText) {
        if (typeof marked !== 'undefined') {
          questionTextEl.innerHTML = marked.parse(questionText);
        } else {
          // Fallback if marked doesn't load
          questionTextEl.textContent = questionText;
        }
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
      document.querySelectorAll('.choice-label').forEach(label => {
        label.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const radio = this.querySelector('input[type="radio"]');
          const checkbox = this.querySelector('input[type="checkbox"]');
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
      document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
        input.addEventListener('click', function(e) {
          e.stopPropagation();
        });
        // Prevent scroll when input receives focus
        input.addEventListener('focus', function(e) {
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
          const isMatrix = this.getAttribute('data-matrix') === '1';
          if (isMatrix) {
            return;
          }
          if (this.checked) {
            updateSelectedClasses();
            // Get the actual choice text from data-choice-text attribute
            const choiceText = this.getAttribute('data-choice-text') || this.value;
            sendAnswer(choiceText);
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
          sendAnswer(selected);
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
            let level = scaleFromDom[0] || '';
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

          return {
            scale: scaleFromDom,
            responses: responses,
            other: otherTextVal,
          };
        }

        matrixTable.querySelectorAll('input[type="radio"][data-matrix="1"]').forEach(radio => {
          radio.addEventListener('change', function() {
            updateSelectedClasses();
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

        // Ensure initial "selected" classes are in sync
        updateSelectedClasses();
      })();
      
      // Handle "Other" text inputs
      document.querySelectorAll('.other-input').forEach(input => {
        input.addEventListener('input', function() {
          const label = this.closest('label');
          const radio = label.querySelector('input[type="radio"]');
          const checkbox = label.querySelector('input[type="checkbox"]');
          if (questionType === 'multi_select') {
            const selected = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
              .map(cb => cb.getAttribute('data-choice-text') || cb.value);
            sendAnswer({ selected: selected, other: this.value });
          } else {
            if (radio) {
              radio.checked = true;
              const choiceText = radio.getAttribute('data-choice-text') || radio.value;
              sendAnswer(choiceText);
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

      // Slider handlers for integer questions
      (function setupSliderHandlers() {
        const sliderContainer = document.querySelector('.slider-container[data-slider-question="1"]');
        if (!sliderContainer) {
          return;
        }

        const slider = sliderContainer.querySelector('input.experience-slider');
        const ticks = Array.from(sliderContainer.querySelectorAll('.slider-tick'));
        const currentLabelEl = sliderContainer.querySelector('.slider-current-label');
        const choices = choicesArray || [];

        function setActiveTick(index) {
          ticks.forEach((tick, idx) => {
            if (idx === index) {
              tick.classList.add('slider-tick-active');
            } else {
              tick.classList.remove('slider-tick-active');
            }
          });
        }

        function emitSliderAnswer(index) {
          const choice = (index >= 0 && index < choices.length) ? choices[index] : null;
          if (choice == null) return;
          if (currentLabelEl) {
            currentLabelEl.textContent = String(choice);
          }
          sendAnswer(choice);
        }

        if (slider) {
          slider.addEventListener('input', function() {
            const idx = parseInt(this.value || '0', 10);
            if (isNaN(idx)) return;
            setActiveTick(idx);
            emitSliderAnswer(idx);
          });

          // Emit initial value so parent has an answer when user sees slider
          const initialIdx = parseInt(slider.value || '0', 10) || 0;
          setActiveTick(initialIdx);
          emitSliderAnswer(initialIdx);
        }

        ticks.forEach((tick, idx) => {
          tick.addEventListener('click', function() {
            if (!slider) return;
            slider.value = String(idx);
            setActiveTick(idx);
            emitSliderAnswer(idx);
          });
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
  }, [currentIndex, questions]); // Regenerate only when question changes, NOT when answers change (handled via messages) or language changes

  // Listen for messages from iframe (must be before conditional returns)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'skillCheckAnswer') {
        const { questionId, answer, questionType } = event.data;
        if (questionType === 'multi_select' && typeof answer === 'object' && answer !== null && (answer as any).other !== undefined) {
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
        setCodingLanguage(language as 'python' | 'javascript');
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
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
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

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const currentAnswer = answers[currentQuestion.id];

  return (
    <div className="flex flex-col h-full min-h-0">
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
              {currentQuestion.type === 'coding' && (
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
              <span className={`px-3 py-1 text-xs rounded-full border ${badgeColor}`}>
                {badgeText}
              </span>
              <div className="relative group">
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
            </div>
          </div>
        );
      })()}

      {/* Question Content - Iframe for all questions */}
      <div className="flex-1 min-h-0 flex flex-col mt-2 mb-2 border-t border-b border-white border-opacity-20 py-4">
        <iframe
          key={currentQuestion.id}
          ref={iframeRef}
          srcDoc={iframeContent}
          className="w-full flex-1 border-0 min-h-0"
          style={{ background: '#1a1f2e' }}
          title="Question Content"
        />
      </div>

      {/* Navigation Buttons - Sticky Footer */}
      <div className="sticky bottom-0 bg-gray-900 flex-shrink-0 z-10">
        <div className="flex items-center justify-end gap-2 pt-2 px-0">
          {currentQuestion.type === 'coding' && (
            <button
              onClick={runTestCases}
              disabled={testResults.loading}
              className="flex items-center px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testResults.loading ? 'Running Tests...' : 'Run All Test Cases'}
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={
              currentQuestion.type === 'coding' 
                 ? !(codingLanguage === 'python' ? currentAnswer?.pythonCode : currentAnswer?.jsCode) || testResults.allPassed !== true
                : currentQuestion.question_type === 'multi_select'
                  ? !currentAnswer || (Array.isArray(currentAnswer) && (currentAnswer.length === 0 || (currentAnswer.length === 1 && currentAnswer[0] === 'Other' && !otherText[currentQuestion.id])))
                  : !currentAnswer
            }
            className="flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Skill Check'}
          </button>
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

