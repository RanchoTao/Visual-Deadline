export function publicCaptureTarget(isAuthenticated: boolean): string {
  return isAuthenticated ? '/app' : '/login?next=%2Fapp';
}

export function publicAccountTarget(isAuthenticated: boolean): string {
  return isAuthenticated ? '/app' : '/login';
}
