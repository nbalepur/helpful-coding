-- Migration: Create comprehension_questions table
-- Date: 2024-12-XX
-- Description: Creates table for storing auto-generated comprehension questions about submissions

CREATE TABLE IF NOT EXISTS comprehension_questions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    question_name VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL CHECK (question_type IN ('mcqa', 'multi_select', 'free_response')),
    choices JSONB,
    answer TEXT,
    user_answer TEXT,
    score FLOAT CHECK (score >= 0.0 AND score <= 1.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_comprehension_questions_user_id ON comprehension_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_comprehension_questions_project_id ON comprehension_questions(project_id);
CREATE INDEX IF NOT EXISTS idx_comprehension_questions_user_project ON comprehension_questions(user_id, project_id);

