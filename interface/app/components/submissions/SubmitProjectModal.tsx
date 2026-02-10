"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import ProjectDetailsForm from "./ProjectDetailsForm";
import SubmissionQuestionsPane from "./SubmissionQuestionsPane";
import {
  SubmissionQuestionsForm,
  type SubmissionQuestion,
} from "./questions";
import Link from "next/link";
import { ENV } from "../../config/env";
import { ERROR_TRY_AGAIN } from "../../constants/errorMessages";
import { useAuth } from "../../context/auth";
import { TUTORIAL_SUBMISSION_QUESTIONS } from "../../constants/tutorialSubmissionQuestions";
import { isWebsiteTaskLabel } from "../../utils/taskLabels";
import { setTutorialCompletedInSettings } from "../../utils/userSettings";

// Re-export for consumers that import from SubmitProjectModal
export type { SubmissionQuestion } from "./questions";

const PROJECT_TITLE_LIMIT = 80;
const PROJECT_DESCRIPTION_LIMIT = 500;

export interface SubmitProjectModalProps {
  open: boolean;
  onClose: () => void;
  sidebarOpen?: boolean;
  taskName?: string | null;
  userId?: number | null;
  projectId?: number | null;
  task_id?: string;
  taskLabel?: string | null;
  createPreviewScreenshot: () => Promise<string>;
  collectSubmissionFiles: () => Record<string, string>;
  onProjectSubmitted?: () => void | Promise<void>;
  onSuccess: () => void;
  showSnackbar: (message: React.ReactNode, duration?: number) => void;
  onDownloadProject?: (title: string, description: string) => void;
  onProjectInfoChange?: (title: string, description: string) => void;
  editor?: any;
  taskIndex?: number;
  setTelemetry?: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function SubmitProjectModal({
  open,
  onClose,
  sidebarOpen = false,
  taskName,
  userId,
  projectId,
  task_id,
  taskLabel,
  createPreviewScreenshot,
  collectSubmissionFiles,
  onProjectSubmitted,
  onSuccess,
  showSnackbar,
  onDownloadProject,
  onProjectInfoChange,
  editor,
  taskIndex = 0,
  setTelemetry,
}: SubmitProjectModalProps) {
  const { user, token, refreshUser } = useAuth();

  const isWebsiteTask = isWebsiteTaskLabel(taskLabel);

  const [showSubmissionQuestionsCheck, setShowSubmissionQuestionsCheck] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectTitleError, setProjectTitleError] = useState<string | null>(null);
  const [projectDescriptionError, setProjectDescriptionError] = useState<
    string | null
  >(null);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(
    null
  );
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [isCheckingModeration, setIsCheckingModeration] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<{
    id: number;
    title: string;
    description: string | null;
    createdAt: string | null;
  } | null>(null);
  const [isCheckingExistingSubmission, setIsCheckingExistingSubmission] =
    useState(false);
  const [hasConsentedToOverride, setHasConsentedToOverride] = useState(false);
  const [submissionAnswers, setSubmissionAnswers] = useState<
    Record<string, string>
  >({});
  const [submissionQuestions, setSubmissionQuestions] = useState<
    SubmissionQuestion[]
  >([]);
  const [submissionQuestionsError, setSubmissionQuestionsError] =
    useState<string | null>(null);
  const [isLoadingSubmissionQuestions, setIsLoadingSubmissionQuestions] =
    useState(false);
  const [answersChecked, setAnswersChecked] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipText, setTooltipText] = useState("");
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const [tooltipTop, setTooltipTop] = useState(0);
  const [tooltipPlaceAbove, setTooltipPlaceAbove] = useState(true);
  const [previewBoxSize, setPreviewBoxSize] = useState({
    width: 480,
    height: 270,
  });

  const previewBoxContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedProjectTitleLength = projectTitle.trim().length;
  const trimmedProjectDescriptionLength = projectDescription.trim().length;
  const isSubmitDisabled = !!(
    isSubmittingProject ||
    isCheckingModeration ||
    isCheckingExistingSubmission ||
    (existingSubmission && !hasConsentedToOverride) ||
    (isWebsiteTask &&
      (isScreenshotLoading ||
        !trimmedProjectTitleLength ||
        !trimmedProjectDescriptionLength ||
        !previewScreenshot))
  );

  const countWords = useCallback((text: string): number => {
    return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  }, []);

  // Notify parent when project title/description changes
  useEffect(() => {
    if (onProjectInfoChange) {
      onProjectInfoChange(projectTitle, projectDescription);
    }
  }, [projectTitle, projectDescription, onProjectInfoChange]);

  // Reset state when modal closes; when opening for non-website, set default title/description
  useEffect(() => {
    if (!open) {
      setProjectTitle("");
      setProjectDescription("");
      setProjectTitleError(null);
      setProjectDescriptionError(null);
      setPreviewScreenshot(null);
      setScreenshotError(null);
      setSubmissionError(null);
      setIsSubmittingProject(false);
      setIsScreenshotLoading(false);
      setExistingSubmission(null);
      setIsCheckingExistingSubmission(false);
      setHasConsentedToOverride(false);
      setShowSubmissionQuestionsCheck(false);
      setSubmissionAnswers({});
      setSubmissionQuestions([]);
      setSubmissionQuestionsError(null);
      setAnswersChecked(false);
      return;
    }
    if (!isWebsiteTask && taskName) {
      setProjectTitle(taskName);
      setProjectDescription("");
    }
    // Non-website tasks skip title/description/image and go straight to post-submission questions
    if (!isWebsiteTask) {
      setShowSubmissionQuestionsCheck(true);
    }
    let cancelled = false;

    const checkExistingSubmission = async () => {
      if (!userId || !projectId) return;
      setIsCheckingExistingSubmission(true);
      try {
        const params = new URLSearchParams();
        if (projectId) params.append("projectId", projectId.toString());
        else if (task_id) params.append("taskId", task_id);
        const response = await fetch(
          `${ENV.BACKEND_URL}/api/users/${userId}/submissions/check?${params.toString()}`
        );
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) {
            setExistingSubmission(
              data.exists && data.submission ? data.submission : null
            );
          }
        }
      } catch (error) {
        console.error("Failed to check existing submission", error);
      } finally {
        if (!cancelled) setIsCheckingExistingSubmission(false);
      }
    };

    const capture = async () => {
      if (!isWebsiteTask) return;
      setIsScreenshotLoading(true);
      setScreenshotError(null);
      try {
        const screenshot = await createPreviewScreenshot();
        if (!cancelled) setPreviewScreenshot(screenshot);
      } catch (error) {
        console.error("Failed to capture preview screenshot", error);
        if (!cancelled) {
          setPreviewScreenshot(null);
          setScreenshotError("Unable to capture preview. " + ERROR_TRY_AGAIN);
        }
      } finally {
        if (!cancelled) setIsScreenshotLoading(false);
      }
    };

    checkExistingSubmission();
    capture();
    return () => {
      cancelled = true;
    };
  }, [open, createPreviewScreenshot, userId, projectId, task_id, isWebsiteTask, taskName]);

  useEffect(() => {
    if (previewScreenshot) setScreenshotError(null);
  }, [previewScreenshot]);

  useEffect(() => {
    if (!open || showSubmissionQuestionsCheck) return;
    const container = previewBoxContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const maxWidth = Math.min(rect.width, 960);
      const maxHeight = Math.min(rect.height, 540);
      const aspectRatio = 16 / 9;
      let width = maxWidth;
      let height = width / aspectRatio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }
      const minWidth = 200;
      if (width < minWidth) {
        width = minWidth;
        height = width / aspectRatio;
      }
      setPreviewBoxSize({ width, height });
    };
    requestAnimationFrame(() => updateSize());
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [open, showSubmissionQuestionsCheck]);

  // Fetch submission questions when the panel is shown
  useEffect(() => {
    if (!showSubmissionQuestionsCheck) return;
    const isTutorialTask =
      taskName === "Tutorial" || taskName === "tutorial";
    if (!isTutorialTask && (!userId || !projectId)) return;

    const fetchSubmissionQuestions = async () => {
      setIsLoadingSubmissionQuestions(true);
      setSubmissionQuestionsError(null);
      try {
        if (isTutorialTask) {
          setSubmissionQuestions(TUTORIAL_SUBMISSION_QUESTIONS);
          setIsLoadingSubmissionQuestions(false);
          return;
        }

        const codeSnapshot = collectSubmissionFiles();
        if (!codeSnapshot || Object.keys(codeSnapshot).length === 0) {
          throw new Error("No code files found");
        }

        const response = await fetch(
          `${ENV.BACKEND_URL}/api/submission-questions/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              project_id: projectId,
              submission_title: projectTitle.trim(),
              submission_description: projectDescription.trim(),
              submission_code: codeSnapshot,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || "Failed to generate submission questions"
          );
        }

        const data = await response.json();
        if (data.success && data.questions) {
          const mappedQuestions = data.questions.map((q: any, index: number) => ({
            id: q.id?.toString() || `subq-${index}`,
            question_name: q.question_name || "",
            question: q.question || "",
            question_type: q.question_type || "free_response",
            choices: q.choices,
            answer: q.answer,
          }));
          setSubmissionQuestions(mappedQuestions);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (error) {
        console.error("Failed to fetch submission questions", error);
        setSubmissionQuestionsError(
          error instanceof Error ? error.message : "Failed to load questions"
        );
        setSubmissionQuestions([]);
      } finally {
        setIsLoadingSubmissionQuestions(false);
      }
    };

    fetchSubmissionQuestions();
  }, [
    showSubmissionQuestionsCheck,
    userId,
    projectId,
    projectTitle,
    projectDescription,
    taskName,
    collectSubmissionFiles,
  ]);

  const handleClose = useCallback(() => {
    if (!isSubmittingProject) {
      setShowSubmissionQuestionsCheck(false);
      setSubmissionQuestions([]);
      setSubmissionAnswers({});
      setSubmissionQuestionsError(null);
      setAnswersChecked(false);
      onClose();
    }
  }, [isSubmittingProject, onClose]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setScreenshotError("Please upload an image file.");
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setScreenshotError("Image size must be less than 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        setPreviewScreenshot(result);
        setScreenshotError(null);
      }
    };
    reader.onerror = () => setScreenshotError("Failed to read image file.");
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePreviewTooltipShow = (e: React.MouseEvent<SVGElement>) => {
    e.currentTarget.style.color = "#60a5fa";
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const margin = 8;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, margin),
      vw - margin
    );
    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;
    const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
    const top = placeAbove ? rect.top : rect.bottom;
    setTooltipText(
      "This image is the thumbnail that judges will see before they click on your site. We suggest using a screenshot of your site, but you can upload any appropriate image with the button in the top right."
    );
    setTooltipLeft(left);
    setTooltipTop(top);
    setTooltipPlaceAbove(placeAbove);
    setTooltipVisible(true);
  };

  const handlePreviewTooltipHide = (e: React.MouseEvent<SVGElement>) => {
    e.currentTarget.style.color = "#9ca3af";
    setTooltipVisible(false);
  };

  const submitProject = useCallback(
    async (submissionAnswersData?: Record<string, any>) => {
      const isTutorialTask =
        taskName === "Tutorial" || taskName === "tutorial";

      if (isTutorialTask) {
        setIsSubmittingProject(true);
        setSubmissionError(null);
        await new Promise((resolve) => setTimeout(resolve, 500));
        setShowSubmissionQuestionsCheck(false);
        onClose();

        if (userId) {
          try {
            await setTutorialCompletedInSettings(
              userId,
              user?.settings,
              token || undefined
            );
            await refreshUser();
          } catch (error) {
            console.error(
              "Failed to update tutorial completion in database:",
              error
            );
          }
        }

        onSuccess();
        setHasConsentedToOverride(false);
        setExistingSubmission(null);
        setSubmissionAnswers({});

        showSnackbar(
          <>
            Thanks for completing the tutorial! Navigate to the{" "}
            <Link
              href="/browse"
              style={{ color: "#3b82f6", textDecoration: "underline" }}
            >
              tasks page
            </Link>{" "}
            to start working on real projects
          </>,
          12000
        );

        setIsSubmittingProject(false);
        return;
      }

      const codeSnapshot = collectSubmissionFiles();
      if (!codeSnapshot || Object.keys(codeSnapshot).length === 0) {
        setSubmissionError(
          "We could not capture your project files. Please ensure the editor has loaded and try again."
        );
        return;
      }

      setIsSubmittingProject(true);
      setSubmissionError(null);

      const submissionTitle = isWebsiteTask
        ? projectTitle.trim()
        : (taskName || "Submission");
      const submissionDescription = isWebsiteTask
        ? projectDescription.trim()
        : "";
      const submissionImage = isWebsiteTask ? previewScreenshot : null;

      try {
        const response = await fetch(`${ENV.BACKEND_URL}/api/submissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            projectId,
            taskId: task_id || null,
            title: submissionTitle,
            description: submissionDescription,
            code: codeSnapshot,
            image: submissionImage,
            submissionAnswers: submissionAnswersData || {},
          }),
        });

        if (!response.ok) {
          let message = "Failed to submit project.";
          try {
            const data = await response.json();
            if (data?.error) message = data.error;
          } catch (_) {}
          throw new Error(message);
        }

        setShowSubmissionQuestionsCheck(false);
        onClose();
        onSuccess();
        setHasConsentedToOverride(false);
        setExistingSubmission(null);
        setSubmissionAnswers({});

        showSnackbar(
          <>
            Nice work! Navigate back to the{" "}
            <Link
              href="/browse"
              style={{ color: "#3b82f6", textDecoration: "underline" }}
            >
              tasks page
            </Link>{" "}
            to work on other projects
          </>,
          12000
        );

        if (onProjectSubmitted) {
          try {
            await onProjectSubmitted();
          } catch (error) {
            console.error("Error in onProjectSubmitted callback:", error);
          }
        }
      } catch (error) {
        console.error("Error submitting project:", error);
        setSubmissionError(
          error instanceof Error
            ? error.message
            : "Failed to submit project. " + ERROR_TRY_AGAIN
        );
      } finally {
        setIsSubmittingProject(false);
      }
    },
    [
      taskName,
      isWebsiteTask,
      userId,
      user?.settings,
      token,
      refreshUser,
      onClose,
      onSuccess,
      setSubmissionAnswers,
      collectSubmissionFiles,
      projectTitle,
      projectDescription,
      previewScreenshot,
      projectId,
      task_id,
      showSnackbar,
      onProjectSubmitted,
    ]
  );

  const handleProjectFormSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setSubmissionError(null);

    const trimmedTitle = projectTitle.trim();
    const trimmedDescription = projectDescription.trim();
    let hasError = false;

    if (!trimmedTitle) {
      setProjectTitleError("Please add a project title.");
      hasError = true;
    } else setProjectTitleError(null);

    if (!trimmedDescription) {
      setProjectDescriptionError("Please add a short description.");
      hasError = true;
    } else setProjectDescriptionError(null);

    if (trimmedTitle.length > PROJECT_TITLE_LIMIT) {
      setProjectTitleError(
        `Title must be ${PROJECT_TITLE_LIMIT} characters or fewer.`
      );
      hasError = true;
    }

    if (trimmedDescription.length > PROJECT_DESCRIPTION_LIMIT) {
      setProjectDescriptionError(
        `Description must be ${PROJECT_DESCRIPTION_LIMIT} characters or fewer.`
      );
      hasError = true;
    }

    if (!previewScreenshot) {
      setScreenshotError(
        "Preview not ready yet. Please wait a moment and try again."
      );
      hasError = true;
    }

    const isTutorialTask =
      taskName === "Tutorial" || taskName === "tutorial";
    if (!isTutorialTask) {
      if (!userId || Number.isNaN(userId)) {
        setSubmissionError(
          "Missing user information. Please sign in again and retry."
        );
        hasError = true;
      }
      if (!projectId || Number.isNaN(projectId)) {
        setSubmissionError(
          "Unable to determine project for this submission. Please reopen the task and try again."
        );
        hasError = true;
      }
    }

    if (existingSubmission && !hasConsentedToOverride) {
      setSubmissionError(
        "Please confirm that you want to override your existing submission."
      );
      hasError = true;
    }

    if (hasError) return;

    setProjectTitle(trimmedTitle);
    setProjectDescription(trimmedDescription);

    if (!isTutorialTask) {
      setIsCheckingModeration(true);
      setSubmissionError(null);
      setProjectTitleError(null);
      setProjectDescriptionError(null);
      setScreenshotError(null);

      try {
        const moderationResponse = await fetch(
          `${ENV.BACKEND_URL}/api/submissions/check-moderation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: trimmedTitle,
              description: trimmedDescription,
              image: previewScreenshot,
            }),
          }
        );

        if (!moderationResponse.ok) {
          const errorData = await moderationResponse.json().catch(() => ({}));
          throw new Error(
            errorData.error || "Failed to check content appropriateness"
          );
        }

        const moderationData = await moderationResponse.json();
        if (!moderationData.is_appropriate) {
          setSubmissionError(
            "Your submission has offensive content. Review and update your title/description/image and try again."
          );
          setIsCheckingModeration(false);
          return;
        }
      } catch (error) {
        console.error("Moderation check error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Unable to verify content appropriateness";
        setSubmissionError(
          `Warning: ${errorMessage}. You may proceed, but please ensure your content is appropriate.`
        );
      } finally {
        setIsCheckingModeration(false);
      }
    }

    setShowSubmissionQuestionsCheck(true);
  };

  const handleCheckAnswers = () => {
    setAnswersChecked(true);
    setSubmissionError(null);
  };

  const handleSubmissionQuestionsSubmit = async () => {
    const isTutorialTask =
      taskName === "Tutorial" || taskName === "tutorial";

    if (isTutorialTask) {
      const unansweredQuestions = submissionQuestions.filter((q) => {
        if (q.question_type === "multi_select") return false;
        return !submissionAnswers[q.id]?.trim();
      });
      if (unansweredQuestions.length > 0) {
        setSubmissionError("Please answer all questions before submitting.");
        return;
      }

      if (userId) {
        try {
          const submissionAnswersData = Object.fromEntries(
            submissionQuestions.map((q) => {
              const answer = submissionAnswers[q.id] || "";
              if (q.question_type === "multi_select" && q.choices) {
                const delimiter = "|||";
                const selectedChoices = answer
                  ? answer.split(delimiter).filter(Boolean)
                  : [];
                const binaryArray = q.choices.map((choice) =>
                  selectedChoices.includes(choice) ? 1 : 0
                );
                return [q.question_name || q.id, binaryArray];
              }
              return [q.question_name || q.id, answer];
            })
          );

          await fetch(
            `${ENV.BACKEND_URL}/api/submission-questions/save-tutorial`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                user_id: userId,
                questions: submissionQuestions.map((q) => ({
                  id: q.id,
                  question_name: q.question_name || q.id,
                  question: q.question,
                  question_type: q.question_type,
                  choices: q.choices,
                  answer: q.answer,
                })),
                answers: submissionAnswersData,
              }),
            }
          );
        } catch (error) {
          console.error("Error saving tutorial submission questions:", error);
        }
      }

      await submitProject({});
      return;
    }

    const unansweredQuestions = submissionQuestions.filter((q) => {
      if (q.question_type === "multi_select") return false;
      return !submissionAnswers[q.id]?.trim();
    });
    if (unansweredQuestions.length > 0) {
      setSubmissionError(
        "Please answer all submission questions before submitting."
      );
      return;
    }

    const minWords = 10;
    const invalidFreeResponseQuestions = submissionQuestions.filter((q) => {
      if (
        q.question_type === "free_response" ||
        (!q.question_type ||
          (q.question_type !== "mcqa" && q.question_type !== "multi_select"))
      ) {
        const answer = submissionAnswers[q.id] || "";
        return countWords(answer) < minWords;
      }
      return false;
    });
    if (invalidFreeResponseQuestions.length > 0) {
      setSubmissionError(
        `Free response answers must be at least ${minWords} words long.`
      );
      return;
    }

    const submissionAnswersData = Object.fromEntries(
      submissionQuestions.map((q) => {
        const answer = submissionAnswers[q.id] || "";
        if (q.question_type === "multi_select" && q.choices) {
          const delimiter = "|||";
          const selectedChoices = answer
            ? answer.split(delimiter).filter(Boolean)
            : [];
          const binaryArray = q.choices.map((choice) =>
            selectedChoices.includes(choice) ? 1 : 0
          );
          return [q.question_name || q.id, binaryArray];
        }
        return [q.question_name || q.id, answer];
      })
    );

    await submitProject(submissionAnswersData);
  };

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: sidebarOpen ? "256px" : "48px",
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.76)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
          padding: "20px",
        }}
        onClick={handleClose}
      >
        <div
          style={{
            backgroundColor: "#11131a",
            borderRadius: "14px",
            padding: "1% 2% 1% 2%",
            width: `calc(100vw - ${sidebarOpen ? "320px" : "112px"})`,
            height: "calc(100vh - 64px)",
            boxShadow: "0 30px 60px rgba(0, 0, 0, 0.7)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <h2
              style={{
                color: "#e2e8f0",
                fontSize: "22px",
                fontWeight: 600,
                letterSpacing: "0.01em",
                paddingLeft: showSubmissionQuestionsCheck ? "10px" : "0px",
              }}
            >
              {showSubmissionQuestionsCheck
                ? "Post-Project Questions"
                : taskName === "Tutorial" || taskName === "tutorial"
                  ? "Submit / Finish Tutorial"
                  : "Submit Project"}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close submit modal"
              disabled={isSubmittingProject}
              style={{
                background: "transparent",
                border: "none",
                color: "#9ca3af",
                fontSize: "18px",
                cursor: isSubmittingProject ? "not-allowed" : "pointer",
                padding: "4px 8px",
                lineHeight: 1,
                transition: "color 0.2s ease",
                opacity: isSubmittingProject ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmittingProject)
                  e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                if (!isSubmittingProject)
                  e.currentTarget.style.color = "#9ca3af";
              }}
            >
              ✕
            </button>
          </div>

          {!showSubmissionQuestionsCheck &&
            (taskName === "Tutorial" || taskName === "tutorial") && (
              <p
                style={{
                  color: "#9ca3af",
                  fontSize: "13px",
                  marginTop: "-8px",
                  marginBottom: "16px",
                }}
              >
                Normally, you will need to add a title and description for your
                project. But this does not matter for the tutorial.
              </p>
            )}

          {!showSubmissionQuestionsCheck && isWebsiteTask ? (
            <ProjectDetailsForm
              projectTitle={projectTitle}
              setProjectTitle={setProjectTitle}
              projectDescription={projectDescription}
              setProjectDescription={setProjectDescription}
              projectTitleError={projectTitleError}
              setProjectTitleError={setProjectTitleError}
              projectDescriptionError={projectDescriptionError}
              setProjectDescriptionError={setProjectDescriptionError}
              previewScreenshot={previewScreenshot}
              isScreenshotLoading={isScreenshotLoading}
              screenshotError={screenshotError}
              existingSubmission={existingSubmission}
              hasConsentedToOverride={hasConsentedToOverride}
              setHasConsentedToOverride={setHasConsentedToOverride}
              isSubmittingProject={isSubmittingProject}
              isCheckingModeration={isCheckingModeration}
              isCheckingExistingSubmission={isCheckingExistingSubmission}
              submissionError={submissionError}
              isSubmitDisabled={isSubmitDisabled}
              onSubmit={handleProjectFormSubmit}
              onImageUpload={handleImageUpload}
              onDownloadProject={onDownloadProject}
              taskName={taskName}
              previewBoxContainerRef={previewBoxContainerRef}
              fileInputRef={fileInputRef}
              previewBoxSize={previewBoxSize}
              onPreviewTooltipShow={handlePreviewTooltipShow}
              onPreviewTooltipHide={handlePreviewTooltipHide}
            />
          ) : !isWebsiteTask &&
            !isLoadingSubmissionQuestions &&
            submissionQuestions.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ color: "#9ca3af", fontSize: "14px" }}>
                No questions for this task. Submit your code below.
              </p>
              <div style={{ display: "flex", gap: "12px", marginTop: "auto" }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmittingProject}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "transparent",
                    color: "#9ca3af",
                    border: "1px solid #4b5563",
                    borderRadius: "8px",
                    cursor: isSubmittingProject ? "not-allowed" : "pointer",
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => submitProject({})}
                  disabled={isSubmittingProject}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: isSubmittingProject ? "#374151" : "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: isSubmittingProject ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {isSubmittingProject ? "Submitting…" : "Submit Project"}
                </button>
              </div>
            </div>
          ) : (
            <SubmissionQuestionsPane
              taskName={taskName}
              isLoadingSubmissionQuestions={isLoadingSubmissionQuestions}
              submissionQuestionsError={submissionQuestionsError}
              submissionQuestions={submissionQuestions}
              submissionError={submissionError}
            >
              <SubmissionQuestionsForm
                submissionQuestions={submissionQuestions}
                submissionAnswers={submissionAnswers}
                setSubmissionAnswers={setSubmissionAnswers}
                answersChecked={answersChecked}
                submissionError={submissionError}
                setSubmissionError={setSubmissionError}
                singleStepSubmit={true}
                submitLabel={
                  taskName === "Tutorial" || taskName === "tutorial"
                    ? "Submit / Finish Tutorial"
                    : "Submit Project"
                }
                isSubmittingProject={isSubmittingProject}
                isLoadingSubmissionQuestions={
                  isLoadingSubmissionQuestions
                }
                onBack={
                  isWebsiteTask
                    ? () => {
                        setShowSubmissionQuestionsCheck(false);
                        setSubmissionQuestions([]);
                        setSubmissionAnswers({});
                        setSubmissionQuestionsError(null);
                        setAnswersChecked(false);
                      }
                    : onClose
                }
                onCheckAnswers={handleCheckAnswers}
                onSubmit={handleSubmissionQuestionsSubmit}
              />
            </SubmissionQuestionsPane>
          )}
        </div>
      </div>

      {tooltipVisible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: tooltipLeft,
              top: tooltipTop,
              transform: tooltipPlaceAbove
                ? "translate(-50%, -100%) translateY(-8px)"
                : "translate(-50%, 8px)",
              backgroundColor: "#ffffff",
              color: "#000000",
              fontSize: "12px",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              boxShadow:
                "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
              zIndex: 100000,
              whiteSpace: "normal",
              pointerEvents: "none",
              maxWidth: "400px",
              textAlign: "left",
            }}
          >
            {tooltipText}
          </div>,
          document.body
        )}
    </>
  );
}
