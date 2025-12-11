-- Migration: Add docstring_py and docstring_js columns to code_data table
-- Date: 2024-12-19
-- Description: Adds docstring fields to store Python and JavaScript docstrings for code questions

-- Add docstring_py column (nullable, allows existing records to remain valid)
ALTER TABLE code_data 
ADD COLUMN IF NOT EXISTS docstring_py TEXT;

-- Add docstring_js column (nullable, allows existing records to remain valid)
ALTER TABLE code_data 
ADD COLUMN IF NOT EXISTS docstring_js TEXT;

