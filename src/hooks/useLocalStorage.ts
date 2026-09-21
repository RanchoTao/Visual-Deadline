import { useEffect, useState } from 'react';
import { browserStorageAdapter, readWorkspaceOwner, readWorkspaceValue, restoreLatestBackup, saveAutoBackup, setRecoveryNotice, STORAGE_CHANGE_EVENT, WORKSPACE_OWNER_CHANGE_EVENT, workspaceOwnerKey, workspaceStorageKey, writeWorkspaceValue } from '../storage';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const readValue = (): T => {
    const owner = readWorkspaceOwner(browserStorageAdapter);
    const scopedKey = workspaceStorageKey(owner, key);
    try {
      const raw = browserStorageAdapter.getItem(scopedKey);
      if (raw === null) return initialValue;
      JSON.parse(raw);
      return readWorkspaceValue(browserStorageAdapter, owner, key, initialValue);
    } catch {
      // Preserve the pre-hotfix guest recovery behavior without restoring into an account cache.
      if (owner.kind === 'guest' && restoreLatestBackup()) {
        setRecoveryNotice('检测到本地数据异常，已自动从最近备份恢复。');
        return readWorkspaceValue(browserStorageAdapter, owner, key, initialValue);
      }
      return initialValue;
    }
  };

  const [value, setValue] = useState<T>(readValue);
  const [boundOwnerKey, setBoundOwnerKey] = useState(() => workspaceOwnerKey(readWorkspaceOwner(browserStorageAdapter)));

  useEffect(() => {
    const owner = readWorkspaceOwner(browserStorageAdapter);
    if (boundOwnerKey !== workspaceOwnerKey(owner)) return;
    writeWorkspaceValue(browserStorageAdapter, owner, key, value);
    // Existing backup envelopes intentionally preserve the legacy guest workspace only.
    if (owner.kind === 'guest') saveAutoBackup();
  }, [boundOwnerKey, key, value]);

  useEffect(() => {
    function syncValue() {
      const owner = readWorkspaceOwner(browserStorageAdapter);
      const ownerKey = workspaceOwnerKey(owner);
      const nextValue = readValue();
      setBoundOwnerKey(ownerKey);
      setValue((currentValue) => (JSON.stringify(currentValue) === JSON.stringify(nextValue) ? currentValue : nextValue));
    }

    syncValue();
    window.addEventListener(STORAGE_CHANGE_EVENT, syncValue);
    window.addEventListener('storage', syncValue);
    window.addEventListener(WORKSPACE_OWNER_CHANGE_EVENT, syncValue);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncValue);
      window.removeEventListener('storage', syncValue);
      window.removeEventListener(WORKSPACE_OWNER_CHANGE_EVENT, syncValue);
    };
  }, [initialValue, key]);

  return [value, setValue] as const;
}
