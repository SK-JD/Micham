import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/announcements/save");
    method(req, "POST");
    const admin = await requireAdmin(req, "announcements.manage");
    const body = bodyObject(req);
    const id = stringField(body, "id") || undefined;
    const title = stringField(body, "title");
    const text = stringField(body, "body");
    const status = stringField(body, "status").toUpperCase() || "DRAFT";
    const target = stringField(body, "target").toUpperCase() || "ALL";
    if (!title || !text) throw new ApiError(400, "Announcement title and body are required.");
    if (!["DRAFT", "SCHEDULED", "ACTIVE", "ARCHIVED"].includes(status)) throw new ApiError(400, "Invalid announcement status.");
    if (!["ALL", "PLAN", "USER"].includes(target)) throw new ApiError(400, "Invalid announcement target.");

    const { data: announcement, error } = await adminDb()
      .from("micham_announcements")
      .upsert({
        id,
        title,
        body: text,
        status,
        target,
        target_value: stringField(body, "targetValue") || null,
        starts_at: stringField(body, "startsAt") || null,
        ends_at: stringField(body, "endsAt") || null,
        created_by: admin.id,
      })
      .select("*")
      .single();
    if (error) throw error;
    await auditAdmin(req, admin, "announcement.save", "announcement", announcement.id, { status, target });
    jsonOk(res, { announcement });
  } catch (error) {
    handleError(res, error);
  }
}
