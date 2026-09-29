import {
  ApiError,
  readBody,
  rpc,
  sendJson,
  failure,
} from "../../server/admin/runtime.js";
import { registerInvitedUser } from "../../server/admin/registration.js";
export default async function handler(request, response) {
  try {
    if (request.method === "GET")
      return sendJson(response, 200, {
        admissionEnforced: await rpc("beta_admission_state", {}),
      });
    if (request.method !== "POST")
      throw new ApiError(405, "METHOD_NOT_ALLOWED");
    const address = process.env.VERCEL
      ? request.headers["x-vercel-forwarded-for"]
      : request.socket?.remoteAddress;
    const result = await registerInvitedUser(
      await readBody(request, 4000),
      address,
    );
    return sendJson(response, 201, { ok: true, ...result });
  } catch (error) {
    failure(error, response);
  }
}
