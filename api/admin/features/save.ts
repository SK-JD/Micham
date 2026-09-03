import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/features/save");
    method(req, "POST");
    const admin = await requireAdmin(req, "features.manage");
    const body = bodyObject(req);
    const featureKey = stringField(body, "featureKey").toUpperCase();
    const name = stringField(body, "name");
    const description = stringField(body, "description");
    const status = stringField(body, "status").toUpperCase() || "ACTIVE";
    if (!featureKey || !name) throw new ApiError(400, "Feature key and name are required.");
    if (!["ACTIVE", "INACTIVE"].includes(status)) throw new ApiError(400, "Invalid feature status.");

    const { data: feature, error } = await adminDb()
      .from("micham_features")
      .upsert({ feature_key: featureKey, name, description, status }, { onConflict: "feature_key" })
      .select("*")
      .single();
    if (error) throw error;
    await auditAdmin(req, admin, "feature.save", "feature", featureKey, { status });
    jsonOk(res, { feature });
  } catch (error) {
    handleError(res, error);
  }
}
