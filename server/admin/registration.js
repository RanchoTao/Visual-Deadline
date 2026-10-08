import { createHash, createHmac } from "node:crypto";
import { ApiError, rpc } from "./runtime.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");
export async function authAdmin(path, body, method = "POST") {
  const root = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!root || !key) throw new ApiError(503, "AUTH_NOT_CONFIGURED");
  const url = new URL(root);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw new ApiError(503, "AUTH_NOT_CONFIGURED");
  const response = await fetch(`${url.origin}/auth/v1/${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new ApiError(409, "REGISTRATION_UNAVAILABLE");
  return response.status === 204 ? null : response.json();
}

// Auth creation and email dispatch are external to the SQL redemption transaction.
// Never compensate an uncertain SQL commit by deleting an account.
export async function registerInvitedUser(
  input,
  address,
  repository = { rpc, authAdmin },
) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (key) => !["email", "password", "inviteCode"].includes(key),
    )
  )
    throw new ApiError(400, "REGISTRATION_INVALID");
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 254 ||
    typeof input.password !== "string" ||
    input.password.length < 8 ||
    input.password.length > 128 ||
    typeof input.inviteCode !== "string" ||
    !/^VD-[A-Za-z0-9_-]{32}$/.test(input.inviteCode.trim())
  )
    throw new ApiError(400, "REGISTRATION_INVALID");
  const rateKey = process.env.VD_BETA_RATE_KEY;
  if (
    !rateKey ||
    rateKey.length < 32 ||
    typeof address !== "string" ||
    address.length > 100
  )
    throw new ApiError(503, "BETA_NOT_CONFIGURED");
  const hash = digest(input.inviteCode.trim());
  const permitted = await repository.rpc("beta_registration_check", {
    p_hash: hash,
    p_email: email,
    p_ip_hash: createHmac("sha256", rateKey).update(address).digest("hex"),
  });
  if (!permitted) throw new ApiError(409, "INVITE_UNAVAILABLE");
  const created = await repository.authAdmin("admin/users", {
    email,
    password: input.password,
    email_confirm: false,
  });
  const id = created?.id || created?.user?.id;
  if (!id) throw new ApiError(503, "REGISTRATION_UNAVAILABLE");
  try {
    await repository.rpc("beta_redeem", { p_user: id, p_hash: hash });
  } catch (error) {
    // Delete only after a definite rejected transaction and a successful authority check.
    // Timeouts, disconnects and unknown outcomes retain the unconfirmed account for recovery.
    if (
      error instanceof ApiError &&
      [
        "INVITE_INVALID",
        "INVITE_UNAVAILABLE",
        "INVITE_OWNER_MISMATCH",
        "ACCOUNT_BLOCKED",
      ].includes(error.code)
    ) {
      const admitted = await repository.rpc("has_beta_access", { p_user: id });
      if (!admitted)
        await repository.authAdmin(`admin/users/${id}`, null, "DELETE");
      if (!admitted) throw error;
    } else throw new ApiError(503, "REGISTRATION_RECONCILIATION_REQUIRED");
  }
  try {
    await repository.authAdmin("resend", { type: "signup", email });
    return { requiresEmailVerification: true, verificationSent: true };
  } catch {
    return { requiresEmailVerification: true, verificationSent: false };
  }
}
