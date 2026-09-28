// Operator-supplied, versioned estimates only. No guessed provider tariff defaults.
// Rates are currency minor units per million tokens (up to six decimal places).
export function estimateAIUsageCost({ provider, model, usage }, configuration = '') {
  const unknown = { estimatedCostMinor: null, currency: 'CNY', costStatus: 'unknown', pricingVersion: null };
  if (!configuration) return unknown;
  let pricing;
  try { pricing = typeof configuration === 'string' ? JSON.parse(configuration) : configuration; } catch { return unknown; }
  if (!pricing || typeof pricing.version !== 'string' || !pricing.version.trim() || pricing.version.length > 120
    || typeof pricing.currency !== 'string' || !/^[A-Z]{3}$/.test(pricing.currency)) return unknown;
  const rates = pricing.models?.[provider]?.[model];
  if (!rates) return { ...unknown, currency: pricing.currency };
  const fields = ['inputMinorPerMillion', 'cachedInputMinorPerMillion', 'outputMinorPerMillion'];
  if (fields.some((field) => typeof rates[field] !== 'number' || !Number.isFinite(rates[field]) || rates[field] < 0 || rates[field] > 1e9
    || Math.abs(rates[field] * 1e6 - Math.round(rates[field] * 1e6)) > 0.01)) return unknown;
  const prompt = usage?.prompt_tokens; const output = usage?.completion_tokens;
  let cached = usage?.prompt_cache_hit_tokens;
  if (cached === undefined && (prompt === 0 || rates.inputMinorPerMillion === rates.cachedInputMinorPerMillion)) cached = 0;
  if ([prompt, output, cached].some((value) => !Number.isSafeInteger(value) || value < 0) || cached > prompt) return unknown;
  const microMinor = (rate) => BigInt(Math.round(rate * 1e6));
  const numerator = BigInt(prompt - cached) * microMinor(rates.inputMinorPerMillion)
    + BigInt(cached) * microMinor(rates.cachedInputMinorPerMillion)
    + BigInt(output) * microMinor(rates.outputMinorPerMillion);
  // Round the total upward once to a currency minor unit, not each token bucket.
  const cost = (numerator + 1_000_000_000_000n - 1n) / 1_000_000_000_000n;
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) return unknown;
  return { estimatedCostMinor: Number(cost), currency: pricing.currency, costStatus: 'estimated', pricingVersion: pricing.version };
}
