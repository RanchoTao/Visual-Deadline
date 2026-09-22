export const authenticatedPaths = new Set(['/app', '/app/tasks', '/app/plan', '/app/ops', '/app/review', '/settings', '/billing']);
const authEntryPaths = new Set(['/login', '/auth/callback']);

export function isAuthenticatedPath(pathname: string): boolean {
  return authenticatedPaths.has(pathname);
}

export function safeAuthenticatedNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  const pathname = value.split('?')[0].split('#')[0];
  return isAuthenticatedPath(pathname) ? value : '/app';
}

export function legacyRouteRedirect(pathname: string): string | undefined {
  return ({ '/home': '/app', '/tasks': '/app/tasks', '/map': '/app/plan', '/log': '/app/review' } as Record<string, string>)[pathname];
}

/** Routes that may enter the authenticated runtime after public routes are handled. */
export function isKnownAuthenticatedEntryPath(pathname: string): boolean {
  return isAuthenticatedPath(pathname) || authEntryPaths.has(pathname) || Boolean(legacyRouteRedirect(pathname));
}
