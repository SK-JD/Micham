import { appBaseUrl } from "../_lib/env.js";
import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { sendMail } from "../_lib/mailer.js";
import { resetPasswordTemplate } from "../email-templates/resetPassword.js";
import { isEmail, randomToken, rateLimit, sha256 } from "../_lib/security.js";
import { adminDb } from "../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "auth/request-reset");
    method(req, "POST");
    const email = stringField(bodyObject(req), "email").toLowerCase();
    if (!isEmail(email)) throw new ApiError(400, "Enter a valid email address.");
    await rateLimit(`auth:reset:${email}`, 5, 60 * 60);

    const db = adminDb();
    const { data: user, error } = await db.from("micham_app_users").select("id, email, display_name").eq("email", email).maybeSingle();
    if (error) throw error;

    if (user) {
      const token = randomToken();
      const { error: tokenError } = await db.from("micham_email_tokens").insert({
        user_id: user.id,
        token_hash: sha256(token),
        token_type: "reset_password",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      if (tokenError) throw tokenError;
      const resetUrl = `${appBaseUrl()}/api/auth/confirm-reset?token=${encodeURIComponent(token)}`;
      const template = resetPasswordTemplate(user.display_name, resetUrl);
      await sendMail({ to: user.email, ...template });
    }

    jsonOk(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
