import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { bindWorkspaceValue, browserStorageAdapter, canWriteWorkspaceBinding, readWorkspaceValue, restoreLatestBackup, saveAutoBackup, setRecoveryNotice, STORAGE_CHANGE_EVENT, updateWorkspaceBinding, workspaceOwnerKey, workspaceStorageKey, writeWorkspaceValue, type WorkspaceOwner, type WorkspaceValueBinding } from '../storage';

const WorkspaceOwnerContext = createContext<WorkspaceOwner | undefined>(undefined);

/** Child workspace stores inherit the session-derived owner, never the browser marker. */
export function WorkspaceOwnerProvider({ owner, children }: { owner: WorkspaceOwner | undefined; children: ReactNode }) {
  const value = useMemo(() => owner, [owner]);
  return createElement(WorkspaceOwnerContext.Provider, { value }, children);
}

export function useCurrentWorkspaceOwner(): WorkspaceOwner | undefined {
  return useContext(WorkspaceOwnerContext);
}

function readBoundValue<T>(owner: WorkspaceOwner, key: string, fallback: T): T {
  const scopedKey = workspaceStorageKey(owner, key);
  try {
    const raw = browserStorageAdapter.getItem(scopedKey);
    if (raw === null) return fallback;
    JSON.parse(raw);
    return readWorkspaceValue(browserStorageAdapter, owner, key, fallback);
  } catch {
    // Preserve guest recovery without ever restoring legacy data into a user cache.
    if (owner.kind === 'guest' && restoreLatestBackup()) {
      setRecoveryNotice('检测到本地数据异常，已自动从最近备份恢复。');
      return readWorkspaceValue(browserStorageAdapter, owner, key, fallback);
    }
    return fallback;
  }
}

/**
 * The owner argument is authoritative. A stale setter can update only a binding
 * already hydrated for that same owner; it cannot write into a later workspace.
 */
export function useWorkspaceLocalStorage<T>(owner: WorkspaceOwner | undefined, key: string, initialValue: T): readonly [T, Dispatch<SetStateAction<T>>, boolean] {
  const ownerKey = owner ? workspaceOwnerKey(owner) : undefined;
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;
  const [binding, setBinding] = useState<WorkspaceValueBinding<T>>(() => bindWorkspaceValue(owner, initialValue, (activeOwner) => readBoundValue(activeOwner, key, initialValue)));
  const isHydrated = Boolean(owner && binding.ownerKey === ownerKey);

  useEffect(() => {
    setBinding(bindWorkspaceValue(owner, initialValueRef.current, (activeOwner) => readBoundValue(activeOwner, key, initialValueRef.current)));
  }, [key, ownerKey]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setBinding((current) => updateWorkspaceBinding(current, owner, (value) => typeof next === 'function' ? (next as (previous: T) => T)(value) : next));
  }, [owner, ownerKey]);

  useEffect(() => {
    if (!owner || !canWriteWorkspaceBinding(binding, owner)) return;
    writeWorkspaceValue(browserStorageAdapter, owner, key, binding.value);
    // Existing backup envelopes intentionally protect the legacy guest workspace only.
    if (owner.kind === 'guest') saveAutoBackup();
  }, [binding, key, owner, ownerKey]);

  useEffect(() => {
    if (!owner) return;
    const syncValue = () => {
      const next = bindWorkspaceValue(owner, initialValueRef.current, (activeOwner) => readBoundValue(activeOwner, key, initialValueRef.current));
      setBinding((current) => current.ownerKey === next.ownerKey && JSON.stringify(current.value) === JSON.stringify(next.value) ? current : next);
    };
    window.addEventListener(STORAGE_CHANGE_EVENT, syncValue);
    window.addEventListener('storage', syncValue);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncValue);
      window.removeEventListener('storage', syncValue);
    };
  }, [key, ownerKey]);

  return [isHydrated ? binding.value : initialValue, setValue, isHydrated] as const;
}

/** Compatibility surface for nested UI; ownership still comes only from the App session provider. */
export function useLocalStorage<T>(key: string, initialValue: T) {
  return useWorkspaceLocalStorage(useCurrentWorkspaceOwner(), key, initialValue);
}
