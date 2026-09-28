import { createHmac } from "node:crypto";
import {
  ApiError,
  readBody,
  rpc,
  sendJson,
  failure,
} from "../../server/admin/runtime.js";
export default async function handler(request, response) {
  try {
    if (request.method !== "POST")
      throw new ApiError(405, "METHOD_NOT_ALLOWED");
    if (process.env.VD_PUBLIC_BETA_APPLICATIONS_ENABLED !== "true")
      throw new ApiError(404, "BETA_NOT_OPEN");
    const secret = process.env.TURNSTILE_SECRET_KEY,
      rateKey = process.env.VD_BETA_RATE_KEY;
    if (!secret || !rateKey || rateKey.length < 32)
      throw new ApiError(503, "BETA_NOT_CONFIGURED");
    const body = await readBody(request, 8000);
    const allowed = [
      "email",
      "name",
      "organization",
      "role",
      "useCase",
      "whyInterested",
      "source",
      "turnstileToken",
    ];
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((k) => !allowed.includes(k)) ||
      Object.values(body).some(
        (v) => typeof v !== "string" || v.length > 2000,
      ) ||
      !body.turnstileToken ||
      body.turnstileToken.length > 2048
    )
      throw new ApiError(400, "INVALID_INPUT");
    // Only Vercel's platform-overwritten forwarded address is used in deployed requests.
    const address = process.env.VERCEL
      ? request.headers["x-vercel-forwarded-for"]
      : request.socket?.remoteAddress;
    if (typeof address !== "string" || address.length > 100)
      throw new ApiError(503, "BETA_CLIENT_ADDRESS_UNAVAILABLE");
    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        body: new URLSearchParams({
          secret,
          response: body.turnstileToken,
          remoteip: address.split(",")[0].trim(),
        }),
      },
    );
    const challenge = verification.ok ? await verification.json() : null;
    const hostname = process.env.VD_BETA_HOSTNAME;
    if (
      !hostname ||
      challenge?.success !== true ||
      challenge.hostname !== hostname ||
      challenge.action !== "beta_apply"
    )
      throw new ApiError(403, "TURNSTILE_REJECTED");
    delete body.turnstileToken;
    await rpc("beta_submit", {
      p_input: body,
      p_ip_hash: createHmac("sha256", rateKey).update(address).digest("hex"),
    });
    // Identical response for new/existing applications avoids email enumeration.
    return sendJson(response, 202, { ok: true, status: "received" });
  } catch (error) {
    failure(error, response);
  }
}
