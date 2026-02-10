"use client";

import React from "react";
import { Check, X } from "lucide-react";
import type { SubmissionQuestion } from "./types";
import { convertBackticksToCode } from "./utils";

export interface McqaChoicesProps {
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

export default function McqaChoices({
  q,
  currentAnswer,
  shouldShowAnswers,
  shouldDisableQuestion,
  setSubmissionAnswers,
  setSubmissionError,
  submissionError,
  convertBackticksToCode: customConvert = convertBackticksToCode,
}: McqaChoicesProps) {
  let correctAnswerIndex: number | null = null;
  if (q.answer !== null && q.answer !== undefined && q.answer !== "") {
    if (typeof q.answer === "number") correctAnswerIndex = q.answer - 1;
    else if (
      typeof q.answer === "string" &&
      !isNaN(Number(q.answer)) &&
      q.answer.trim() !== ""
    ) {
      correctAnswerIndex = Number(q.answer) - 1;
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: "8px",
          marginTop: "0px",
        }}
      >
        {q.choices!.map((choice, choiceIndex) => {
          const isSelected = currentAnswer === choice;
          const isCorrect =
            shouldShowAnswers &&
            correctAnswerIndex !== null &&
            choiceIndex === correctAnswerIndex;
          const isDisabled = shouldShowAnswers || shouldDisableQuestion;

          return (
            <label
              key={choiceIndex}
              htmlFor={`comp-${q.id}-${choiceIndex}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: isDisabled ? "not-allowed" : "pointer",
                padding: "8px 12px",
                borderRadius: "6px",
                backgroundColor: isSelected ? "#1e3a8a" : "#1f2937",
                border: isSelected ? "1px solid #3b82f6" : "1px solid #4b5563",
                flex: "0 1 auto",
                minWidth: "fit-content",
              }}
            >
              <input
                id={`comp-${q.id}-${choiceIndex}`}
                type="radio"
                name={`comp-${q.id}`}
                value={choice}
                checked={isSelected}
                disabled={isDisabled}
                onChange={(e) => {
                  if (!isDisabled) {
                    setSubmissionAnswers((prev) => ({
                      ...prev,
                      [q.id]: e.target.value,
                    }));
                    if (submissionError) setSubmissionError(null);
                  }
                }}
                style={{
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  accentColor: "#3b82f6",
                }}
              />
              <span
                className="markdown-content"
                style={{
                  color: "#e5e7eb",
                  fontSize: "14px",
                  fontWeight: isSelected ? 500 : "normal",
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
      {shouldShowAnswers &&
        q.answer != null &&
        q.answer !== "" &&
        (typeof q.answer === "number" ||
          (typeof q.answer === "string" &&
            q.answer.trim() !== "" &&
            !isNaN(Number(q.answer)))) &&
        q.choices && (
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
              const correctIdx =
                typeof q.answer === "number"
                  ? q.answer - 1
                  : typeof q.answer === "string" && !isNaN(Number(q.answer))
                    ? Number(q.answer) - 1
                    : null;
              const correctAnswerText =
                correctIdx != null &&
                correctIdx >= 0 &&
                correctIdx < q.choices!.length
                  ? q.choices![correctIdx]
                  : String(q.answer);
              const userSelectedText = currentAnswer || "nothing";
              const isUserCorrect = currentAnswer === correctAnswerText;
              if (isUserCorrect) {
                return (
                  <span>
                    <strong style={{ color: "#10b981" }}>✓ Correct! </strong>
                    You selected the right answer.
                  </span>
                );
              }
              const quotedUser = "\u0022" + userSelectedText + "\u0022";
              const quotedCorrect =
                "\u0022" + correctAnswerText + "\u0022";
              return (
                <span>
                  <strong style={{ color: "#ef4444" }}>✗ Incorrect. </strong>
                  You selected <strong>{quotedUser}</strong>, but the correct
                  answer is{" "}
                  <strong style={{ color: "#60a5fa" }}>{quotedCorrect}</strong>.
                </span>
              );
            })()}
          </div>
        )}
    </>
  );
}
