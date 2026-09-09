import { appBaseUrl } from "../../_lib/env.js";
import { ApiError, beginRequest, bodyObject, handleError, jsonCreated, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { sendMail } from "../../_lib/mailer.js";
import { ensureRuntimeEnabled } from "../../_lib/runtimePolicy.js";
import { createConnectionCode, hashPassword, isEmail, randomToken, rateLimit, sha256 } from "../../_lib/security.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";
import { verifyEmailTemplate } from "../../email-templates/verifyEmail.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "auth/register");
    method(req, "POST");
    const body = bodyObject(req);
    const email = stringField(body, "email").toLowerCase();
    const pin = stringField(body, "pin") || stringField(body, "password");
    const displayName = stringField(body, "displayName") || email.split("@")[0];
    const currency = stringField(body, "currency") || "INR";

    if (!isEmail(email)) throw new ApiError(400, "Enter a valid email address.");
    if (!/^\d{4}$/.test(pin)) throw new ApiError(400, "PIN must be exactly 4 digits.");
    await rateLimit(`auth:register:${email}`, 5, 60 * 60);
    await ensureRuntimeEnabled("registration_enabled", "registration", "Registration is temporarily unavailable.");

    const db = adminDb();
    const { data: existing, error: existingError } = await db.from("micham_app_users").select("id").eq("email", email).maybeSingle();
    if (existingError) throw existingError;
    if (existing) throw new ApiError(409, "An account already exists for this email.");

    const { data: user, error: userError } = await db
      .from("micham_app_users")
      .insert({
        email,
        display_name: displayName,
        currency,
        password_hash: await hashPassword(pin),
        connection_code: createConnectionCode(),
      })
      .select("id, email, display_name, currency, connection_code, email_verified")
      .single();
    if (userError) throw userError;

    const token = randomToken();
    const { error: tokenError } = await db.from("micham_email_tokens").insert({
      user_id: user.id,
      token_hash: sha256(token),
      token_type: "verify_email",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    if (tokenError) throw tokenError;

    const verifyUrl = `${appBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    const template = verifyEmailTemplate(displayName, verifyUrl);
    const delivery = await sendMail({ to: email, ...template });
    if (!delivery.delivered) {
      await db.from("micham_email_tokens").delete().eq("user_id", user.id).eq("token_type", "verify_email");
      await db.from("micham_app_users").delete().eq("id", user.id);
      throw new ApiError(502, "Verification email could not be sent. Check mail settings and try again.", "EMAIL_DELIVERY_FAILED", true);
    }

    jsonCreated(res, {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        currency: user.currency,
        connectionCode: user.connection_code,
        emailVerified: user.email_verified,
      },
      emailDelivery: delivery,
      debugVerificationToken: process.env.AUTH_DEBUG_TOKENS === "true" ? token : undefined,
    });
  } catch (error) {
    handleError(res, error);
  }
}
