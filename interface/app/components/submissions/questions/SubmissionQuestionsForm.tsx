"use client";

import React from "react";
import type { SubmissionQuestion } from "./types";
import { convertBackticksToCode } from "./utils";
import McqaChoices from "./McqaChoices";
import MultiSelectChoices from "./MultiSelectChoices";

export interface SubmissionQuestionsFormProps {
  submissionQuestions: SubmissionQuestion[];
  submissionAnswers: Record<string, string>;
  setSubmissionAnswers: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  answersChecked: boolean;
  submissionError: string | null;
  setSubmissionError: React.Dispatch<React.SetStateAction<string | null>>;
  convertBackticksToCode?: (text: string) => string;
  /** If true, primary button is "Submit" only (no "Check Answers" step). If false, shows "Check Answers" then "Submit Project". */
  singleStepSubmit?: boolean;
  /** Label for the primary submit button when singleStepSubmit is true (e.g. "Submit / Finish Tutorial"). */
  submitLabel?: string;
  isSubmittingProject: boolean;
  isLoadingSubmissionQuestions: boolean;
  onBack: () => void;
  onCheckAnswers: () => void;
  onSubmit: () => void;
}

export default function SubmissionQuestionsForm({
  submissionQuestions,
  submissionAnswers,
  setSubmissionAnswers,
  answersChecked,
  submissionError,
  setSubmissionError,
  convertBackticksToCode: customConvert = convertBackticksToCode,
  singleStepSubmit = false,
  submitLabel = "Submit",
  isSubmittingProject,
  isLoadingSubmissionQuestions,
  onBack,
  onCheckAnswers,
  onSubmit,
}: SubmissionQuestionsFormProps) {

  const someUnanswered =
    submissionQuestions.length > 0 &&
    submissionQuestions.some((q) => {
      const answer = submissionAnswers[q.id] ?? "";
      return !answer.trim();
    });
  const canSubmit =
    !isSubmittingProject &&
    !isLoadingSubmissionQuestions &&
    !someUnanswered;

  return (
    <>
      {submissionQuestions.map((q, index) => {
        const currentAnswer = submissionAnswers[q.id] || "";
        const shouldShowAnswers = answersChecked;
        const shouldDisableQuestion = answersChecked;

        const isMcqa =
          q.question_type === "mcqa" && q.choices && q.choices.length > 0;
        const isMultiSelect =
          q.question_type === "multi_select" &&
          q.choices &&
          q.choices.length > 0;
        const isFreeResponse = q.question_type === "free_response";
        if (!isMcqa && !isMultiSelect && !isFreeResponse) return null;

        const gap =
          q.question_type === "mcqa" ? "6px" : "12px";

        return (
          <div
            key={q.id || index}
            style={{
              display: "flex",
              flexDirection: "column",
              gap,
              paddingTop: index > 0 ? "20px" : "0px",
              borderTop:
                index > 0
                  ? "1px solid rgba(255, 255, 255, 0.1)"
                  : "none",
            }}
          >
            <div
              className="markdown-content"
              style={{
                color: "#e5e7eb",
                fontWeight: 500,
                fontSize: "14px",
              }}
              dangerouslySetInnerHTML={{
                __html: customConvert(q.question),
              }}
            />
            {isMcqa ? (
              <McqaChoices
                q={q}
                currentAnswer={currentAnswer}
                shouldShowAnswers={!!shouldShowAnswers}
                shouldDisableQuestion={!!shouldDisableQuestion}
                setSubmissionAnswers={setSubmissionAnswers}
                setSubmissionError={setSubmissionError}
                submissionError={submissionError}
                convertBackticksToCode={customConvert}
              />
            ) : isMultiSelect ? (
              <MultiSelectChoices
                q={q}
                currentAnswer={currentAnswer}
                shouldShowAnswers={!!shouldShowAnswers}
                shouldDisableQuestion={!!shouldDisableQuestion}
                setSubmissionAnswers={setSubmissionAnswers}
                setSubmissionError={setSubmissionError}
                submissionError={submissionError}
                convertBackticksToCode={customConvert}
              />
            ) : (
              <textarea
                id={`subq-${q.id}`}
                value={currentAnswer}
                disabled={shouldDisableQuestion}
                onChange={(e) => {
                  if (!shouldDisableQuestion) {
                    setSubmissionAnswers((prev) => ({
                      ...prev,
                      [q.id]: e.target.value,
                    }));
                    if (submissionError) setSubmissionError(null);
                  }
                }}
                placeholder="Your answer..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "6px",
                  border: "1px solid #4b5563",
                  backgroundColor: "#1f2937",
                  color: "#e5e7eb",
                  fontSize: "14px",
                  resize: "vertical",
                  fontFamily: "inherit",
                  cursor: shouldDisableQuestion ? "not-allowed" : "text",
                  opacity: shouldDisableQuestion ? 0.7 : 1,
                }}
              />
            )}
          </div>
        );
      })}

      <div
        style={{
          display: "flex",
          gap: "10px",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: "auto",
          paddingTop: "16px",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmittingProject || answersChecked}
          style={{
            padding: "6px 14px",
            backgroundColor: "#4b5563",
            color: "#f9fafb",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "6px",
            cursor:
              isSubmittingProject || answersChecked
                ? "not-allowed"
                : "pointer",
            fontSize: "13px",
            fontWeight: 500,
            opacity: isSubmittingProject || answersChecked ? 0.6 : 1,
          }}
        >
          Back
        </button>
        {singleStepSubmit ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              padding: "6px 16px",
              background:
                "linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)",
              backgroundSize: "400% 400%",
              backgroundPosition: "0% 50%",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontSize: "13px",
              fontWeight: 500,
              opacity: canSubmit ? 1 : 0.6,
              boxShadow: "0 10px 25px rgba(59, 130, 246, 0.25)",
            }}
          >
            {isSubmittingProject ? "Submitting…" : submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={answersChecked ? onSubmit : onCheckAnswers}
            disabled={!canSubmit}
            style={
              answersChecked
                ? {
                    padding: "6px 16px",
                    background:
                      "linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)",
                    backgroundSize: "400% 400%",
                    backgroundPosition: "0% 50%",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    fontSize: "13px",
                    fontWeight: 500,
                    opacity: canSubmit ? 1 : 0.6,
                    boxShadow: "0 10px 25px rgba(59, 130, 246, 0.25)",
                  }
                : {
                    padding: "6px 16px",
                    backgroundColor: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    fontSize: "13px",
                    fontWeight: 500,
                    opacity: canSubmit ? 1 : 0.6,
                  }
            }
          >
            {answersChecked
              ? isSubmittingProject
                ? "Submitting…"
                : "Submit Project"
              : "Check Answers"}
          </button>
        )}
      </div>
    </>
  );
}
