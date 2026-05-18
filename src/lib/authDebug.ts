export interface AuthDebugEntry {
  timestamp: string;
  path: string;
  error: {
    message: string;
    name?: string;
    status?: number;
    code?: string;
  };
  url: {
    pathname: string;
    search: string;
    hash: string;
  };
  userAgent: string;
  callbackParams: {
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    hasCode: boolean;
    hasErrorDescription: boolean;
  };
}

let lastAuthDebugEntry: AuthDebugEntry | undefined;

function readParamPresence(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const queryParams = new URLSearchParams(window.location.search);
  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  return queryParams.has(name) || hashParams.has(name);
}

function readErrorRecord(error: unknown): AuthDebugEntry['error'] {
  const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  return {
    message: error instanceof Error ? error.message : String(error ?? 'Unknown auth error'),
    name: error instanceof Error ? error.name : typeof errorRecord?.name === 'string' ? errorRecord.name : undefined,
    status: typeof errorRecord?.status === 'number' ? errorRecord.status : undefined,
    code: typeof errorRecord?.code === 'string' ? errorRecord.code : undefined,
  };
}

export function recordAuthDebugError(path: string, error: unknown): AuthDebugEntry {
  const entry: AuthDebugEntry = {
    timestamp: new Date().toISOString(),
    path,
    error: readErrorRecord(error),
    url: {
      pathname: typeof window === 'undefined' ? '' : window.location.pathname,
      search: typeof window === 'undefined' ? '' : window.location.search,
      hash: typeof window === 'undefined' ? '' : window.location.hash,
    },
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    callbackParams: {
      hasAccessToken: readParamPresence('access_token'),
      hasRefreshToken: readParamPresence('refresh_token'),
      hasCode: readParamPresence('code'),
      hasErrorDescription: readParamPresence('error_description'),
    },
  };

  lastAuthDebugEntry = entry;
  console.error('[VD Supabase Auth Debug]', entry);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AuthDebugEntry>('vd:auth-debug-error', { detail: entry }));
  }
  return entry;
}

export function getLastAuthDebugEntry(): AuthDebugEntry | undefined {
  return lastAuthDebugEntry;
}
