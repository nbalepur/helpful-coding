import type { SubmissionQuestion } from "@/app/components/submissions/questions/types";

/**
 * Submission questions shown in the tutorial submit flow.
 * Used when the user submits the tutorial task.
 */
export const TUTORIAL_SUBMISSION_QUESTIONS: SubmissionQuestion[] = [
  {
    id: "tutorial-1",
    question_name: "tutorial_question_1",
    question:
      'How much do you agree with this statement: "Coding with AI tools like Cursor and Copilot makes you a better programmer"',
    question_type: "mcqa",
    choices: [
      "1 - Strongly disagree",
      "2 - Disagree",
      "3 - Neither agree nor disagree",
      "4 - Agree",
      "5 - Strongly agree",
    ],
  },
  {
    id: "tutorial-2",
    question_name: "tutorial_question_2",
    question: "Which of these foods do you like to eat?",
    question_type: "multi_select",
    choices: [
      "Dim Sum",
      "Shakshuka",
      "Birria Tacos",
      "Dubai Chocolate",
      "Pizza",
      "Hummus",
    ],
  },
];
