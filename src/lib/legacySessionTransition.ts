export interface LegacySessionEvidence {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly userId: string;
}

export interface LegacySessionTransitionPort<Session extends { user: { id: string } }, User extends { id: string }> {
  readLegacy(): LegacySessionEvidence | null;
  removeLegacy(): void;
  setSession(input: { access_token: string; refresh_token: string }): Promise<Session>;
  getUser(): Promise<User | null>;
  clearSupportedSession(): Promise<void>;
}

/** One-page-lifecycle bridge for the retired hand-written session format. */
export class LegacySessionTransition<Session extends { user: { id: string } }, User extends { id: string }> {
  private attempted = false;
  constructor(private readonly port: LegacySessionTransitionPort<Session, User>) {}

  async run(): Promise<Session | null> {
    if (this.attempted) return null;
    this.attempted = true;
    const legacy = this.port.readLegacy();
    if (!legacy) return null;
    try {
      const session = await this.port.setSession(legacy);
      const user = await this.port.getUser();
      if (!user || user.id !== legacy.userId || session.user.id !== legacy.userId) throw new Error('LEGACY_SESSION_USER_MISMATCH');
      this.port.removeLegacy();
      return session;
    } catch {
      // setSession may already have persisted a supported session. Never erase the
      // legacy evidence here: it is needed for recoverable, user-driven login.
      await this.port.clearSupportedSession();
      return null;
    }
  }
}
