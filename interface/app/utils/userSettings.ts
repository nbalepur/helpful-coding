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

