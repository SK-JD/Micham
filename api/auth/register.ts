import { appBaseUrl } from "../_lib/env";
import { ApiError, bodyObject, handleError, jsonCreated, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http";
import { sendMail } from "../_lib/mailer";
import { createConnectionCode, hashPassword, isEmail, randomToken, rateLimit, sha256 } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";
import { verifyEmailTemplate } from "../email-templates/verifyEmail";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "POST");
    const body = bodyObject(req);
    const email = stringField(body, "email").toLowerCase();
    const password = stringField(body, "password");
    const displayName = stringField(body, "displayName") || email.split("@")[0];
    const currency = stringField(body, "currency") || "INR";

    if (!isEmail(email)) throw new ApiError(400, "Enter a valid email address.");
    if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters.");
    await rateLimit(`auth:register:${email}`, 5, 60 * 60);

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
        password_hash: await hashPassword(password),
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

    const verifyUrl = `${appBaseUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
    const template = verifyEmailTemplate(displayName, verifyUrl);
    const delivery = await sendMail({ to: email, ...template });

    jsonCreated(res, {
      user,
      emailDelivery: delivery,
      debugVerificationToken: process.env.AUTH_DEBUG_TOKENS === "true" ? token : undefined,
    });
  } catch (error) {
    handleError(res, error);
  }
}
