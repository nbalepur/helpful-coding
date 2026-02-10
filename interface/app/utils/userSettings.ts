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

/**
 * Check if tutorial is completed from user settings
 */
export function isTutorialCompletedFromSettings(userSettings?: Record<string, any>): boolean {
  if (!userSettings) return false;
  // Support legacy playgroundCompleted key for backward compatibility
  return userSettings.tutorialCompleted === true || userSettings.playgroundCompleted === true;
}

/**
 * Set tutorial as completed in user settings
 */
export async function setTutorialCompletedInSettings(
  userId: number,
  currentSettings?: Record<string, any>,
  token?: string
): Promise<void> {
  const updatedSettings = {
    ...(currentSettings || {}),
    tutorialCompleted: true,
  };
  await updateUserSettings(userId, updatedSettings, token);
}

