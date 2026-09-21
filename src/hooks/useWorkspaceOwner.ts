import { useEffect, useMemo, useState } from 'react';
import { browserStorageAdapter } from '../storage/dataSafety.js';
import { readWorkspaceOwner, resolveWorkspaceAuth, setWorkspaceOwner, workspaceOwnerKey, type WorkspaceOwner } from '../storage/workspace.js';

/** Session identity is authoritative; a stale persisted owner is never trusted for rendering or cloud writes. */
export function useWorkspaceOwner(sessionUserId: string | undefined, authResolved: boolean): { owner: WorkspaceOwner | undefined; isReady: boolean } {
  const resolution = useMemo(() => resolveWorkspaceAuth(authResolved, sessionUserId), [authResolved, sessionUserId]);
  const owner = resolution.state === 'resolved' ? resolution.owner : undefined;
  const ownerKey = owner ? workspaceOwnerKey(owner) : undefined;
  const [readyOwnerKey, setReadyOwnerKey] = useState<string | undefined>();

  useEffect(() => {
    if (!owner || !ownerKey) {
      setReadyOwnerKey(undefined);
      return;
    }
    if (workspaceOwnerKey(readWorkspaceOwner(browserStorageAdapter)) !== ownerKey) setWorkspaceOwner(browserStorageAdapter, owner);
    setReadyOwnerKey(ownerKey);
  }, [owner, ownerKey]);

  return { owner, isReady: Boolean(ownerKey && readyOwnerKey === ownerKey) };
}
