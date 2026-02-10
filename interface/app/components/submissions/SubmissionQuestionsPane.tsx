"use client";

import React from "react";
import LoadingSpinner from "../ui/LoadingSpinner";

export interface SubmissionQuestionsPaneProps {
  taskName?: string | null;
  isLoadingSubmissionQuestions: boolean;
  submissionQuestionsError: string | null;
  submissionQuestions: unknown[];
  submissionError: string | null;
  children: React.ReactNode;
}

export default function SubmissionQuestionsPane({
  taskName,
  isLoadingSubmissionQuestions,
  submissionQuestionsError,
  submissionQuestions,
  submissionError,
  children,
}: SubmissionQuestionsPaneProps) {
  const isTutorialTask =
    taskName === "Tutorial" || taskName === "tutorial";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "32px",
        minHeight: 0,
        overflowY: "auto",
        paddingLeft: "10px",
        paddingRight: "20px",
      }}
    >
      <p
        style={{
          color: "#9ca3af",
          fontSize: "14px",
          marginBottom: "0px",
        }}
      >
      Before submitting your project, please answer the questions below.
      </p>

      {isLoadingSubmissionQuestions && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
          }}
        >
          <LoadingSpinner size="lg" color="blue" className="mb-4" />
          <p style={{ color: "#9ca3af", fontSize: "14px" }}>
            Generating questions...
          </p>
        </div>
      )}

      {submissionQuestionsError && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "6px",
            color: "#fca5a5",
            fontSize: "13px",
          }}
        >
          {submissionQuestionsError}
        </div>
      )}

      {!isLoadingSubmissionQuestions &&
        submissionQuestions.length === 0 &&
        !submissionQuestionsError && (
          <p
            style={{
              color: "#9ca3af",
              fontSize: "14px",
              fontStyle: "italic",
            }}
          >
            No questions available. You can proceed with submission.
          </p>
        )}

      {!isLoadingSubmissionQuestions && submissionQuestions.length > 0 && (
        <>{children}</>
      )}

      {submissionError && (
        <div style={{ color: "#f87171", fontSize: "12px" }}>
          {submissionError}
        </div>
      )}
    </div>
  );
}
