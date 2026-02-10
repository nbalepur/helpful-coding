"use client";

import React from "react";
import { BsExclamationTriangle, BsInfoCircle } from "react-icons/bs";
import { Download } from "lucide-react";
import LoadingSpinner from "../ui/LoadingSpinner";

const PROJECT_TITLE_LIMIT = 80;
const PROJECT_DESCRIPTION_LIMIT = 500;

export interface ProjectDetailsFormProps {
  projectTitle: string;
  setProjectTitle: React.Dispatch<React.SetStateAction<string>>;
  projectDescription: string;
  setProjectDescription: React.Dispatch<React.SetStateAction<string>>;
  projectTitleError: string | null;
  setProjectTitleError: React.Dispatch<React.SetStateAction<string | null>>;
  projectDescriptionError: string | null;
  setProjectDescriptionError: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  previewScreenshot: string | null;
  isScreenshotLoading: boolean;
  screenshotError: string | null;
  existingSubmission: {
    id: number;
    title: string;
    description: string | null;
    createdAt: string | null;
  } | null;
  hasConsentedToOverride: boolean;
  setHasConsentedToOverride: React.Dispatch<React.SetStateAction<boolean>>;
  isSubmittingProject: boolean;
  isCheckingModeration: boolean;
  isCheckingExistingSubmission: boolean;
  submissionError: string | null;
  isSubmitDisabled: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadProject?: (title: string, description: string) => void;
  taskName?: string | null;
  previewBoxContainerRef: React.Ref<HTMLDivElement>;
  fileInputRef: React.Ref<HTMLInputElement>;
  previewBoxSize: { width: number; height: number };
  onPreviewTooltipShow: (event: React.MouseEvent<SVGElement>) => void;
  onPreviewTooltipHide: (event: React.MouseEvent<SVGElement>) => void;
}

export default function ProjectDetailsForm({
  projectTitle,
  setProjectTitle,
  projectDescription,
  setProjectDescription,
  projectTitleError,
  setProjectTitleError,
  projectDescriptionError,
  setProjectDescriptionError,
  previewScreenshot,
  isScreenshotLoading,
  screenshotError,
  existingSubmission,
  hasConsentedToOverride,
  setHasConsentedToOverride,
  isSubmittingProject,
  isCheckingModeration,
  isCheckingExistingSubmission,
  submissionError,
  isSubmitDisabled,
  onSubmit,
  onImageUpload,
  onDownloadProject,
  taskName,
  previewBoxContainerRef,
  fileInputRef,
  previewBoxSize,
  onPreviewTooltipShow,
  onPreviewTooltipHide,
}: ProjectDetailsFormProps) {
  const titleInputId = "submit-project-title";
  const descriptionInputId = "submit-project-description";
  const trimmedProjectTitleLength = projectTitle.trim().length;
  const trimmedProjectDescriptionLength = projectDescription.trim().length;
  const isProjectTitleAtCap =
    trimmedProjectTitleLength >= PROJECT_TITLE_LIMIT;
  const isProjectDescriptionAtCap =
    trimmedProjectDescriptionLength >= PROJECT_DESCRIPTION_LIMIT;

  return (
    <form
      onSubmit={onSubmit}
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto auto 1fr auto",
        gap: "1em",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "6px",
        }}
      >
        <label
          htmlFor={titleInputId}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#e5e7eb",
            fontWeight: 500,
            fontSize: "14px",
            marginBottom: "0",
          }}
        >
          <span>Project Title</span>
          <span
            style={{
              color: isProjectTitleAtCap ? "#60a5fa" : "#9ca3af",
              fontSize: "12px",
            }}
          >
            {projectTitle.length}/{PROJECT_TITLE_LIMIT}
          </span>
        </label>
        <input
          id={titleInputId}
          type="text"
          value={projectTitle}
          maxLength={PROJECT_TITLE_LIMIT}
          onChange={(e) => {
            const nextTitle = e.target.value.slice(0, PROJECT_TITLE_LIMIT);
            setProjectTitle(nextTitle);
            if (projectTitleError) {
              const trimmed = nextTitle.trim();
              if (trimmed && trimmed.length <= PROJECT_TITLE_LIMIT) {
                setProjectTitleError(null);
              }
            }
          }}
          placeholder="Give a unique name for users to associate with your project"
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "6px",
            border: "1px solid #4b5563",
            backgroundColor: "#1f2937",
            color: "#e5e7eb",
            fontSize: "14px",
          }}
        />
        {projectTitleError && (
          <div
            style={{
              color: "#f87171",
              fontSize: "12px",
              marginTop: "4px",
            }}
          >
            {projectTitleError}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "6px",
        }}
      >
        <label
          htmlFor={descriptionInputId}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#e5e7eb",
            fontWeight: 500,
            fontSize: "14px",
            marginBottom: "0",
          }}
        >
          <span>Project Description</span>
          <span
            style={{
              color: isProjectDescriptionAtCap ? "#60a5fa" : "#9ca3af",
              fontSize: "12px",
            }}
          >
            {trimmedProjectDescriptionLength}/{PROJECT_DESCRIPTION_LIMIT}
          </span>
        </label>
        <textarea
          id={descriptionInputId}
          value={projectDescription}
          maxLength={PROJECT_DESCRIPTION_LIMIT}
          onChange={(e) => {
            const nextDescription = e.target.value.slice(
              0,
              PROJECT_DESCRIPTION_LIMIT
            );
            setProjectDescription(nextDescription);
            if (projectDescriptionError) {
              const trimmed = nextDescription.trim();
              if (
                trimmed &&
                trimmed.length <= PROJECT_DESCRIPTION_LIMIT
              ) {
                setProjectDescriptionError(null);
              }
            }
          }}
          placeholder="Summarize what a user can expect when they open your project, including key mechanics, features, and rules!"
          rows={2}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "6px",
            border: "1px solid #4b5563",
            backgroundColor: "#1f2937",
            color: "#e5e7eb",
            fontSize: "14px",
            resize: "none",
            overflowY: "auto",
          }}
        />
        {projectDescriptionError && (
          <div
            style={{
              color: "#f87171",
              fontSize: "12px",
              marginTop: "4px",
            }}
          >
            {projectDescriptionError}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          gap: "6px",
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            paddingBottom: 0,
          }}
        >
          <span
            style={{
              color: "#e5e7eb",
              fontWeight: 500,
              fontSize: "14px",
            }}
          >
            Project Preview Image
          </span>
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <BsInfoCircle
              style={{
                color: "#9ca3af",
                fontSize: "14px",
                cursor: "help",
              }}
              onMouseEnter={onPreviewTooltipShow}
              onMouseLeave={onPreviewTooltipHide}
            />
          </div>
        </div>
        <div
          ref={previewBoxContainerRef}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "stretch",
            minHeight: 0,
          }}
        >
          <div
            style={{
              width: `${previewBoxSize.width}px`,
              height: `${previewBoxSize.height}px`,
              maxWidth: "100%",
              maxHeight: "100%",
              aspectRatio: "16 / 9",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: "0",
              backgroundColor: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {isScreenshotLoading ? (
              <div
                role="status"
                aria-label="Loading snapshot"
                className="flex flex-col items-center justify-center space-y-3"
              >
                <LoadingSpinner size="xl" color="blue" />
              </div>
            ) : previewScreenshot ? (
              <img
                src={previewScreenshot}
                alt="Submission preview"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  borderRadius: "0",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                }}
              />
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "#9ca3af",
                  fontSize: "13px",
                  padding: "12px",
                }}
              >
                Preview not available yet. It will appear here as soon as it is
                ready.
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                padding: "8px",
                backgroundColor: "rgba(31, 41, 55, 0.9)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "6px",
                color: "#9ca3af",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                width: "32px",
                height: "32px",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onImageUpload}
              style={{ display: "none" }}
            />
          </div>
        </div>
        {screenshotError && (
          <div style={{ color: "#f87171", fontSize: "12px" }}>
            {screenshotError}
          </div>
        )}
      </div>

      {existingSubmission && (
        <div
          style={{
            padding: "12px 14px",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "10px",
            color: "#fca5a5",
            fontSize: "13px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <BsExclamationTriangle
              style={{
                flexShrink: 0,
                fontSize: "16px",
                marginTop: "2px",
              }}
            />
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <span style={{ fontWeight: 500 }}>
                You already have a submission called "
                {existingSubmission.title}"!
              </span>
              <span>
                Submitting again will override your current submission and clear
                all votes (if the voting period has begun) on your site.
              </span>
            </div>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              userSelect: "none",
              paddingLeft: "24px",
            }}
          >
            <input
              type="checkbox"
              checked={hasConsentedToOverride}
              onChange={(e) => setHasConsentedToOverride(e.target.checked)}
              style={{
                cursor: "pointer",
                width: "16px",
                height: "16px",
                accentColor: "#ef4444",
              }}
            />
            <span style={{ fontSize: "12px" }}>
              I understand and want to override my current submission
            </span>
          </label>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "10px",
          justifyContent: submissionError ? "space-between" : "flex-end",
          alignItems: "center",
          marginTop: "8px",
        }}
      >
        {submissionError && (
          <div
            style={{
              color: "#f87171",
              fontSize: "14px",
              fontWeight: 500,
              flex: 1,
              textAlign: "left",
            }}
          >
            {submissionError}
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {taskName !== "Tutorial" &&
            taskName !== "tutorial" &&
            onDownloadProject && (
              <button
                type="button"
                onClick={() =>
                  onDownloadProject(projectTitle.trim(), projectDescription.trim())
                }
                disabled={isSubmittingProject}
                style={{
                  padding: "6px 14px",
                  backgroundColor: "#374151",
                  color: "#f9fafb",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  borderRadius: "6px",
                  cursor: isSubmittingProject ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  opacity: isSubmittingProject ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Download className="w-4 h-4" />
                Download Project
              </button>
            )}
          <button
            type="submit"
            disabled={
              isSubmitDisabled ||
              isSubmittingProject ||
              isCheckingModeration ||
              isCheckingExistingSubmission
            }
            style={{
              padding: "6px 16px",
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor:
                isSubmitDisabled ||
                isSubmittingProject ||
                isCheckingModeration ||
                isCheckingExistingSubmission
                  ? "not-allowed"
                  : "pointer",
              fontSize: "13px",
              fontWeight: 500,
              opacity:
                isSubmitDisabled ||
                isSubmittingProject ||
                isCheckingModeration ||
                isCheckingExistingSubmission
                  ? 0.6
                  : 1,
            }}
          >
            {isCheckingExistingSubmission
              ? "Checking…"
              : isCheckingModeration
                ? "Checking content…"
                : isSubmittingProject
                  ? "Submitting…"
                  : "Continue"}
          </button>
        </div>
      </div>
    </form>
  );
}
