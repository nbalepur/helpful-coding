#!/bin/bash
# Script to run migrations locally
# Usage: ./run_migrations_local.sh

set -e

echo "Running migrations for local PostgreSQL database..."

# Load environment variables
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=helpful_coding
export PGUSER=postgres
export PGPASSWORD=password

# Create submission_evaluations table
echo "Creating submission_evaluations table..."
psql -h localhost -U postgres -d helpful_coding -f database/migrations/create_submission_evaluations_table.sql

# Remove evaluation fields from submissions table
echo "Removing evaluation fields from submissions table..."
psql -h localhost -U postgres -d helpful_coding -f database/migrations/remove_llm_evaluation_from_submissions.sql

echo "✅ Migrations completed successfully!"
