-- Migration: Add report_type and report_rationale columns to submission_feedback table
-- Date: 2024
-- Description: Adds fields to store report category and rationale when users report submissions

-- Add report_type column (nullable, allows existing records to remain valid)
ALTER TABLE submission_feedback 
ADD COLUMN IF NOT EXISTS report_type VARCHAR(100);

-- Add report_rationale column (nullable, allows existing records to remain valid)
ALTER TABLE submission_feedback 
ADD COLUMN IF NOT EXISTS report_rationale TEXT;

-- Optional: Add index on report_type for faster queries if needed
-- CREATE INDEX IF NOT EXISTS idx_submission_feedback_report_type ON submission_feedback(report_type);

