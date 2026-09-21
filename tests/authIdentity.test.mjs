import assert from 'node:assert/strict';
import test from 'node:test';

const { createAuthFeatureFlags, assertEmailSignupEnabled, assertOAuthProviderEnabled, assertPhoneEnabled, normalizePhoneE164, PhoneOtpCooldown, PHONE_OTP_RESEND_COOLDOWN_MS } = await import('./.compiled/src/lib/authFeatures.js');
const { callbackCodeMarker, cleanAuthCallbackUrl, handleExplicitAuthCallback } = await import('./.compiled/src/lib/authCallback.js');
const { LegacySessionTransition } = await import('./.compiled/src/lib/legacySessionTransition.js');
const { identityClientAuthOptions } = await import('./.compiled/src/lib/identityClientConfig.js');

test('IdentityClient supported configuration uses PKCE with explicit callback ownership', () => {
  assert.equal(identityClientAuthOptions.flowType, 'pkce');
  assert.equal(identityClientAuthOptions.detectSessionInUrl, false);
  assert.equal(identityClientAuthOptions.storageKey, 'vd.supabase.auth');
});

test('providers default off, X uses the x identifier, and action gates reject before transport', () => {
  const disabled = createAuthFeatureFlags();
  assert.equal(disabled.x, false);
  assert.equal(disabled.emailSignup, false);
  assert.throws(() => assertOAuthProviderEnabled(disabled, 'google'), /AUTH_OAUTH_DISABLED:google/);
  assert.throws(() => assertOAuthProviderEnabled(disabled, 'x'), /AUTH_OAUTH_DISABLED:x/);
  assert.throws(() => assertPhoneEnabled(disabled), /AUTH_PHONE_DISABLED/);
  assert.throws(() => assertEmailSignupEnabled(disabled), /AUTH_EMAIL_SIGNUP_DISABLED/);
  const enabled = createAuthFeatureFlags({ VITE_AUTH_X_ENABLED: 'true', VITE_AUTH_PHONE_ENABLED: 'true', VITE_AUTH_EMAIL_SIGNUP_ENABLED: 'true' });
  assert.doesNotThrow(() => assertOAuthProviderEnabled(enabled, 'x'));
  assert.doesNotThrow(() => assertPhoneEnabled(enabled));
  assert.doesNotThrow(() => assertEmailSignupEnabled(enabled));
  assert.equal('twitter' in enabled, false);
});

test('E.164 validation and resend cooldown are deterministic', () => {
  assert.equal(normalizePhoneE164(' +86 (138) 1234-5678 '), '+8613812345678');
  assert.throws(() => normalizePhoneE164('13812345678'));
  const cooldown = new PhoneOtpCooldown();
  cooldown.request(1_000);
  assert.equal(cooldown.remainingMs(1_000), PHONE_OTP_RESEND_COOLDOWN_MS);
  assert.throws(() => cooldown.assertAvailable(1_001), /PHONE_OTP_COOLDOWN/);
  assert.doesNotThrow(() => cooldown.assertAvailable(1_000 + PHONE_OTP_RESEND_COOLDOWN_MS));
});

test('successful explicit PKCE callback writes only a hashed consumed marker and reload restores session', async () => {
  const rawCode = 'one-use-authorization-code';
  const values = new Map(); let exchanges = 0; let sessionReads = 0; const urls = [];
  const port = { getSession: async () => { sessionReads += 1; return { access_token: 'a.b.c', refresh_token: 'refresh', user: { id: 'user-1' } }; }, exchangeCodeForSession: async (code) => { exchanges += 1; assert.equal(code, rawCode); return { access_token: 'a.b.c', refresh_token: 'refresh', user: { id: 'user-1' } }; } };
  const environment = { href: `https://www.visualdeadline.com/auth/callback?code=${rawCode}&state=opaque`, sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, replaceUrl: (url) => urls.push(url) };
  await handleExplicitAuthCallback(port, environment);
  await handleExplicitAuthCallback(port, environment);
  assert.equal(exchanges, 1); assert.equal(sessionReads, 1); assert.equal(urls[0], '/auth/callback');
  for (const [key, value] of values) { assert.equal(key.includes(rawCode), false); assert.equal(String(value).includes(rawCode), false); }
  assert.equal((await callbackCodeMarker(rawCode)).includes(rawCode), false);
  assert.equal(cleanAuthCallbackUrl(`https://x.test/auth/callback?code=${rawCode}#access_token=token`), '/auth/callback');
});

test('failed callback exchange does not write a marker and can retry the same code', async () => {
  const rawCode = 'retryable-authorization-code'; const values = new Map(); const cleaned = []; let attempts = 0;
  const port = { getSession: async () => null, exchangeCodeForSession: async () => { attempts += 1; if (attempts === 1) throw new Error('transient'); return { access_token: 'a.b.c', refresh_token: 'refresh', user: { id: 'user-1' } }; } };
  const environment = { href: `https://www.visualdeadline.com/auth/callback?code=${rawCode}`, sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, replaceUrl: (url) => cleaned.push(url) };
  await assert.rejects(() => handleExplicitAuthCallback(port, environment), /transient/);
  assert.equal(values.size, 0); assert.deepEqual(cleaned, [], 'a retryable failed callback remains available for reload retry');
  await handleExplicitAuthCallback(port, environment);
  assert.equal(attempts, 2); assert.equal(values.size, 1); assert.deepEqual(cleaned, ['/auth/callback']);
});

test('cancelled, malformed, and expired callback forms do not exchange a code', async () => {
  let exchanges = 0; const port = { getSession: async () => null, exchangeCodeForSession: async () => { exchanges += 1; return null; } };
  const makeEnvironment = (href) => ({ href, sessionStorage: { getItem: () => null, setItem: () => {} }, replaceUrl: () => {} });
  await assert.rejects(() => handleExplicitAuthCallback(port, makeEnvironment('https://x.test/auth/callback?error=access_denied')));
  await assert.rejects(() => handleExplicitAuthCallback(port, makeEnvironment(`https://x.test/auth/callback?code=${'a'.repeat(4097)}`)));
  await assert.rejects(() => handleExplicitAuthCallback(port, makeEnvironment('https://x.test/auth/callback?error_code=otp_expired&error=expired')));
  assert.equal(exchanges, 0);
});

test('legacy transition deletes evidence only after authoritative matching user verification', async () => {
  const makePort = ({ setFails = false, user = { id: 'legacy-user' } } = {}) => {
    let legacyPresent = true; let cleared = 0;
    return { port: { readLegacy: () => legacyPresent ? { access_token: 'a.b.c', refresh_token: 'refresh', userId: 'legacy-user' } : null, removeLegacy: () => { legacyPresent = false; }, setSession: async () => { if (setFails) throw new Error('invalid'); return { user: { id: 'legacy-user' } }; }, getUser: async () => user, clearSupportedSession: async () => { cleared += 1; } }, state: () => ({ legacyPresent, cleared }) };
  };
  const valid = makePort(); const validTransition = new LegacySessionTransition(valid.port); assert.equal((await validTransition.run())?.user.id, 'legacy-user'); assert.deepEqual(valid.state(), { legacyPresent: false, cleared: 0 });
  for (const scenario of [makePort({ setFails: true }), makePort({ user: null }), makePort({ user: { id: 'other' } })]) { const transition = new LegacySessionTransition(scenario.port); assert.equal(await transition.run(), null); assert.deepEqual(scenario.state(), { legacyPresent: true, cleared: 1 }); assert.equal(await transition.run(), null); assert.equal(scenario.state().cleared, 1); }
});
