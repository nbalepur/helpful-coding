-- Migration: Remove LLM evaluation fields from submissions table
-- Date: 2025-01-26
-- Description: Removes evaluation fields from submissions table since we now use a separate table
--              Run this AFTER creating submission_evaluations table

-- Drop indexes first
DROP INDEX IF EXISTS idx_submissions_llm_evaluation_is_valid;

-- Remove columns
ALTER TABLE submissions 
DROP COLUMN IF EXISTS llm_evaluation;

ALTER TABLE submissions 
DROP COLUMN IF EXISTS llm_evaluation_is_valid;

ALTER TABLE submissions 
DROP COLUMN IF EXISTS llm_evaluation_created_at;
