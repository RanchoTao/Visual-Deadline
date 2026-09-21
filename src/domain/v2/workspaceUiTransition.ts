/**
 * UI state that is meaningful only for the workspace that produced it.
 * It deliberately excludes device-level navigation and viewport state.
 */
export interface OwnerScopedUiState {
  ownerKey: string | undefined;
  isFormOpen: boolean;
  editingTask: unknown | undefined;
  isRecalibrationOpen: boolean;
  recalibrationPressure: number;
  toastAchievement: unknown | undefined;
  welcomeBackMessage: unknown | undefined;
  cloudToast: string | undefined;
  cloudStatus: string | undefined;
  cloudError: string | undefined;
  lifeEventCloudError: string | undefined;
  isCloudLoading: boolean;
  isCloudReady: boolean;
  isLifeEventCloudReady: boolean;
  guestImportPreview: unknown | undefined;
}

export function createOwnerScopedUiState(ownerKey: string | undefined, safeReferencePressure = 35): OwnerScopedUiState {
  return {
    ownerKey,
    isFormOpen: false,
    editingTask: undefined,
    isRecalibrationOpen: false,
    recalibrationPressure: safeReferencePressure,
    toastAchievement: undefined,
    welcomeBackMessage: undefined,
    cloudToast: undefined,
    cloudStatus: undefined,
    cloudError: undefined,
    lifeEventCloudError: undefined,
    isCloudLoading: false,
    isCloudReady: false,
    isLifeEventCloudReady: false,
    guestImportPreview: undefined,
  };
}

/**
 * An owner transition invalidates every user-data-carrying ephemeral surface.
 * The caller applies this before the next workspace can become render-ready.
 */
export function transitionOwnerScopedUiState(
  current: OwnerScopedUiState,
  nextOwnerKey: string | undefined,
  safeReferencePressure = 35,
): OwnerScopedUiState {
  if (current.ownerKey === nextOwnerKey) return current;
  return createOwnerScopedUiState(nextOwnerKey, safeReferencePressure);
}
