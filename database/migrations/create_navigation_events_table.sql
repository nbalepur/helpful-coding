-- Migration: Create navigation_events table
-- Date: 2025-01-XX
-- Description: Creates table for storing navigation events (tab switching, window focus changes) during skill checks

CREATE TABLE IF NOT EXISTS navigation_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id VARCHAR(255),
    test_type VARCHAR(50) NOT NULL CHECK (test_type IN ('pre-test', 'post-test')),
    time_away_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_navigation_events_user_id ON navigation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_navigation_events_question_id ON navigation_events(question_id);
CREATE INDEX IF NOT EXISTS idx_navigation_events_test_type ON navigation_events(test_type);
CREATE INDEX IF NOT EXISTS idx_navigation_events_user_test ON navigation_events(user_id, test_type);

