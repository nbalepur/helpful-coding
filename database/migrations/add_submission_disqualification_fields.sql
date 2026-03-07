-- Migration: Add disqualification fields to submissions
-- Description: Marks forced-timeout submissions and disqualified submissions.

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS is_forced_timeout_submission BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS is_disqualified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS disqualification_reason VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_submissions_is_forced_timeout_submission
ON submissions(is_forced_timeout_submission);

CREATE INDEX IF NOT EXISTS idx_submissions_is_disqualified
ON submissions(is_disqualified);
