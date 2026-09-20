import { APP_NAME, SCHEMA_VERSION, storageKeys } from './schema.js';
import { EXPORTABLE_STORAGE_DOMAINS, STORAGE_DOMAIN_INVENTORY, STORAGE_INVENTORY_VERSION, type StorageDomainInventoryItem } from './inventory.js';

export const BACKUP_FORMAT = 'vd-data-backup';
export const BACKUP_SCHEMA_VERSION = '1.0';
export const APPLICATION_VERSION = '1.0.1';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BackupDomainEntry {
  version: number;
  present: boolean;
  status: 'ok' | 'corrupt';
  recordCount: number;
  checksum: string;
  payload?: unknown;
  raw?: string;
}

export interface AttachmentManifestEntry {
  id: string;
  domainId: string;
  ownerEntityId?: string;
  kind: 'avatar' | 'intake-asset' | 'source-reference';
  bucket?: string;
  storagePath?: string;
  localReference?: string;
  mimeType?: string;
  byteSize?: number;
  checksum?: string;
  availability: 'external-unverified' | 'reference-only' | 'missing';
  binaryIncluded: false;
}

export interface BackupWarning {
  code: string;
  message: string;
  domainId?: string;
}

export interface CompleteBackupEnvelope {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  app: typeof APP_NAME;
  metadata: {
    createdAt: string;
    exportedAt: string;
    applicationVersion: string;
    storageSchemaVersion: string;
    source: 'browser-local';
    inventoryVersion: number;
    complete: boolean;
    domainCount: number;
    totalRecordCount: number;
    contentChecksum: string;
  };
  inventory: Array<Pick<StorageDomainInventoryItem, 'id' | 'domainVersion' | 'ownership' | 'exportPolicy' | 'restorePolicy' | 'sensitivity' | 'attachmentPolicy' | 'cloudSync' | 'betaMigration' | 'notes'>>;
  domains: Record<string, BackupDomainEntry>;
  attachments: AttachmentManifestEntry[];
  warnings: BackupWarning[];
}

export interface RestorePlan {
  sourceSchemaVersion: string;
  writes: Array<{ domainId: string; storageKey: string; value: string | null }>;
  warnings: BackupWarning[];
  unknownDomains: string[];
}

export interface RestoreResult {
  ok: boolean;
  restoredDomainCount: number;
  rollbackCreated: boolean;
  rolledBack: boolean;
  warnings: BackupWarning[];
  error?: string;
}

const sensitiveKeyPattern = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|code[_-]?verifier|service[_-]?role[_-]?key)$/i;
const signedUrlParameterPattern = /^(?:token|signature|sig|expires|x-amz-|x-goog-|key-pair-id)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function checksumValue(value: unknown): string {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function stripSignedUrlParts(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (signedUrlParameterPattern.test(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    url.hash = '';
    return changed ? url.toString() : value;
  } catch {
    return value;
  }
}

function sanitizeValue(value: unknown, key = ''): unknown {
  if (sensitiveKeyPattern.test(key)) return key.toLowerCase().includes('api') ? '' : undefined;
  if (typeof value === 'string') return /url$/i.test(key) ? stripSignedUrlParts(value) : value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const sanitized = sanitizeValue(childValue, childKey);
    if (sanitized !== undefined) result[childKey] = sanitized;
  }
  return result;
}

function containsSecret(value: unknown, key = ''): boolean {
  if (sensitiveKeyPattern.test(key)) return typeof value === 'string' ? value.length > 0 : value != null;
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([childKey, childValue]) => containsSecret(childValue, childKey));
}

function recordCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return 1;
}

function payloadMatchesDomain(item: StorageDomainInventoryItem, value: unknown): boolean {
  if (Array.isArray(item.defaultValue)) return Array.isArray(value);
  if (typeof item.defaultValue === 'boolean') return typeof value === 'boolean';
  if (typeof item.defaultValue === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (isRecord(item.defaultValue)) return isRecord(value);
  if (item.id === 'pressure.baseline') return value === null || (typeof value === 'number' && Number.isFinite(value));
  return value === null || isRecord(value);
}

function inventorySnapshot(): CompleteBackupEnvelope['inventory'] {
  return STORAGE_DOMAIN_INVENTORY.map(({ id, domainVersion, ownership, exportPolicy, restorePolicy, sensitivity, attachmentPolicy, cloudSync, betaMigration, notes }) => ({
    id, domainVersion, ownership, exportPolicy, restorePolicy, sensitivity, attachmentPolicy, cloudSync, betaMigration, notes,
  }));
}

function attachmentId(domainId: string, reference: string): string {
  return `${domainId}:${checksumValue(reference).slice('fnv1a32:'.length)}`;
}

function collectAttachmentReferences(domainId: string, value: unknown, output: AttachmentManifestEntry[], key = '', ownerEntityId?: string): void {
  if (typeof value === 'string') {
    if (key === 'avatarUrl') output.push({ id: attachmentId(domainId, value), domainId, ownerEntityId, localReference: value, kind: 'avatar', availability: 'external-unverified', binaryIncluded: false });
    else if (key === 'sourceRefs' && value.trim()) output.push({ id: attachmentId(domainId, value), domainId, ownerEntityId, localReference: value, kind: 'source-reference', availability: 'reference-only', binaryIncluded: false });
    else if (key === 'content' && domainId === 'ai.artifacts') {
      try { collectAttachmentReferences(domainId, JSON.parse(value) as unknown, output, '', ownerEntityId); } catch { /* AI prose is not necessarily JSON. */ }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAttachmentReferences(domainId, item, output, key, ownerEntityId));
    return;
  }
  if (isRecord(value)) {
    const nextOwner = typeof value.id === 'string' ? value.id : ownerEntityId;
    if ('storagePath' in value || ('fileName' in value && 'mimeType' in value)) {
      const path = typeof value.storagePath === 'string' ? value.storagePath : '';
      const bucket = typeof value.bucket === 'string' ? value.bucket : path ? 'intake-assets' : undefined;
      output.push({
        id: typeof value.id === 'string' ? value.id : attachmentId(domainId, path || String(value.fileName || 'missing')),
        domainId,
        ownerEntityId: nextOwner,
        kind: 'intake-asset',
        bucket,
        storagePath: path || undefined,
        mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
        byteSize: typeof value.size === 'number' ? value.size : undefined,
        checksum: typeof value.checksum === 'string' ? value.checksum : undefined,
        availability: path ? 'reference-only' : 'missing',
        binaryIncluded: false,
      });
    }
    Object.entries(value).forEach(([childKey, child]) => {
      if (childKey !== 'storagePath') collectAttachmentReferences(domainId, child, output, childKey, nextOwner);
    });
  }
}

function envelopeContentChecksum(domains: Record<string, BackupDomainEntry>, attachments: AttachmentManifestEntry[]): string {
  return checksumValue({ domains, attachments });
}

export function createCompleteBackup(storage: StorageAdapter, exportedAt = new Date().toISOString()): CompleteBackupEnvelope {
  const domains: Record<string, BackupDomainEntry> = {};
  const attachments: AttachmentManifestEntry[] = [];
  const warnings: BackupWarning[] = [];

  for (const item of EXPORTABLE_STORAGE_DOMAINS) {
    const raw = storage.getItem(item.storageKey);
    if (raw === null) {
      const payload = sanitizeValue(item.defaultValue);
      domains[item.id] = { version: item.domainVersion, present: false, status: 'ok', recordCount: 0, checksum: checksumValue(null), payload };
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const payload = sanitizeValue(parsed);
      if (stableStringify(parsed) !== stableStringify(payload)) warnings.push({ code: 'SENSITIVE_FIELDS_EXCLUDED', domainId: item.id, message: `Sensitive or signed credential material was removed from ${item.id}.` });
      domains[item.id] = { version: item.domainVersion, present: true, status: 'ok', recordCount: recordCount(payload), checksum: checksumValue(payload), payload };
      collectAttachmentReferences(item.id, payload, attachments);
    } catch {
      domains[item.id] = { version: item.domainVersion, present: true, status: 'corrupt', recordCount: 0, checksum: checksumValue(raw), raw };
      warnings.push({ code: 'CORRUPT_LOCAL_DOMAIN', domainId: item.id, message: `${item.id} is not valid JSON. Raw bytes were retained for recovery evidence; this backup cannot be restored until resolved.` });
    }
  }

  for (const attachment of attachments) {
    if (attachment.availability === 'missing') warnings.push({ code: 'MISSING_ATTACHMENT_REFERENCE', domainId: attachment.domainId, message: `Attachment ${attachment.id} has metadata but no restorable path.` });
    else warnings.push({ code: 'ATTACHMENT_CONTENT_NOT_EMBEDDED', domainId: attachment.domainId, message: `Attachment ${attachment.id} is externally referenced; binary content is not embedded.` });
  }
  const totalRecordCount = Object.values(domains).reduce((sum, domain) => sum + domain.recordCount, 0);
  const contentChecksum = envelopeContentChecksum(domains, attachments);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: APP_NAME,
    metadata: { createdAt: exportedAt, exportedAt, applicationVersion: APPLICATION_VERSION, storageSchemaVersion: SCHEMA_VERSION, source: 'browser-local', inventoryVersion: STORAGE_INVENTORY_VERSION, complete: warnings.every((warning) => warning.code !== 'CORRUPT_LOCAL_DOMAIN'), domainCount: Object.keys(domains).length, totalRecordCount, contentChecksum },
    inventory: inventorySnapshot(),
    domains,
    attachments,
    warnings,
  };
}

function versionGreater(left: string, right: string): boolean {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function legacyDomains(raw: Record<string, unknown>): { domains: Record<string, BackupDomainEntry>; warnings: BackupWarning[] } | { error: string } {
  const app = raw.app;
  if (app !== undefined && app !== APP_NAME && app !== 'Visualized-Deadline') return { error: 'Backup does not belong to Visual Deadline.' };
  const schemaVersion = typeof raw.schemaVersion === 'string' ? raw.schemaVersion : 'legacy';
  if (schemaVersion !== 'legacy' && versionGreater(schemaVersion, '0.9')) return { error: `Unsupported future backup schema ${schemaVersion}.` };
  const data = isRecord(raw.data) ? raw.data : raw;
  const values: Record<string, unknown> = {};
  const assign = (id: string, value: unknown) => { if (value !== undefined) values[id] = value; };
  assign('tasks', data.tasks); assign('goals', data.goals);
  if (isRecord(data.pressure)) { assign('pressure.baseline', data.pressure.baselinePressure); assign('pressure.calibration', data.pressure.calibration); assign('pressure.history', data.pressure.history); }
  if (isRecord(data.social)) { assign('social.nodes', data.social.nodes); assign('social.layout', data.social.layoutVersion); }
  if (isRecord(data.lifeMap)) { assign('life-map.nodes', data.lifeMap.nodes); assign('life-map.layout', data.lifeMap.layoutVersion); }
  if (isRecord(data.lifeController)) assign('life-controller.events', data.lifeController.eventsByOwner);
  if (isRecord(data.logs)) { assign('achievements', data.logs.achievements); assign('ai.artifacts', data.logs.aiArtifacts); }
  if (isRecord(data.settings)) { assign('profile', data.settings.profile); assign('preferences.onboarding', data.settings.onboardingComplete); }
  const domains: Record<string, BackupDomainEntry> = {};
  for (const [id, value] of Object.entries(values)) domains[id] = { version: 1, present: true, status: 'ok', recordCount: recordCount(value), checksum: checksumValue(sanitizeValue(value)), payload: sanitizeValue(value) };
  return { domains, warnings: [{ code: 'LEGACY_PARTIAL_BACKUP', message: 'Legacy backup restored only the domains it contained; newer local domains were left unchanged.' }] };
}

export function buildRestorePlan(raw: unknown): { ok: true; plan: RestorePlan } | { ok: false; error: string; warnings: BackupWarning[] } {
  if (!isRecord(raw)) return { ok: false, error: 'Backup root must be an object.', warnings: [] };
  let domains: Record<string, BackupDomainEntry>;
  let warnings: BackupWarning[] = [];
  let sourceSchemaVersion = typeof raw.schemaVersion === 'string' ? raw.schemaVersion : 'legacy';

  if (raw.format === BACKUP_FORMAT) {
    if (raw.app !== APP_NAME) return { ok: false, error: 'Backup does not belong to Visual Deadline.', warnings };
    if (versionGreater(sourceSchemaVersion, BACKUP_SCHEMA_VERSION)) return { ok: false, error: `Unsupported future backup schema ${sourceSchemaVersion}.`, warnings };
    if (!isRecord(raw.metadata) || !isRecord(raw.domains) || !Array.isArray(raw.attachments)) return { ok: false, error: 'Backup is missing required metadata, domains, or attachments.', warnings };
    domains = raw.domains as Record<string, BackupDomainEntry>;
    const expected = envelopeContentChecksum(domains, raw.attachments as AttachmentManifestEntry[]);
    if (raw.metadata.contentChecksum !== expected) return { ok: false, error: 'Backup content checksum does not match.', warnings };
    if (raw.metadata.domainCount !== Object.keys(domains).length) return { ok: false, error: 'Backup domain count does not match its contents.', warnings };
    const totalRecordCount = Object.values(domains).reduce((sum, domain) => sum + (typeof domain.recordCount === 'number' ? domain.recordCount : 0), 0);
    if (raw.metadata.totalRecordCount !== totalRecordCount) return { ok: false, error: 'Backup total record count does not match its contents.', warnings };
  } else {
    const converted = legacyDomains(raw);
    if ('error' in converted) return { ok: false, error: converted.error, warnings };
    domains = converted.domains;
    warnings = converted.warnings;
  }

  const byId = new Map(EXPORTABLE_STORAGE_DOMAINS.map((item) => [item.id, item]));
  const writes: RestorePlan['writes'] = [];
  const unknownDomains: string[] = [];
  if (Object.keys(domains).length < EXPORTABLE_STORAGE_DOMAINS.length) warnings.push({ code: 'PARTIAL_BACKUP', message: 'Backup contains only a subset of current domains; omitted domains will remain unchanged.' });
  for (const [domainId, entry] of Object.entries(domains)) {
    const inventory = byId.get(domainId);
    if (!inventory) { unknownDomains.push(domainId); continue; }
    if (!isRecord(entry) || (entry.status !== 'ok' && entry.status !== 'corrupt') || typeof entry.present !== 'boolean' || typeof entry.version !== 'number') return { ok: false, error: `Invalid domain entry ${domainId}.`, warnings };
    if (entry.version > inventory.domainVersion) return { ok: false, error: `Domain ${domainId} uses unsupported future version ${entry.version}.`, warnings };
    if (entry.status === 'corrupt') return { ok: false, error: `Domain ${domainId} is marked corrupt and cannot be restored.`, warnings };
    if (entry.present) {
      if (!('payload' in entry)) return { ok: false, error: `Domain ${domainId} has no payload.`, warnings };
      if (entry.checksum !== checksumValue(entry.payload)) return { ok: false, error: `Domain ${domainId} checksum does not match.`, warnings };
      if (entry.recordCount !== recordCount(entry.payload)) return { ok: false, error: `Domain ${domainId} record count does not match.`, warnings };
      if (!payloadMatchesDomain(inventory, entry.payload)) return { ok: false, error: `Domain ${domainId} payload has an invalid shape.`, warnings };
      if (containsSecret(entry.payload)) return { ok: false, error: `Domain ${domainId} contains secret material and was refused.`, warnings };
      writes.push({ domainId, storageKey: inventory.storageKey, value: JSON.stringify(entry.payload) });
    } else {
      writes.push({ domainId, storageKey: inventory.storageKey, value: null });
    }
  }
  if (unknownDomains.length) warnings.push({ code: 'UNKNOWN_DOMAINS_SKIPPED', message: `Unknown domains were preserved in the source file but not written: ${unknownDomains.join(', ')}.` });
  if (writes.length === 0) return { ok: false, error: 'Backup contains no supported restorable domains.', warnings };
  return { ok: true, plan: { sourceSchemaVersion, writes, warnings, unknownDomains } };
}

export function parseBackupText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try { return { ok: true, value: JSON.parse(text) as unknown }; }
  catch { return { ok: false, error: 'File is not valid JSON.' }; }
}

export function restoreBackup(storage: StorageAdapter, raw: unknown, now = new Date().toISOString()): RestoreResult {
  const prepared = buildRestorePlan(raw);
  if (!prepared.ok) return { ok: false, restoredDomainCount: 0, rollbackCreated: false, rolledBack: false, warnings: prepared.warnings, error: prepared.error };
  const previous = new Map(prepared.plan.writes.map((write) => [write.storageKey, storage.getItem(write.storageKey)]));
  let rollbackCreated = false;
  try {
    const rollback = createCompleteBackup(storage, now);
    storage.setItem(storageKeys.restoreRollback, JSON.stringify(rollback));
    rollbackCreated = true;
    if (!rollback.metadata.complete) return { ok: false, restoredDomainCount: 0, rollbackCreated, rolledBack: false, warnings: prepared.plan.warnings, error: 'Current local data contains corrupt JSON; restore was not started because a complete rollback snapshot could not be created.' };
    for (const write of prepared.plan.writes) {
      if (write.value === null) storage.removeItem(write.storageKey);
      else storage.setItem(write.storageKey, write.value);
    }
    for (const write of prepared.plan.writes) {
      if (storage.getItem(write.storageKey) !== write.value) throw new Error(`Verification failed for ${write.domainId}.`);
    }
    return { ok: true, restoredDomainCount: prepared.plan.writes.length, rollbackCreated, rolledBack: false, warnings: prepared.plan.warnings };
  } catch (error) {
    try {
      for (const [key, value] of previous) value === null ? storage.removeItem(key) : storage.setItem(key, value);
    } catch {
      return { ok: false, restoredDomainCount: 0, rollbackCreated, rolledBack: false, warnings: prepared.plan.warnings, error: 'Restore failed and automatic rollback also failed. Use the retained rollback snapshot.' };
    }
    return { ok: false, restoredDomainCount: 0, rollbackCreated, rolledBack: true, warnings: prepared.plan.warnings, error: error instanceof Error ? error.message : 'Restore failed.' };
  }
}

export const browserStorageAdapter: StorageAdapter = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
