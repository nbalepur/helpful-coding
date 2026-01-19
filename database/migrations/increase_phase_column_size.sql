-- Migration: Increase phase and test_type column sizes to support retake_{uuid} format
-- Date: 2025-01-XX
-- Description: Increases phase column size from VARCHAR(20) to VARCHAR(100) and test_type from VARCHAR(50) to VARCHAR(100) 
--              to accommodate retake_{uuid} format (43+ characters)

-- Update user_mcqa_skill_responses table
ALTER TABLE user_mcqa_skill_responses 
ALTER COLUMN phase TYPE VARCHAR(100);

-- Update user_code_skill_responses table
ALTER TABLE user_code_skill_responses 
ALTER COLUMN phase TYPE VARCHAR(100);

-- Update report_skill_check_questions table
ALTER TABLE report_skill_check_questions 
ALTER COLUMN phase TYPE VARCHAR(100);

-- Update navigation_events table
ALTER TABLE navigation_events 
ALTER COLUMN test_type TYPE VARCHAR(100);
