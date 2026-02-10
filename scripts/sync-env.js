#!/usr/bin/env node

/**
 * Sync environment variables from root .env to interface/.env.local
 * This ensures both frontend and backend use the same configuration
 */

const fs = require('fs');
const path = require('path');

// Paths
const rootEnvPath = path.join(__dirname, '../.env');
const frontendEnvPath = path.join(__dirname, '../interface/.env.local');

// Check if root .env exists
if (!fs.existsSync(rootEnvPath)) {
  console.error('❌ Error: .env not found at project root!');
  process.exit(1);
}

// Read root .env file
const rootEnvContent = fs.readFileSync(rootEnvPath, 'utf8');

// Parse environment variables
const envVars = {};
rootEnvContent.split('\n').forEach(line => {
  line = line.trim();
  
  // Skip comments and empty lines
  if (!line || line.startsWith('#')) return;
  
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    const value = valueParts.join('=').trim();
    envVars[key.trim()] = value;
  }
});

// Map backend variables to frontend variables (only vars the frontend actually uses)
// Support both BACKEND_URL/FRONTEND_URL and NEXT_PUBLIC_* names in root .env
const backendUrl = envVars.BACKEND_URL || envVars.NEXT_PUBLIC_BACKEND_URL;
const frontendUrl = envVars.FRONTEND_URL || envVars.NEXT_PUBLIC_FRONTEND_URL;

function parsePortFromUrl(urlStr) {
  if (!urlStr || urlStr === 'undefined') return null;
  try {
    const u = new URL(urlStr.trim());
    return u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80);
  } catch {
    return null;
  }
}

const fromContactEmail = envVars.FROM_CONTACT_EMAIL || envVars.NEXT_PUBLIC_FROM_CONTACT_EMAIL || '';
const fromContactName = envVars.FROM_CONTACT_NAME || envVars.NEXT_PUBLIC_FROM_CONTACT_NAME || '';
const giveUpSeconds = envVars.NEXT_PUBLIC_GIVE_UP_SECONDS != null && envVars.NEXT_PUBLIC_GIVE_UP_SECONDS !== ''
  ? envVars.NEXT_PUBLIC_GIVE_UP_SECONDS
  : null;
const frontendPort = parsePortFromUrl(frontendUrl) || 3000;
const frontendEnvVars = {
  NEXT_PUBLIC_BACKEND_URL: backendUrl,
  NEXT_PUBLIC_FRONTEND_URL: frontendUrl,
  ...(fromContactEmail && { NEXT_PUBLIC_FROM_CONTACT_EMAIL: fromContactEmail }),
  ...(fromContactName && { NEXT_PUBLIC_FROM_CONTACT_NAME: fromContactName }),
  ...(giveUpSeconds != null && { NEXT_PUBLIC_GIVE_UP_SECONDS: giveUpSeconds }),
  PORT: String(frontendPort), // Next.js uses PORT for dev/start
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
let frontendEnvContent = `# Auto-generated from root .env
# Synced variables: edit .env at project root and run 'npm run sync-env'
# Additional variables below are preserved and can be edited directly

# Backend API Configuration
NEXT_PUBLIC_BACKEND_URL=${frontendEnvVars.NEXT_PUBLIC_BACKEND_URL}

# Frontend Configuration (PORT parsed from NEXT_PUBLIC_FRONTEND_URL)
NEXT_PUBLIC_FRONTEND_URL=${frontendEnvVars.NEXT_PUBLIC_FRONTEND_URL}
PORT=${frontendEnvVars.PORT}
`;
if (frontendEnvVars.NEXT_PUBLIC_FROM_CONTACT_EMAIL) {
  frontendEnvContent += `
# Contact email (from FROM_CONTACT_EMAIL)
NEXT_PUBLIC_FROM_CONTACT_EMAIL=${frontendEnvVars.NEXT_PUBLIC_FROM_CONTACT_EMAIL}
`;
}
if (frontendEnvVars.NEXT_PUBLIC_FROM_CONTACT_NAME) {
  frontendEnvContent += `
# Contact name (from FROM_CONTACT_NAME)
NEXT_PUBLIC_FROM_CONTACT_NAME=${frontendEnvVars.NEXT_PUBLIC_FROM_CONTACT_NAME}
`;
}
if (frontendEnvVars.NEXT_PUBLIC_GIVE_UP_SECONDS !== undefined) {
  frontendEnvContent += `
# Function tasks: seconds after which Submit is enabled even if tests don't pass
NEXT_PUBLIC_GIVE_UP_SECONDS=${frontendEnvVars.NEXT_PUBLIC_GIVE_UP_SECONDS}
`;
}

// Append preserved variables
if (Object.keys(preservedVars).length > 0) {
  frontendEnvContent += '\n';
  Object.entries(preservedVars).forEach(([key, value]) => {
    frontendEnvContent += `${key}=${value}\n`;
  });
}

// Write to frontend .env.local
fs.writeFileSync(frontendEnvPath, frontendEnvContent);

console.log('✅ Synced environment variables from root .env to interface/.env.local');
if (Object.keys(preservedVars).length > 0) {
  console.log(`   Preserved ${Object.keys(preservedVars).length} additional variable(s)`);
}

