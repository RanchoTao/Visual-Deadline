export interface LegacyCleanupEvidence {
  matchingReadWriteRelease: boolean;
  unexplainedDivergenceCount: number;
  legacyFallbackReads: number;
  supportRunbookReady: boolean;
  rollbackRehearsed: boolean;
}

export interface LegacyCleanupGateDecision {
  mayDisableLegacyWrites: boolean;
  mayDisableLegacyReads: boolean;
  reasons: string[];
}

export const defaultLegacyCleanupEvidence: LegacyCleanupEvidence = {
  matchingReadWriteRelease: false,
  unexplainedDivergenceCount: Number.POSITIVE_INFINITY,
  legacyFallbackReads: Number.POSITIVE_INFINITY,
  supportRunbookReady: false,
  rollbackRehearsed: false,
};

/** Cleanup is evidence-gated. No browser flag can substitute for the observation window. */
export function evaluateLegacyCleanupGate(evidence: LegacyCleanupEvidence = defaultLegacyCleanupEvidence): LegacyCleanupGateDecision {
  const reasons: string[] = [];
  if (!evidence.matchingReadWriteRelease) reasons.push('A matching read/write telemetry release has not completed.');
  if (evidence.unexplainedDivergenceCount !== 0) reasons.push('Legacy and target records still have unexplained divergence.');
  if (evidence.legacyFallbackReads !== 0) reasons.push('Legacy fallback reads are still observed.');
  if (!evidence.supportRunbookReady) reasons.push('The support runbook is not ready.');
  if (!evidence.rollbackRehearsed) reasons.push('The rollback rehearsal is not complete.');
  const mayDisableLegacyWrites = evidence.matchingReadWriteRelease && evidence.unexplainedDivergenceCount === 0 && evidence.rollbackRehearsed;
  const mayDisableLegacyReads = mayDisableLegacyWrites && evidence.legacyFallbackReads === 0 && evidence.supportRunbookReady;
  return { mayDisableLegacyWrites, mayDisableLegacyReads, reasons };
}
