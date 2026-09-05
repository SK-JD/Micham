import { beginRequest, handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { sendMail } from "../_lib/mailer.js";
import { rateLimit, requireUser } from "../_lib/security.js";
import { adminDb } from "../_lib/supabaseAdmin.js";
import { exportReadyTemplate } from "../email-templates/exportReady.js";

function xmlCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function worksheet(name: string, rows: unknown[][]) {
  return `<Worksheet ss:Name="${xmlCell(name)}"><Table>${rows
    .map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${xmlCell(cell)}</Data></Cell>`).join("")}</Row>`)
    .join("")}</Table></Worksheet>`;
}

function workbook(rows: Array<{ entity_type: string; entity_id: string; deleted_at: string | null; updated_at: string; payload: Record<string, unknown> }>) {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.entity_type, [...(grouped.get(row.entity_type) ?? []), row]);
  const sheets = Array.from(grouped.entries()).map(([type, items]) =>
    worksheet(type, [
      ["Type", "ID", "Deleted At", "Updated At", "Payload"],
      ...items.map((row) => [row.entity_type, row.entity_id, row.deleted_at ?? "", row.updated_at, row.payload]),
    ]),
  );
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheets.join("") || worksheet("empty", [["No data"]])}
</Workbook>`;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    beginRequest(req, res, "export/email");
    method(req, "POST");
    const user = await requireUser(req);
    await rateLimit(`export:email:${user.id}`, 3, 24 * 60 * 60);
    const db = adminDb();
    const { data: job, error: jobError } = await db
      .from("micham_export_jobs")
      .insert({ user_id: user.id, export_type: "xls", status: "queued" })
      .select("id")
      .single();
    if (jobError) throw jobError;

    const { data, error } = await db
      .from("micham_entities")
      .select("entity_type, entity_id, payload, deleted_at, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const template = exportReadyTemplate(user.display_name);
    try {
      const delivery = await sendMail({
        to: user.email,
        ...template,
        attachments: [{ filename: "micham-export.xls", content: workbook(data || []), contentType: "application/vnd.ms-excel" }],
      });
      await db
        .from("micham_export_jobs")
        .update({ status: delivery.delivered ? "sent" : "failed", error_message: delivery.delivered ? null : delivery.reason || "Email delivery failed.", sent_at: delivery.delivered ? new Date().toISOString() : null })
        .eq("id", job.id);
      jsonOk(res, { ok: true, exportJobId: job.id, emailDelivery: delivery });
    } catch (mailError) {
      await db
        .from("micham_export_jobs")
        .update({ status: "failed", error_message: mailError instanceof Error ? mailError.message.slice(0, 500) : "Email delivery failed." })
        .eq("id", job.id);
      throw mailError;
    }
  } catch (error) {
    handleError(res, error);
  }
}
