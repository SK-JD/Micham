import { bodyObject, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";

const entityTypes = new Set(["accounts", "categories", "transactions", "budgets", "recurringTransactions", "people", "settlements", "repayments"]);

function items(value: unknown) {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "POST");
    const user = await requireUser(req);
    const snapshot = bodyObject(req);
    const profile = snapshot.profile && typeof snapshot.profile === "object" ? (snapshot.profile as Record<string, unknown>) : undefined;
    const db = adminDb();

    if (profile) {
      const { error: profileError } = await db.from("micham_profiles").upsert(
        {
          id: user.id,
          local_profile_id: String(profile.id || ""),
          email: user.email,
          display_name: user.display_name,
          currency: user.currency,
          connection_code: user.connection_code,
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const [entityType, value] of Object.entries(snapshot)) {
      if (!entityTypes.has(entityType)) continue;
      for (const item of items(value)) {
        if (!item.id) continue;
        rows.push({
          owner_id: user.id,
          entity_type: entityType,
          entity_id: String(item.id),
          payload: { ...item, syncState: "synced" },
          deleted_at: item.deletedAt || null,
        });
      }
    }

    if (rows.length) {
      const { error } = await db.from("micham_entities").upsert(rows, { onConflict: "owner_id,entity_type,entity_id" });
      if (error) throw error;
    }
    jsonOk(res, { ok: true, synced: rows.length });
  } catch (error) {
    handleError(res, error);
  }
}
