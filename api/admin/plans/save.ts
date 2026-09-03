import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/plans/save");
    method(req, "POST");
    const admin = await requireAdmin(req, "plans.manage");
    const body = bodyObject(req);
    const code = stringField(body, "code").toUpperCase();
    const name = stringField(body, "name");
    const description = stringField(body, "description");
    const status = stringField(body, "status").toUpperCase() || "ACTIVE";
    const isDefault = body.isDefault === true;
    const sortOrder = Number(body.sortOrder ?? 100);
    if (!code || !name) throw new ApiError(400, "Plan code and name are required.");
    if (!["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) throw new ApiError(400, "Invalid plan status.");

    const db = adminDb();
    if (isDefault) await db.from("micham_plans").update({ is_default: false }).neq("code", code);
    const { data: plan, error } = await db
      .from("micham_plans")
      .upsert({ code, name, description, status, is_default: isDefault, sort_order: sortOrder, metadata: body.metadata || {} }, { onConflict: "code" })
      .select("*")
      .single();
    if (error) throw error;
    await auditAdmin(req, admin, "plan.save", "plan", code, { isDefault, status });
    jsonOk(res, { plan });
  } catch (error) {
    handleError(res, error);
  }
}
