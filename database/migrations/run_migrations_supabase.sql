-- Migration script for Supabase
-- Run this in the Supabase SQL Editor
-- This combines both migrations into one script for Supabase

-- ============================================
-- Step 1: Create submission_evaluations table
-- ============================================

CREATE TABLE IF NOT EXISTS submission_evaluations (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    submission_id BIGINT NULL REFERENCES submissions(id) ON DELETE SET NULL,
    evaluation_data JSONB NOT NULL,
    is_valid BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_user_id ON submission_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_project_id ON submission_evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_submission_id ON submission_evaluations(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_user_project ON submission_evaluations(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_created_at ON submission_evaluations(created_at DESC);

-- ============================================
-- Step 2: Remove evaluation fields from submissions table
-- ============================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_submissions_llm_evaluation_is_valid;

-- Remove columns
ALTER TABLE submissions 
DROP COLUMN IF EXISTS llm_evaluation;

ALTER TABLE submissions 
DROP COLUMN IF EXISTS llm_evaluation_is_valid;

ALTER TABLE submissions 
DROP COLUMN IF EXISTS llm_evaluation_created_at;

-- ============================================
-- Migration complete!
-- ============================================
