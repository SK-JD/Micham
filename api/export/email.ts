import { handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { sendMail } from "../_lib/mailer";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";
import { exportReadyTemplate } from "../email-templates/exportReady";

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    method(req, "POST");
    const user = await requireUser(req);
    const db = adminDb();
    const { data, error } = await db
      .from("micham_entities")
      .select("entity_type, entity_id, payload, deleted_at, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const rows = ["type,id,deleted_at,updated_at,payload", ...(data || []).map((row) => [row.entity_type, row.entity_id, row.deleted_at, row.updated_at, row.payload].map(csvCell).join(","))];
    const template = exportReadyTemplate(user.display_name);
    const delivery = await sendMail({
      to: user.email,
      ...template,
      attachments: [{ filename: "micham-export.csv", content: rows.join("\n"), contentType: "text/csv" }],
    });
    jsonOk(res, { ok: true, emailDelivery: delivery });
  } catch (error) {
    handleError(res, error);
  }
}
