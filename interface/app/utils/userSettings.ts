/**
 * Utility functions for managing user settings in the database
 */

import { ENV } from '../config/env';

/**
 * Update user settings in the database
 */
export async function updateUserSettings(
  userId: number,
  settings: Record<string, any>,
  token?: string
): Promise<void> {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${ENV.BACKEND_URL}/api/users/${userId}/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ settings }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update user settings: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error updating user settings:', error);
    throw error;
  }
}

const WEBSITE_REQUIREMENTS_SKIPPED_KEY = 'websiteRequirementsSkipped';
const WEBSITE_REQUIREMENTS_CHOICE_MADE_KEY = 'websiteRequirementsChoiceMade';
const LOCAL_WEBSITE_REQUIREMENTS_SKIPPED_KEY = 'websiteRequirementsSkippedLocalOverride';
const LOCAL_WEBSITE_REQUIREMENTS_CHOICE_MADE_KEY = 'websiteRequirementsChoiceMadeLocalOverride';

const readLocalBoolean = (key: string): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(key) === 'true';
};

export function setWebsiteRequirementsChoiceLocal(skipWebsiteRequirements: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    LOCAL_WEBSITE_REQUIREMENTS_SKIPPED_KEY,
    String(skipWebsiteRequirements)
  );
  window.localStorage.setItem(LOCAL_WEBSITE_REQUIREMENTS_CHOICE_MADE_KEY, 'true');
}

export function hasWebsiteRequirementsChoiceFromSettings(userSettings?: Record<string, any>): boolean {
  if (!userSettings && !readLocalBoolean(LOCAL_WEBSITE_REQUIREMENTS_CHOICE_MADE_KEY)) {
    return false;
  }
  return (
    userSettings?.[WEBSITE_REQUIREMENTS_CHOICE_MADE_KEY] === true ||
    readLocalBoolean(LOCAL_WEBSITE_REQUIREMENTS_CHOICE_MADE_KEY)
  );
}

export function isWebsiteRequirementsSkippedFromSettings(userSettings?: Record<string, any>): boolean {
  if (!userSettings && !readLocalBoolean(LOCAL_WEBSITE_REQUIREMENTS_SKIPPED_KEY)) {
    return false;
  }
  return (
    userSettings?.[WEBSITE_REQUIREMENTS_SKIPPED_KEY] === true ||
    readLocalBoolean(LOCAL_WEBSITE_REQUIREMENTS_SKIPPED_KEY)
  );
}

export async function saveWebsiteRequirementsChoiceInSettings(
  userId: number,
  skipWebsiteRequirements: boolean,
  currentSettings?: Record<string, any>,
  token?: string
): Promise<void> {
  const updatedSettings = {
    ...(currentSettings || {}),
    [WEBSITE_REQUIREMENTS_SKIPPED_KEY]: skipWebsiteRequirements,
    [WEBSITE_REQUIREMENTS_CHOICE_MADE_KEY]: true,
  };
  await updateUserSettings(userId, updatedSettings, token);
}

/**
 * Check if playground is completed from user settings
 */
export function isPlaygroundCompletedFromSettings(userSettings?: Record<string, any>): boolean {
  if (!userSettings) return false;
  return userSettings.playgroundCompleted === true;
}

/**
 * Set playground as completed in user settings
 */
export async function setPlaygroundCompletedInSettings(
  userId: number,
  currentSettings?: Record<string, any>,
  token?: string
): Promise<void> {
  const updatedSettings = {
    ...(currentSettings || {}),
    playgroundCompleted: true,
  };
  await updateUserSettings(userId, updatedSettings, token);
}

