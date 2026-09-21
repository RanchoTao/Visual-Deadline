import { useEffect, useMemo, useState } from 'react';
import { browserStorageAdapter } from '../storage/dataSafety.js';
import { guestWorkspaceOwner, readWorkspaceOwner, setWorkspaceOwner, userWorkspaceOwner, workspaceOwnerKey, type WorkspaceOwner } from '../storage/workspace.js';

/** Session identity is authoritative; a stale persisted owner is never trusted for rendering or cloud writes. */
export function useWorkspaceOwner(sessionUserId: string | undefined): { owner: WorkspaceOwner; isReady: boolean } {
  const owner = useMemo(() => sessionUserId ? userWorkspaceOwner(sessionUserId) : guestWorkspaceOwner(), [sessionUserId]);
  const ownerKey = workspaceOwnerKey(owner);
  const [readyOwnerKey, setReadyOwnerKey] = useState(() => workspaceOwnerKey(readWorkspaceOwner(browserStorageAdapter)));

  useEffect(() => {
    if (workspaceOwnerKey(readWorkspaceOwner(browserStorageAdapter)) !== ownerKey) setWorkspaceOwner(browserStorageAdapter, owner);
    setReadyOwnerKey(ownerKey);
  }, [owner, ownerKey]);

  return { owner, isReady: readyOwnerKey === ownerKey };
}
