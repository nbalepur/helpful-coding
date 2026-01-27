-- Migration: Create submission_evaluations table
-- Date: 2025-01-26
-- Description: Creates a separate table for storing LLM-as-a-judge evaluation results
--              This allows evaluations to exist independently of submissions

CREATE TABLE IF NOT EXISTS submission_evaluations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    submission_id INTEGER NULL REFERENCES submissions(id) ON DELETE SET NULL,
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
