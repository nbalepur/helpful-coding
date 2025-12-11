-- Migration: Add question column to comprehension_questions table
-- Date: 2024-12-XX
-- Description: Adds question column to store the actual question text/stem

-- Check if table exists, if not create it with all columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'comprehension_questions') THEN
        CREATE TABLE comprehension_questions (
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
        
        CREATE INDEX IF NOT EXISTS idx_comprehension_questions_user_id ON comprehension_questions(user_id);
        CREATE INDEX IF NOT EXISTS idx_comprehension_questions_project_id ON comprehension_questions(project_id);
        CREATE INDEX IF NOT EXISTS idx_comprehension_questions_user_project ON comprehension_questions(user_id, project_id);
    ELSE
        -- Table exists, add the column if it doesn't exist
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'comprehension_questions' 
            AND column_name = 'question'
        ) THEN
            -- Add column as nullable first
            ALTER TABLE comprehension_questions ADD COLUMN question TEXT;
            
            -- Update existing rows with default value
            UPDATE comprehension_questions 
            SET question = question_name 
            WHERE question IS NULL;
            
            -- Make it NOT NULL
            ALTER TABLE comprehension_questions ALTER COLUMN question SET NOT NULL;
        END IF;
    END IF;
END $$;

