import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { auditAdmin, requireAdmin } from "../_lib/adminSecurity";
import { adminDb } from "../_lib/supabaseAdmin";

async function countRows(table: string, filter?: (query: any) => any) {
  let query = adminDb().from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/dashboard");
    method(req, "GET");
    const admin = await requireAdmin(req, "dashboard.view");
    const [
      users,
      activeUsers,
      sessions,
      transactions,
      friends,
      pendingFriends,
      activePlans,
      announcements,
      activeAnnouncements,
      auditLogs,
    ] = await Promise.all([
      countRows("micham_app_users"),
      countRows("micham_app_users", (query) => query.eq("status", "active")),
      countRows("micham_user_sessions", (query) => query.is("revoked_at", null).gt("expires_at", new Date().toISOString())),
      countRows("micham_entities", (query) => query.eq("entity_type", "transactions").is("deleted_at", null)),
      countRows("micham_friend_links", (query) => query.eq("status", "connected")),
      countRows("micham_friend_links", (query) => query.eq("status", "pending")),
      countRows("micham_plans", (query) => query.eq("status", "ACTIVE")),
      countRows("micham_announcements"),
      countRows("micham_announcements", (query) => query.eq("status", "ACTIVE")),
      countRows("micham_admin_audit_logs"),
    ]);

    const { data: recentAudit, error } = await adminDb()
      .from("micham_admin_audit_logs")
      .select("id, action, target_type, target_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    await auditAdmin(req, admin, "admin.dashboard_view");
    jsonOk(res, {
      stats: {
        users,
        activeUsers,
        activeSessions: sessions,
        transactions,
        connectedFriendLinks: friends,
        pendingFriendRequests: pendingFriends,
        activePlans,
        announcements,
        activeAnnouncements,
        auditLogs,
      },
      recentAudit,
    });
  } catch (error) {
    handleError(res, error);
  }
}
