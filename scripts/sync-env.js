#!/usr/bin/env node

/**
 * Sync environment variables from backend/.env to interface/.env.local
 * This ensures both frontend and backend use the same configuration
 */

const fs = require('fs');
const path = require('path');

// Paths
const backendEnvPath = path.join(__dirname, '../backend/.env');
const frontendEnvPath = path.join(__dirname, '../interface/.env.local');

// Check if backend/.env exists
if (!fs.existsSync(backendEnvPath)) {
  console.error('❌ Error: backend/.env not found!');
  process.exit(1);
}

// Read backend .env file
const backendEnvContent = fs.readFileSync(backendEnvPath, 'utf8');

// Parse environment variables
const envVars = {};
backendEnvContent.split('\n').forEach(line => {
  line = line.trim();
  
  // Skip comments and empty lines
  if (!line || line.startsWith('#')) return;
  
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    const value = valueParts.join('=').trim();
    envVars[key.trim()] = value;
  }
});

// Parse existing frontend .env.local to support local-first overrides for selected keys
const existingFrontendVars = {};
if (fs.existsSync(frontendEnvPath)) {
  const existingContent = fs.readFileSync(frontendEnvPath, 'utf8');
  existingContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;

    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      existingFrontendVars[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// Keys that should be editable directly in interface/.env.local and not overwritten from backend/.env
const localFirstFrontendVars = new Set([
  'NEXT_PUBLIC_NUM_TASKS_REQUIRED_UNTIL_POSTTEST',
  'NEXT_PUBLIC_RECREATION_TASK_ONE_MINUTES',
  'NEXT_PUBLIC_RECREATION_TASK_TWO_MINUTES',
  'NEXT_PUBLIC_GAME_TASK_ONE_MINUTES',
]);

const resolveFrontendVar = (key, backendValue, fallbackValue) => {
  if (localFirstFrontendVars.has(key) && existingFrontendVars[key]) {
    return existingFrontendVars[key];
  }
  return backendValue || fallbackValue;
};

// Map backend variables to frontend variables
const frontendEnvVars = {
  NEXT_PUBLIC_BACKEND_URL: envVars.BACKEND_URL || 'http://localhost:4828',
  NEXT_PUBLIC_BACKEND_WS_URL: envVars.BACKEND_WS_URL || 'ws://localhost:4828',
  NEXT_PUBLIC_FRONTEND_URL: envVars.FRONTEND_URL || 'http://localhost:4827',
  NEXT_PUBLIC_DEFAULT_BACKEND_PORT: envVars.DEFAULT_BACKEND_PORT || '5000',
  NEXT_PUBLIC_SHOW_PUBLIC_TESTS_ONLY: envVars.SHOW_PUBLIC_TESTS_ONLY || 'true',
  NEXT_PUBLIC_NUM_TASKS_REQUIRED_UNTIL_POSTTEST: resolveFrontendVar(
    'NEXT_PUBLIC_NUM_TASKS_REQUIRED_UNTIL_POSTTEST',
    envVars.NEXT_PUBLIC_NUM_TASKS_REQUIRED_UNTIL_POSTTEST || envVars.NUM_TASKS_REQUIRED_UNTIL_POSTTEST,
    '10'
  ),
  NEXT_PUBLIC_RECREATION_TASK_ONE_MINUTES: resolveFrontendVar(
    'NEXT_PUBLIC_RECREATION_TASK_ONE_MINUTES',
    envVars.RECREATION_TASK_ONE_MINUTES,
    '120'
  ),
  NEXT_PUBLIC_RECREATION_TASK_TWO_MINUTES: resolveFrontendVar(
    'NEXT_PUBLIC_RECREATION_TASK_TWO_MINUTES',
    envVars.RECREATION_TASK_TWO_MINUTES,
    '120'
  ),
  NEXT_PUBLIC_GAME_TASK_ONE_MINUTES: resolveFrontendVar(
    'NEXT_PUBLIC_GAME_TASK_ONE_MINUTES',
    envVars.GAME_TASK_ONE_MINUTES,
    '120'
  ),
  USE_LOCAL_EXECUTION: envVars.USE_LOCAL_EXECUTION || 'false',
};

// List of variables that are synced from backend (these will be overwritten)
const syncedVars = new Set(Object.keys(frontendEnvVars));

// Preserve existing variables from .env.local that aren't being synced
const preservedVars = {};
if (fs.existsSync(frontendEnvPath)) {
  const existingContent = fs.readFileSync(frontendEnvPath, 'utf8');
  existingContent.split('\n').forEach(line => {
    line = line.trim();
    
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) return;
    
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const varKey = key.trim();
      // Preserve variables that aren't being synced from backend
      if (!syncedVars.has(varKey)) {
        const value = valueParts.join('=').trim();
        preservedVars[varKey] = value;
      }
    }
  });
}

// Create frontend .env.local content
let frontendEnvContent = `# Auto-generated from backend/.env
# Synced variables: edit backend/.env and run 'npm run sync-env'
# Additional variables below are preserved and can be edited directly

# Backend API Configuration
NEXT_PUBLIC_BACKEND_URL=${frontendEnvVars.NEXT_PUBLIC_BACKEND_URL}
NEXT_PUBLIC_BACKEND_WS_URL=${frontendEnvVars.NEXT_PUBLIC_BACKEND_WS_URL}

# Frontend Configuration  
NEXT_PUBLIC_FRONTEND_URL=${frontendEnvVars.NEXT_PUBLIC_FRONTEND_URL}

# Default backend port for user code execution
NEXT_PUBLIC_DEFAULT_BACKEND_PORT=${frontendEnvVars.NEXT_PUBLIC_DEFAULT_BACKEND_PORT}

# Test Cases Configuration
# Set to 'false' to show ALL test cases (including private/hidden tests)
# Set to 'true' (or omit) to show only public test cases
NEXT_PUBLIC_SHOW_PUBLIC_TESTS_ONLY=${frontendEnvVars.NEXT_PUBLIC_SHOW_PUBLIC_TESTS_ONLY}

# Post-test prompt configuration
# Number of submitted game tasks required (with platformer completed) before post-test is prompted
NEXT_PUBLIC_NUM_TASKS_REQUIRED_UNTIL_POSTTEST=${frontendEnvVars.NEXT_PUBLIC_NUM_TASKS_REQUIRED_UNTIL_POSTTEST}

# Timed task configuration (minutes)
NEXT_PUBLIC_RECREATION_TASK_ONE_MINUTES=${frontendEnvVars.NEXT_PUBLIC_RECREATION_TASK_ONE_MINUTES}
NEXT_PUBLIC_RECREATION_TASK_TWO_MINUTES=${frontendEnvVars.NEXT_PUBLIC_RECREATION_TASK_TWO_MINUTES}
NEXT_PUBLIC_GAME_TASK_ONE_MINUTES=${frontendEnvVars.NEXT_PUBLIC_GAME_TASK_ONE_MINUTES}
`;

// Append preserved variables
if (Object.keys(preservedVars).length > 0) {
  frontendEnvContent += '\n';
  Object.entries(preservedVars).forEach(([key, value]) => {
    frontendEnvContent += `${key}=${value}\n`;
  });
}

// Write to frontend .env.local
fs.writeFileSync(frontendEnvPath, frontendEnvContent);

console.log('✅ Synced environment variables from backend/.env to interface/.env.local');
if (Object.keys(preservedVars).length > 0) {
  console.log(`   Preserved ${Object.keys(preservedVars).length} additional variable(s)`);
}

