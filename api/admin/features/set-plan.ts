import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/features/set-plan");
    method(req, "POST");
    const admin = await requireAdmin(req, "features.manage");
    const body = bodyObject(req);
    const planCode = stringField(body, "planCode").toUpperCase();
    const featureKey = stringField(body, "featureKey").toUpperCase();
    if (!planCode || !featureKey) throw new ApiError(400, "Plan code and feature key are required.");

    const db = adminDb();
    const { data: plan, error: planError } = await db.from("micham_plans").select("id").eq("code", planCode).maybeSingle();
    if (planError) throw planError;
    if (!plan) throw new ApiError(404, "Plan not found.");
    const { data: planFeature, error } = await db
      .from("micham_plan_features")
      .upsert({ plan_id: plan.id, feature_key: featureKey, enabled: body.enabled !== false, config: body.config || {} }, { onConflict: "plan_id,feature_key" })
      .select("*")
      .single();
    if (error) throw error;
    await auditAdmin(req, admin, "plan_feature.set", "plan", planCode, { featureKey, enabled: body.enabled !== false });
    jsonOk(res, { planFeature });
  } catch (error) {
    handleError(res, error);
  }
}
