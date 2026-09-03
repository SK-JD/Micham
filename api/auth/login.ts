import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { createSession, isEmail, rateLimit, verifyPassword } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "auth/login");
    method(req, "POST");
    const body = bodyObject(req);
    const email = stringField(body, "email").toLowerCase();
    const password = stringField(body, "password");
    if (!isEmail(email)) throw new ApiError(400, "Enter a valid email address.");
    await rateLimit(`auth:login:${email}`, 12, 15 * 60);

    const db = adminDb();
    const { data: user, error } = await db
      .from("micham_app_users")
      .select("id, email, display_name, currency, connection_code, password_hash, email_verified, status")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    if (!user || user.status !== "active" || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiError(401, "Invalid email or password.");
    }
    if (!user.email_verified) {
      throw new ApiError(403, "Verify your email before login.");
    }

    const session = await createSession(user.id, user.email);
    jsonOk(res, {
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        currency: user.currency,
        connectionCode: user.connection_code,
        emailVerified: user.email_verified,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}
