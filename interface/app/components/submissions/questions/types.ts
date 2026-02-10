export interface SubmissionQuestion {
  id: string;
  question_name?: string;
  question: string;
  question_type: string;
  choices?: string[];
  answer?: string | number | number[];
}
