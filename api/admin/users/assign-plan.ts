import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/users/assign-plan");
    method(req, "POST");
    const admin = await requireAdmin(req, "users.manage");
    const body = bodyObject(req);
    const userId = stringField(body, "userId");
    const planCode = stringField(body, "planCode").toUpperCase();
    if (!userId || !planCode) throw new ApiError(400, "User ID and plan code are required.");

    const db = adminDb();
    const { data: plan, error: planError } = await db.from("micham_plans").select("id, code, name").eq("code", planCode).eq("status", "ACTIVE").maybeSingle();
    if (planError) throw planError;
    if (!plan) throw new ApiError(404, "Plan not found.");

    await db.from("micham_user_subscriptions").update({ status: "CANCELLED", current_period_end: new Date().toISOString() }).eq("user_id", userId).in("status", ["ACTIVE", "TRIAL"]);
    const { data: subscription, error } = await db
      .from("micham_user_subscriptions")
      .insert({ user_id: userId, plan_id: plan.id, status: "ACTIVE", source: "ADMIN", metadata: { assignedBy: admin.id } })
      .select("id, user_id, plan_id, status, source, created_at")
      .single();
    if (error) throw error;
    await auditAdmin(req, admin, "user.assign_plan", "user", userId, { planCode });
    jsonOk(res, { subscription, plan });
  } catch (error) {
    handleError(res, error);
  }
}
