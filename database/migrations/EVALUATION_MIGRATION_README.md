# Submission Evaluations Migration Guide

This migration refactors the LLM evaluation system to use a separate `submission_evaluations` table instead of storing evaluation data directly in the `submissions` table.

## Why This Change?

- Evaluations can happen **before** submissions are created
- Users can get evaluated multiple times (e.g., after code changes) before submitting
- Evaluations are preserved even if user never submits
- Better data separation and querying

## Migration Steps

### For Local PostgreSQL:

**Option 1: Use the script**
```bash
cd /Users/nishantbalepur/Desktop/Repositories/helpful-coding
./database/migrations/run_migrations_local.sh
```

**Option 2: Run manually**
```bash
psql -h localhost -U postgres -d helpful_coding -f database/migrations/create_submission_evaluations_table.sql
psql -h localhost -U postgres -d helpful_coding -f database/migrations/remove_llm_evaluation_from_submissions.sql
```

### For Supabase:

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `database/migrations/run_migrations_supabase.sql`
3. Run the script

**Note:** Supabase uses `BIGSERIAL` and `BIGINT` instead of `SERIAL` and `INTEGER`, and references `auth.users` instead of `users`. The Supabase script handles these differences.

## SQL Code

### Local PostgreSQL (Standard):

```sql
-- Step 1: Create submission_evaluations table
CREATE TABLE IF NOT EXISTS submission_evaluations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    submission_id INTEGER NULL REFERENCES submissions(id) ON DELETE SET NULL,
    evaluation_data JSONB NOT NULL,
    is_valid BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_user_id ON submission_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_project_id ON submission_evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_submission_id ON submission_evaluations(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_user_project ON submission_evaluations(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_created_at ON submission_evaluations(created_at DESC);

-- Step 2: Remove evaluation fields from submissions table
DROP INDEX IF EXISTS idx_submissions_llm_evaluation_is_valid;
ALTER TABLE submissions DROP COLUMN IF EXISTS llm_evaluation;
ALTER TABLE submissions DROP COLUMN IF EXISTS llm_evaluation_is_valid;
ALTER TABLE submissions DROP COLUMN IF EXISTS llm_evaluation_created_at;
```

### Supabase:

```sql
-- Step 1: Create submission_evaluations table
CREATE TABLE IF NOT EXISTS submission_evaluations (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    submission_id BIGINT NULL REFERENCES submissions(id) ON DELETE SET NULL,
    evaluation_data JSONB NOT NULL,
    is_valid BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_user_id ON submission_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_project_id ON submission_evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_submission_id ON submission_evaluations(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_user_project ON submission_evaluations(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_submission_evaluations_created_at ON submission_evaluations(created_at DESC);

-- Step 2: Remove evaluation fields from submissions table
DROP INDEX IF EXISTS idx_submissions_llm_evaluation_is_valid;
ALTER TABLE submissions DROP COLUMN IF EXISTS llm_evaluation;
ALTER TABLE submissions DROP COLUMN IF EXISTS llm_evaluation_is_valid;
ALTER TABLE submissions DROP COLUMN IF EXISTS llm_evaluation_created_at;
```

## What Changed in the Code

1. **New Table**: `submission_evaluations` stores all evaluation data
2. **Backend**: `/api/submissions/evaluate` now saves evaluation immediately and returns `evaluation_id`
3. **Backend**: `/api/submissions` accepts `evaluation_id` and links it to the submission
4. **Frontend**: Stores `evaluation_id` and passes it when submitting
5. **Models**: Removed evaluation fields from `Submission`, added `SubmissionEvaluation` model

## Verification

After running migrations, verify:

```sql
-- Check table exists
SELECT * FROM submission_evaluations LIMIT 1;

-- Check columns removed from submissions
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'submissions' 
AND column_name LIKE '%llm_evaluation%';
-- Should return 0 rows
```
