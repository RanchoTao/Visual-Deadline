import type { UserProfile } from '../types/task';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceValue, removeWorkspaceValue, workspaceStorageKey, writeWorkspaceValue, type WorkspaceOwner } from './workspace';

export function loadSettings(owner: WorkspaceOwner) {
  return {
    profile: readWorkspaceValue<UserProfile | null>(browserStorageAdapter, owner, storageKeys.profile, null),
    onboardingComplete: readWorkspaceValue<boolean>(browserStorageAdapter, owner, storageKeys.onboardingComplete, false),
  };
}

export function saveSettings(owner: WorkspaceOwner, settings: { profile?: UserProfile | null; onboardingComplete?: boolean }): void {
  if (settings.profile !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.profile, settings.profile);
  if (settings.onboardingComplete !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.onboardingComplete, settings.onboardingComplete);
}

export function clearSettings(owner: WorkspaceOwner): void {
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.profile);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.onboardingComplete);
}

export function hasCompletedOnboardingFlag(owner: WorkspaceOwner): boolean {
  return browserStorageAdapter.getItem(workspaceStorageKey(owner, storageKeys.onboardingComplete)) !== null;
}
