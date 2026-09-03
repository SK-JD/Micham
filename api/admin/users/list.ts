import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";

function queryValue(req: ApiRequest, key: string) {
  const value = req.query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/users/list");
    method(req, "GET");
    await requireAdmin(req, "users.view");
    const q = (queryValue(req, "q") || "").trim().toLowerCase();
    const status = (queryValue(req, "status") || "").trim();
    const page = Math.max(Number(queryValue(req, "page") || 1), 1);
    const pageSize = Math.min(Math.max(Number(queryValue(req, "pageSize") || 25), 1), 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = adminDb()
      .from("micham_app_users")
      .select("id, email, display_name, currency, connection_code, email_verified, status, created_at, updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (q) query = query.or(`email.ilike.%${q}%,display_name.ilike.%${q}%,connection_code.ilike.%${q}%`);
    if (status) query = query.eq("status", status);
    const { data, error, count } = await query;
    if (error) throw error;
    jsonOk(res, { users: data || [], page, pageSize, total: count || 0 });
  } catch (error) {
    handleError(res, error);
  }
}
