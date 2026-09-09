export function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function appBaseUrl() {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:5173";
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function receiptsBucket() {
  return process.env.SUPABASE_RECEIPTS_BUCKET?.trim() || process.env.RECEIPTS_BUCKET?.trim() || "Recipts";
}

export function emailLogoUrl() {
  const value = process.env.EMAIL_LOGO_URL?.trim() || process.env.MAIL_LOGO_URL?.trim() || "";
  return /^https:\/\//i.test(value) ? value : "";
}

export function emailWordmarkUrl() {
  const value =
    process.env.EMAIL_WORDMARK_URL?.trim() ||
    process.env.EMAIL_LOGO_URL?.trim() ||
    process.env.MAIL_LOGO_URL?.trim() ||
    "";
  return /^https:\/\//i.test(value) ? value : "";
}
