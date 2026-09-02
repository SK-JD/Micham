import { handleError, jsonOk, method, type ApiRequest, type ApiResponse } from "../_lib/http";
import { sendMail } from "../_lib/mailer";
import { requireUser } from "../_lib/security";
import { adminDb } from "../_lib/supabaseAdmin";
import { exportReadyTemplate } from "../email-templates/exportReady";

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
    method(req, "POST");
    const user = await requireUser(req);
    const db = adminDb();
    const { data, error } = await db
      .from("micham_entities")
      .select("entity_type, entity_id, payload, deleted_at, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const template = exportReadyTemplate(user.display_name);
    const delivery = await sendMail({
      to: user.email,
      ...template,
      attachments: [{ filename: "micham-export.xls", content: workbook(data || []), contentType: "application/vnd.ms-excel" }],
    });
    jsonOk(res, { ok: true, emailDelivery: delivery });
  } catch (error) {
    handleError(res, error);
  }
}
