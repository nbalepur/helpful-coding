-- Migration: Add name column to mcqa_data table
-- Date: 2024-12-09
-- Description: Adds name field to store unique identifier for MCQA questions (e.g., 'choices_1', 'memory_2')

-- Add name column (nullable, allows existing records to remain valid)
ALTER TABLE mcqa_data 
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Add index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_mcqa_data_name ON mcqa_data(name);

