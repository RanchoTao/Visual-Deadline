import { createHash } from "node:crypto";
import {
  ApiError,
  authenticateUser,
  readBody,
  rpc,
  sendJson,
  failure,
} from "../../server/admin/runtime.js";
export default async function handler(request, response) {
  try {
    if (request.method !== "POST")
      throw new ApiError(405, "METHOD_NOT_ALLOWED");
    const user = await authenticateUser(request);
    const body = await readBody(request, 2000);
    if (
      !body ||
      Object.keys(body).some((k) => k !== "code") ||
      typeof body.code !== "string" ||
      !/^VD-[A-Za-z0-9_-]{32}$/.test(body.code)
    )
      throw new ApiError(400, "INVITE_INVALID");
    const result = await rpc("beta_redeem", {
      p_user: user.id,
      p_hash: createHash("sha256").update(body.code).digest("hex"),
    });
    return sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    failure(error, response);
  }
}
