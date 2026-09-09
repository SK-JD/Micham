import { ApiError } from "./http.js";
import { receiptsBucket } from "./env.js";
import { adminDb } from "./supabaseAdmin.js";

export type ReceiptUsage = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  fileCount: number;
};

const defaultLimitBytes = 25 * 1024 * 1024;

function numberValue(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export async function getReceiptLimitBytes(userId: string) {
  const db = adminDb();
  const [overrideResult, settingResult] = await Promise.all([
    db.from("micham_user_storage_limits").select("limit_bytes").eq("user_id", userId).maybeSingle(),
    db.from("micham_system_settings").select("value").eq("setting_key", "receipt_storage_default_limit_bytes").maybeSingle(),
  ]);
  if (overrideResult.error && overrideResult.error.code !== "PGRST116") throw overrideResult.error;
  if (settingResult.error && settingResult.error.code !== "PGRST116") throw settingResult.error;
  return numberValue(overrideResult.data?.limit_bytes, numberValue(settingResult.data?.value, defaultLimitBytes));
}

export async function getReceiptUsage(userId: string): Promise<ReceiptUsage> {
  const db = adminDb();
  const { data, error } = await db
    .from("micham_receipt_files")
    .select("size_bytes")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
  const usedBytes = (data ?? []).reduce((sum, row) => sum + numberValue(row.size_bytes, 0), 0);
  const limitBytes = await getReceiptLimitBytes(userId);
  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    fileCount: data?.length ?? 0,
  };
}

export function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new ApiError(400, "Receipt image data is invalid.");
  const mime = match[1];
  if (!mime.startsWith("image/")) throw new ApiError(400, "Receipt must be an image.");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw new ApiError(400, "Receipt image is empty.");
  if (buffer.byteLength > 750 * 1024) throw new ApiError(413, "Receipt image is too large after compression.");
  return { mime, buffer };
}

export function safeReceiptName(filename: string) {
  const cleaned = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 90) || "receipt.jpg";
}

export function receiptBucketName() {
  return receiptsBucket();
}

