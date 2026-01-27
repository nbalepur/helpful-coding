-- Migration: Add LLM evaluation fields to submissions table
-- Date: 2025-01-26
-- Description: Adds fields to store LLM-as-a-judge evaluation results for submissions

-- Add llm_evaluation column (JSON to store full evaluation result)
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS llm_evaluation JSONB;

-- Add llm_evaluation_is_valid column (Boolean for quick access to validity)
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS llm_evaluation_is_valid BOOLEAN;

-- Add llm_evaluation_created_at column (DateTime for when evaluation was performed)
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS llm_evaluation_created_at TIMESTAMP WITH TIME ZONE;

-- Optional: Add index on llm_evaluation_is_valid for faster queries
CREATE INDEX IF NOT EXISTS idx_submissions_llm_evaluation_is_valid ON submissions(llm_evaluation_is_valid);
