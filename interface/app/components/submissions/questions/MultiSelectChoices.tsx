"use client";

import React from "react";
import { Check, X } from "lucide-react";
import type { SubmissionQuestion } from "./types";
import { convertBackticksToCode } from "./utils";

export interface MultiSelectChoicesProps {
  q: SubmissionQuestion;
  currentAnswer: string;
  shouldShowAnswers: boolean;
  shouldDisableQuestion: boolean;
  setSubmissionAnswers: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  setSubmissionError: React.Dispatch<React.SetStateAction<string | null>>;
  submissionError: string | null;
  convertBackticksToCode?: (text: string) => string;
}

export default function MultiSelectChoices({
  q,
  currentAnswer,
  shouldShowAnswers,
  shouldDisableQuestion,
  setSubmissionAnswers,
  setSubmissionError,
  submissionError,
  convertBackticksToCode: customConvert = convertBackticksToCode,
}: MultiSelectChoicesProps) {
  const delimiter = "|||";
  const selectedAnswers = currentAnswer
    ? currentAnswer.split(delimiter).filter(Boolean)
    : [];

  let correctAnswers: number[] = [];
  if (shouldShowAnswers && q.answer) {
    if (Array.isArray(q.answer)) correctAnswers = q.answer;
    else if (typeof q.answer === "string") {
      try {
        const parsed = JSON.parse(q.answer);
        if (Array.isArray(parsed)) correctAnswers = parsed;
      } catch {
        correctAnswers = q.answer
          .split(",")
          .map((x) => parseInt(x.trim()))
          .filter((x) => !isNaN(x));
      }
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {q.choices!.map((choice, choiceIndex) => {
          const isChecked = selectedAnswers.includes(choice);
          const isCorrect =
            shouldShowAnswers &&
            correctAnswers.length > choiceIndex &&
            correctAnswers[choiceIndex] === 1;
          const shouldDisableInput = shouldShowAnswers || shouldDisableQuestion;

          return (
            <label
              key={choiceIndex}
              htmlFor={`comp-${q.id}-${choiceIndex}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: shouldDisableInput ? "not-allowed" : "pointer",
                padding: "8px 12px",
                borderRadius: "6px",
                backgroundColor: "#1f2937",
                border: "1px solid #4b5563",
                width: "100%",
                pointerEvents: shouldDisableInput ? "none" : "auto",
              }}
            >
              <input
                id={`comp-${q.id}-${choiceIndex}`}
                type="checkbox"
                value={choice}
                checked={isChecked}
                onChange={(e) => {
                  if (!shouldDisableInput) {
                    let newAnswers: string[];
                    if (e.target.checked) {
                      newAnswers = [...selectedAnswers, choice];
                    } else {
                      newAnswers = selectedAnswers.filter((a) => a !== choice);
                    }
                    setSubmissionAnswers((prev) => ({
                      ...prev,
                      [q.id]: newAnswers.join(delimiter),
                    }));
                    if (submissionError) setSubmissionError(null);
                  }
                }}
                style={{
                  cursor: shouldDisableInput ? "not-allowed" : "pointer",
                  accentColor: "#3b82f6",
                  pointerEvents: shouldDisableInput ? "none" : "auto",
                }}
              />
              <span
                className="markdown-content"
                style={{
                  color: "#e5e7eb",
                  fontSize: "14px",
                  pointerEvents: "none",
                }}
                dangerouslySetInnerHTML={{
                  __html: customConvert(choice),
                }}
              />
              {shouldShowAnswers && (
                <span
                  style={{
                    marginLeft: "8px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {isCorrect ? (
                    <Check size={18} color="#10b981" />
                  ) : (
                    <X size={18} color="#ef4444" />
                  )}
                </span>
              )}
            </label>
          );
        })}
      </div>
      {shouldShowAnswers && q.answer && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px 12px",
            border: "1px solid #3b82f6",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#e5e7eb",
          }}
        >
          {(() => {
            let correctAnswers: number[] = [];
            if (Array.isArray(q.answer)) correctAnswers = q.answer;
            else if (typeof q.answer === "string") {
              try {
                const parsed = JSON.parse(q.answer);
                if (Array.isArray(parsed)) correctAnswers = parsed;
              } catch {
                correctAnswers = q.answer
                  .split(",")
                  .map((x) => parseInt(x.trim()))
                  .filter((x) => !isNaN(x));
              }
            }
            const userSelected = currentAnswer
              ? currentAnswer.split(delimiter).filter(Boolean)
              : [];
            const correctlySelected: string[] = [];
            const missed: string[] = [];
            const incorrectlySelected: string[] = [];
            q.choices?.forEach((choice, idx) => {
              const shouldBeSelected =
                correctAnswers.length > idx && correctAnswers[idx] === 1;
              const wasSelected = userSelected.includes(choice);
              if (shouldBeSelected && wasSelected)
                correctlySelected.push(choice);
              else if (shouldBeSelected && !wasSelected) missed.push(choice);
              else if (!shouldBeSelected && wasSelected)
                incorrectlySelected.push(choice);
            });
            const parts: React.ReactNode[] = [];
            if (correctlySelected.length > 0)
              parts.push(
                <span key="correct">
                  <strong style={{ color: "#10b981" }}>
                    ✓ Correctly selected:{" "}
                  </strong>
                  {correctlySelected.join(", ")}
                </span>
              );
            if (missed.length > 0)
              parts.push(
                <span key="missed">
                  <strong style={{ color: "#f59e0b" }}>✗ Missed: </strong>
                  {missed.join(", ")}
                </span>
              );
            if (incorrectlySelected.length > 0)
              parts.push(
                <span key="incorrect">
                  <strong style={{ color: "#ef4444" }}>
                    ✗ Incorrectly selected:{" "}
                  </strong>
                  {incorrectlySelected.join(", ")}
                </span>
              );
            if (parts.length === 0)
              return (
                <span>
                  <strong style={{ color: "#10b981" }}>✓ Perfect! </strong>
                  You selected all the correct answers.
                </span>
              );
            return (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {parts.map((part, idx) => (
                  <div key={idx}>{part}</div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
