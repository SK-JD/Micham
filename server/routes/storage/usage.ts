import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { ensureFeatureEnabled, ensureUserFeature } from "../../_lib/runtimePolicy.js";
import { rateLimit, requireUser } from "../../_lib/security.js";
import { getReceiptUsage } from "../../_lib/receiptStorage.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "storage/usage");
    method(req, "GET");
    const user = await requireUser(req);
    await ensureFeatureEnabled("receipts", "Receipts are temporarily unavailable.");
    await ensureUserFeature(user.id, "RECEIPTS", "Your current plan does not include receipts.");
    await rateLimit(`storage:usage:${user.id}`, 120, 60 * 60);
    jsonOk(res, { usage: await getReceiptUsage(user.id) });
  } catch (error) {
    handleError(res, error);
  }
}
