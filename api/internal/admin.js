import { randomBytes } from "node:crypto";
import {
  ApiError,
  UUID,
  authenticateOperator,
  readBody,
  rpc,
  sendJson,
  failure,
} from "../../server/admin/runtime.js";
const resources = new Set([
  "dashboard",
  "users",
  "beta-applications",
  "invitations",
  "entitlements",
  "quotas",
  "bans",
  "audit",
  "feedback",
  "ai-usage",
  "email",
  "analytics",
  "infrastructure",
  "deployments",
  "settings",
  "restricted-content",
]);
export default async function handler(request, response) {
  try {
    const { actor, role } = authenticateOperator(request);
    const url = new URL(request.url, "http://localhost");
    const path =
      /^\/(?:api\/internal\/admin\/v1|v1\/admin)\/([^/]+)(\/actions)?$/.exec(
        url.pathname,
      );
    const resource =
      path?.[1] ?? request.query?.resource ?? url.searchParams.get("resource");
    const actions =
      Boolean(path?.[2]) ||
      (request.query?.operation ?? url.searchParams.get("operation")) ===
        "actions";
    if (!resources.has(resource))
      throw new ApiError(404, "ADMIN_INVALID_RESOURCE");
    if (!actions && request.method === "GET") {
      const allowed = ["id", "q", "cursor", "limit", "status", "cohort"];
      const query = {};
      for (const [key, value] of url.searchParams)
        if (allowed.includes(key)) query[key] = value;
      if (query.id && !UUID.test(query.id))
        throw new ApiError(400, "ADMIN_INVALID_INPUT");
      if (query.limit && !/^\d{1,3}$/.test(query.limit))
        throw new ApiError(400, "ADMIN_INVALID_INPUT");
      return sendJson(
        response,
        200,
        await rpc("admin_read", {
          p_actor: actor,
          p_role: role,
          p_resource: resource,
          p_query: query,
        }),
      );
    }
    if (!actions || request.method !== "POST")
      throw new ApiError(405, "METHOD_NOT_ALLOWED");
    const body = await readBody(request);
    if (
      !body ||
      Array.isArray(body) ||
      typeof body !== "object" ||
      Object.keys(body).some(
        (k) =>
          !["action", "target", "reason", "input", "requestId"].includes(k),
      )
    )
      throw new ApiError(400, "ADMIN_INVALID_INPUT");
    if (
      !UUID.test(body.requestId) ||
      request.headers["idempotency-key"] !== body.requestId ||
      typeof body.action !== "string"
    )
      throw new ApiError(400, "ADMIN_INVALID_INPUT");
    if (
      typeof body.target !== "string" ||
      !body.target ||
      body.target.length > 100 ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 8 ||
      body.reason.trim().length > 1000 ||
      !body.input ||
      typeof body.input !== "object" ||
      Array.isArray(body.input)
    )
      throw new ApiError(400, "ADMIN_INVALID_INPUT");
    // Reject a revoked/mismatched directory binding before issuing a command; SQL repeats the check under a row lock.
    await rpc("admin_assert_operator", {
      p_actor: actor,
      p_role: role,
      p_resource: resource,
      p_action: body.action,
    });
    const receiptKey = process.env.VD_ADMIN_RECEIPT_KEY;
    if (!receiptKey || receiptKey.length < 32)
      throw new ApiError(503, "RECEIPT_KEY_NOT_CONFIGURED");
    const receipt = await rpc("admin_command", {
      p_actor: actor,
      p_role: role,
      p_resource: resource,
      p_action: body.action,
      p_target: body.target,
      p_reason: body.reason,
      p_input: body.input,
      p_request: body.requestId,
      p_receipt_key: receiptKey,
      p_code: "VD-" + randomBytes(24).toString("base64url"),
    });
    return sendJson(response, 200, receipt);
  } catch (error) {
    failure(error, response);
  }
}
