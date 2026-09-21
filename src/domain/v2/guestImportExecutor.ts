import type { V2BackfillPlan } from './backfill.js';
import type { GuestImportState, PendingGuestImportSnapshot } from './guestImport.js';
import { advanceGuestImportState, validatePendingGuestImportConfirmation, type GuestImportConfirmation, type GuestImportPreview } from './guestImport.js';
import type { StorageAdapter } from '../../storage/dataSafety.js';
import type { UserId } from './shared.js';

export interface GuestImportExecutionInput { readonly authenticatedUserId: UserId; readonly snapshot: PendingGuestImportSnapshot; readonly plan: V2BackfillPlan; readonly clientRequestId: string; }
export interface GuestImportExecutionResult { readonly state: Extract<GuestImportState, 'completed' | 'needs_resolution' | 'failed_recoverable'>; readonly reconciliationRequired: boolean; }
export interface GuestImportExecutor { execute(input: GuestImportExecutionInput): Promise<GuestImportExecutionResult>; }

/** Browser/production executor is intentionally impossible until v2 writes are explicitly approved. */
export class ProductionGuestImportExecutor implements GuestImportExecutor {
  async execute(): Promise<GuestImportExecutionResult> { throw new Error('GUEST_IMPORT_RUNTIME_DISABLED_UNTIL_V2_SCHEMA_DEPLOYMENT'); }
}

/** Test-only adapter: the caller supplies the PR F local apply/ledger implementation. */
export class LocalGuestImportExecutor implements GuestImportExecutor {
  constructor(private readonly apply: (input: GuestImportExecutionInput) => Promise<GuestImportExecutionResult>) {}
  async execute(input: GuestImportExecutionInput): Promise<GuestImportExecutionResult> {
    if (!input.authenticatedUserId || !input.clientRequestId.trim()) throw new Error('GUEST_IMPORT_AUTHENTICATED_OWNER_REQUIRED');
    if (input.plan.records.some((record) => record.canonical?.userId !== input.authenticatedUserId)) throw new Error('GUEST_IMPORT_OWNER_MISMATCH');
    return this.apply(input);
  }
}

/** State coordinator shared by the disabled production path and injected local test adapter. */
export class GuestImportCoordinator {
  constructor(private readonly storage: StorageAdapter, private readonly executor: GuestImportExecutor) {}
  async confirm(snapshot: PendingGuestImportSnapshot, preview: GuestImportPreview, confirmation: GuestImportConfirmation, authenticatedUserId: UserId, plan: V2BackfillPlan): Promise<GuestImportExecutionResult> {
    validatePendingGuestImportConfirmation(this.storage, snapshot, preview, confirmation, authenticatedUserId);
    const confirmed = advanceGuestImportState(this.storage, snapshot, 'user_confirmed', confirmation.clientRequestId);
    advanceGuestImportState(this.storage, confirmed, 'import_running', confirmation.clientRequestId);
    try {
      const result = await this.executor.execute({ authenticatedUserId, snapshot: confirmed, plan, clientRequestId: confirmation.clientRequestId });
      advanceGuestImportState(this.storage, confirmed, result.state, confirmation.clientRequestId);
      return result;
    } catch (error) {
      advanceGuestImportState(this.storage, confirmed, 'failed_recoverable', confirmation.clientRequestId);
      throw error;
    }
  }
}
