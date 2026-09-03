import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity";
import { adminDb } from "../../_lib/supabaseAdmin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/ads/save");
    method(req, "POST");
    const admin = await requireAdmin(req, "ads.manage");
    const body = bodyObject(req);
    const placementKey = stringField(body, "placementKey").toUpperCase();
    if (!placementKey) throw new ApiError(400, "Placement key is required.");
    const db = adminDb();
    const { data: placement, error: placementError } = await db
      .from("micham_ad_placements")
      .upsert({
        placement_key: placementKey,
        name: stringField(body, "name") || placementKey,
        description: stringField(body, "description"),
        enabled: body.enabled === true,
      }, { onConflict: "placement_key" })
      .select("*")
      .single();
    if (placementError) throw placementError;

    let config = null;
    if (body.config && typeof body.config === "object" && !Array.isArray(body.config)) {
      const { data, error } = await db
        .from("micham_ad_configs")
        .insert({
          placement_key: placementKey,
          provider: stringField(body, "provider") || "INTERNAL",
          status: stringField(body, "configStatus").toUpperCase() || "INACTIVE",
          config: body.config,
        })
        .select("*")
        .single();
      if (error) throw error;
      config = data;
    }
    await auditAdmin(req, admin, "ad.save", "ad_placement", placementKey, { hasConfig: Boolean(config) });
    jsonOk(res, { placement, config });
  } catch (error) {
    handleError(res, error);
  }
}
