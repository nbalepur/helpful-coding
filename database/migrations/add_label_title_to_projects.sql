-- Migration: Add label and title columns to projects table
-- Date: 2025-01-XX
-- Description: Adds label and title fields to store additional task metadata from tasks.json

-- Add label column (nullable, allows existing records to remain valid)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS label VARCHAR(255);

-- Add title column (nullable, allows existing records to remain valid)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- Add index on label for faster lookups/filtering
CREATE INDEX IF NOT EXISTS idx_projects_label ON projects(label);

