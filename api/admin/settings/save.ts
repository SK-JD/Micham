import { ApiError, beginRequest, bodyObject, handleError, jsonOk, method, stringField, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { auditAdmin, requireAdmin } from "../../_lib/adminSecurity.js";
import { adminDb } from "../../_lib/supabaseAdmin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "admin/settings/save");
    method(req, "POST");
    const admin = await requireAdmin(req, "settings.manage");
    const body = bodyObject(req);
    const settingKey = stringField(body, "settingKey");
    if (!settingKey) throw new ApiError(400, "Setting key is required.");
    const { data: setting, error } = await adminDb()
      .from("micham_system_settings")
      .upsert({ setting_key: settingKey, value: body.value === undefined ? {} : body.value, description: stringField(body, "description"), is_public: body.isPublic === true }, { onConflict: "setting_key" })
      .select("*")
      .single();
    if (error) throw error;
    await auditAdmin(req, admin, "system_setting.save", "setting", settingKey);
    jsonOk(res, { setting });
  } catch (error) {
    handleError(res, error);
  }
}
