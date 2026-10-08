import { createHash, timingSafeEqual } from "node:crypto";

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}
export function bearer(request) {
  const value = request.headers?.authorization;
  return typeof value === "string" && value.length <= 8500
    ? (/^Bearer ([^\s]+)$/i.exec(value)?.[1] ?? "")
    : "";
}
export function constantEqual(a, b) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function authenticateOperator(request, env = process.env) {
  const token = env.VD_ADMIN_API_TOKEN;
  if (!token || token.length < 32)
    throw new ApiError(503, "ADMIN_NOT_CONFIGURED");
  if (!bearer(request) || !constantEqual(bearer(request), token))
    throw new ApiError(401, "ADMIN_UNAUTHENTICATED");
  if (request.headers["x-admin-contract"] !== "vd-admin-v1")
    throw new ApiError(400, "ADMIN_CONTRACT_REQUIRED");
  const actor = request.headers["x-admin-actor"],
    role = request.headers["x-admin-role"];
  if (
    typeof actor !== "string" ||
    !UUID.test(actor) ||
    !["owner", "admin", "support", "analyst", "reviewer"].includes(role)
  )
    throw new ApiError(403, "ADMIN_FORBIDDEN");
  return { actor, role };
}
export async function readBody(request, maxBytes = 16000) {
  if (request.body !== undefined) {
    const raw =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);
    if (Buffer.byteLength(raw) > maxBytes)
      throw new ApiError(413, "BODY_TOO_LARGE");
    try {
      return JSON.parse(raw);
    } catch {
      throw new ApiError(400, "INVALID_JSON");
    }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.from(chunk);
    size += data.length;
    if (size > maxBytes) throw new ApiError(413, "BODY_TOO_LARGE");
    chunks.push(data);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new ApiError(400, "INVALID_JSON");
  }
}
export function failure(error, response) {
  const code = error instanceof ApiError ? error.code : "SERVICE_UNAVAILABLE";
  sendJson(response, error instanceof ApiError ? error.status : 503, {
    ok: false,
    error: { code, message: "请求未完成，请核对权限、参数或服务状态。" },
  });
}
function serviceConfig(env) {
  const root = env.SUPABASE_URL,
    key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!root || !key) throw new ApiError(503, "AUTHORITY_NOT_CONFIGURED");
  let url;
  try {
    url = new URL(root);
  } catch {
    throw new ApiError(503, "AUTHORITY_NOT_CONFIGURED");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        env.NODE_ENV !== "production" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw new ApiError(503, "AUTHORITY_NOT_CONFIGURED");
  return { root: url.origin, key };
}
const errorStatuses = {
  ADMIN_FORBIDDEN: 403,
  ACCOUNT_BLOCKED: 403,
  BETA_ADMISSION_REQUIRED: 403,
  INVITE_OWNER_MISMATCH: 403,
  ADMIN_NOT_FOUND: 404,
  ADMIN_IDEMPOTENCY_CONFLICT: 409,
  ADMIN_STATE_CONFLICT: 409,
  INVITE_UNAVAILABLE: 409,
  INVITE_INVALID: 400,
  AI_REQUEST_REPLAY: 409,
  AI_QUOTA_EXHAUSTED: 429,
  BETA_RATE_LIMITED: 429,
};
export function databaseError(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  const code = Object.keys(errorStatuses).find((code) => message === code);
  if (code) return new ApiError(errorStatuses[code], code);
  if (
    message.startsWith("ADMIN_INVALID") ||
    ["22P02", "22007", "22008", "22003", "23514", "23502"].includes(error?.code)
  )
    return new ApiError(400, "ADMIN_INVALID_INPUT");
  return new ApiError(503, "AUTHORITY_UNAVAILABLE");
}
export async function rpc(name, args, env = process.env, fetcher = fetch) {
  const { root, key } = serviceConfig(env);
  const response = await fetcher(`${root}/rest/v1/rpc/${name}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    let body;
    try {
      body = await response.json();
    } catch {}
    throw databaseError(body);
  }
  const text = await response.text();
  if (!text && ["admin_assert_operator", "ai_settle"].includes(name))
    return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(503, "AUTHORITY_INVALID_RESPONSE");
  }
}
export async function authenticateUser(
  request,
  env = process.env,
  fetcher = fetch,
) {
  const token = bearer(request);
  if (!token) throw new ApiError(401, "UNAUTHENTICATED");
  const root = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!root || !key) throw new ApiError(503, "AUTH_NOT_CONFIGURED");
  const response = await fetcher(`${root.replace(/\/+$/, "")}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new ApiError(401, "UNAUTHENTICATED");
  const user = await response.json();
  if (!UUID.test(user?.id) || (!user.email_confirmed_at && !user.phone_confirmed_at))
    throw new ApiError(401, "UNCONFIRMED_ACCOUNT");
  return user;
}
export async function assertAccountNormal(userId) {
  if ((await rpc("admin_account_status", { p_user: userId })) !== "normal")
    throw new ApiError(403, "ACCOUNT_BLOCKED");
  if ((await rpc("beta_workspace_admitted", { p_user: userId })) !== true)
    throw new ApiError(403, "BETA_ADMISSION_REQUIRED");
}
