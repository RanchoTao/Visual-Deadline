import type { UserProfile } from '../types/task';
import { clearValue, hasValue, loadValue, saveValue, storageKeys } from './schema';

export function loadSettings() {
  return {
    profile: loadValue<UserProfile | null>(storageKeys.profile, null),
    onboardingComplete: loadValue<boolean>(storageKeys.onboardingComplete, false),
  };
}

export function saveSettings(settings: { profile?: UserProfile | null; onboardingComplete?: boolean }): void {
  if (settings.profile !== undefined) saveValue(storageKeys.profile, settings.profile);
  if (settings.onboardingComplete !== undefined) saveValue(storageKeys.onboardingComplete, settings.onboardingComplete);
}

export function clearSettings(): void {
  clearValue(storageKeys.profile);
  clearValue(storageKeys.onboardingComplete);
}

export function hasCompletedOnboardingFlag(): boolean {
  return hasValue(storageKeys.onboardingComplete);
}
