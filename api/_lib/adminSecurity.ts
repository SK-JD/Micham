import { SignJWT, jwtVerify } from "jose";
import { ApiError, authToken, type ApiRequest } from "./http.js";
import { requiredEnv } from "./env.js";
import { adminDb } from "./supabaseAdmin.js";
import { hashPassword, sha256, verifyPassword } from "./security.js";

const ADMIN_SESSION_HOURS = 12;

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "VIEWER";

export type AdminPermission =
  | "dashboard.view"
  | "admin.manage"
  | "users.view"
  | "users.manage"
  | "plans.manage"
  | "features.manage"
  | "settings.manage"
  | "ads.manage"
  | "announcements.manage"
  | "audit.view";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  SUPER_ADMIN: [
    "dashboard.view",
    "admin.manage",
    "users.view",
    "users.manage",
    "plans.manage",
    "features.manage",
    "settings.manage",
    "ads.manage",
    "announcements.manage",
    "audit.view",
  ],
  ADMIN: ["dashboard.view", "users.view", "users.manage", "plans.manage", "features.manage", "settings.manage", "ads.manage", "announcements.manage", "audit.view"],
  SUPPORT: ["dashboard.view", "users.view", "audit.view"],
  VIEWER: ["dashboard.view", "users.view", "audit.view"],
};

export type AdminUser = {
  id: string;
  email: string;
  login_id?: string | null;
  display_name: string;
  role: AdminRole;
  status: "ACTIVE" | "SUSPENDED";
};

function jwtSecret() {
  return new TextEncoder().encode(requiredEnv("SERVER_JWT_SECRET"));
}

function headerValue(req: ApiRequest, name: string) {
  const value = req.headers[name] || req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function requestIp(req: ApiRequest) {
  return (headerValue(req, "x-forwarded-for") || headerValue(req, "x-real-ip") || "").split(",")[0].trim();
}

export function requestAgent(req: ApiRequest) {
  return (headerValue(req, "user-agent") || "").slice(0, 300);
}

export function permissionsForRole(role: AdminRole) {
  return ROLE_PERMISSIONS[role] || [];
}

export function canAdmin(admin: AdminUser, permission: AdminPermission) {
  return permissionsForRole(admin.role).includes(permission);
}

export async function createAdminSession(admin: AdminUser, req: ApiRequest) {
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);
  const token = await new SignJWT({ email: admin.email, role: admin.role, typ: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_HOURS}h`)
    .sign(jwtSecret());

  const { error } = await adminDb().from("micham_admin_sessions").insert({
    admin_id: admin.id,
    token_hash: sha256(token),
    ip_address: requestIp(req) || null,
    user_agent: requestAgent(req) || null,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function requireAdmin(req: ApiRequest, permission: AdminPermission) {
  const token = authToken(req);
  const verified = await jwtVerify(token, jwtSecret()).catch(() => {
    throw new ApiError(401, "Invalid or expired admin session.");
  });
  if (verified.payload.typ !== "admin") throw new ApiError(401, "Invalid admin session.");
  const adminId = verified.payload.sub;
  if (!adminId) throw new ApiError(401, "Invalid admin session.");

  const db = adminDb();
  const { data: session, error: sessionError } = await db
    .from("micham_admin_sessions")
    .select("id, expires_at, revoked_at")
    .eq("admin_id", adminId)
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    throw new ApiError(401, "Admin session expired. Login again.");
  }

  const { data: admin, error: adminError } = await db
    .from("micham_admin_users")
    .select("id, email, login_id, display_name, role, status")
    .eq("id", adminId)
    .maybeSingle();
  if (adminError) throw adminError;
  if (!admin || admin.status !== "ACTIVE") throw new ApiError(401, "Admin account is not active.");
  if (!canAdmin(admin as AdminUser, permission)) throw new ApiError(403, "Admin permission denied.");
  return admin as AdminUser;
}

export async function auditAdmin(
  req: ApiRequest,
  admin: AdminUser | null,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await adminDb().from("micham_admin_audit_logs").insert({
    admin_id: admin?.id || null,
    action,
    target_type: targetType || null,
    target_id: targetId || null,
    metadata,
    ip_address: requestIp(req) || null,
    user_agent: requestAgent(req) || null,
  });
  if (error) console.error("[admin-audit]", error.message);
}

export async function verifyAdminPassword(password: string, passwordHash: string) {
  return verifyPassword(password, passwordHash);
}

export async function createAdminPasswordHash(password: string) {
  return hashPassword(password);
}
