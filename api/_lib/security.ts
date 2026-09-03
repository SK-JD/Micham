import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { ApiError, type ApiRequest, authToken } from "./http";
import { adminDb } from "./supabaseAdmin";
import { requiredEnv } from "./env";

const SESSION_DAYS = 30;

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function createConnectionCode() {
  const part = () => randomBytes(3).toString("hex").toUpperCase();
  return `MCH-${part()}-${part()}`;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function jwtSecret() {
  return new TextEncoder().encode(requiredEnv("SERVER_JWT_SECRET"));
}

export async function createSession(userId: string, email: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(jwtSecret());

  const db = adminDb();
  const { error } = await db.from("micham_user_sessions").insert({
    user_id: userId,
    token_hash: sha256(token),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function requireUser(req: ApiRequest) {
  const token = authToken(req);
  const verified = await jwtVerify(token, jwtSecret()).catch(() => {
    throw new ApiError(401, "Invalid or expired session.");
  });
  const userId = verified.payload.sub;
  if (!userId) throw new ApiError(401, "Invalid session.");

  const db = adminDb();
  const { data: session, error: sessionError } = await db
    .from("micham_user_sessions")
    .select("id, user_id, expires_at, revoked_at")
    .eq("token_hash", sha256(token))
    .eq("user_id", userId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    throw new ApiError(401, "Session expired. Login again.");
  }

  const { data: user, error: userError } = await db
    .from("micham_app_users")
    .select("id, email, display_name, currency, connection_code, email_verified, status")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user || user.status !== "active") throw new ApiError(401, "Account is not active.");
  return user;
}

export async function rateLimit(bucket: string, max: number, windowSeconds: number) {
  const db = adminDb();
  if (Math.random() < 0.02) {
    await db
      .from("micham_rate_limits")
      .delete()
      .lt("reset_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  }
  const resetAt = new Date(Date.now() + windowSeconds * 1000).toISOString();
  const { data, error } = await db.rpc("micham_take_rate_limit", {
    bucket_key: bucket,
    max_requests: max,
    window_seconds: windowSeconds,
    next_reset_at: resetAt,
  });
  if (error) throw error;
  if (!data?.allowed) {
    throw new ApiError(429, `Too many requests. Try again in ${Math.ceil((data.retry_after_seconds || windowSeconds) / 60)} minute(s).`);
  }
}
