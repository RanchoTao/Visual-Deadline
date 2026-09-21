import type { UserProfile } from '../types/task';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceOwner, readWorkspaceValue, removeWorkspaceValue, workspaceStorageKey, writeWorkspaceValue } from './workspace';

export function loadSettings() {
  return {
    profile: readWorkspaceValue<UserProfile | null>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.profile, null),
    onboardingComplete: readWorkspaceValue<boolean>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.onboardingComplete, false),
  };
}

export function saveSettings(settings: { profile?: UserProfile | null; onboardingComplete?: boolean }): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  if (settings.profile !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.profile, settings.profile);
  if (settings.onboardingComplete !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.onboardingComplete, settings.onboardingComplete);
}

export function clearSettings(): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.profile);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.onboardingComplete);
}

export function hasCompletedOnboardingFlag(): boolean {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  return browserStorageAdapter.getItem(workspaceStorageKey(owner, storageKeys.onboardingComplete)) !== null;
}
