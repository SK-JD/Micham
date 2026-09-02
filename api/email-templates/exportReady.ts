import { escapeHtml, mailShell } from "./layout";

export function exportReadyTemplate(displayName: string) {
  const text = `Hi ${displayName}, your Micham data export is attached.`;
  const html = mailShell(
    "Your Micham export is ready",
    "Your account data export is attached.",
    `
      <p style="margin:0 0 16px;color:#315f51;font-size:15px;line-height:1.6">Hi ${escapeHtml(displayName)},</p>
      <p style="margin:0 0 8px;color:#315f51;font-size:15px;line-height:1.6">Your requested account export is attached as an Excel-compatible workbook.</p>
      <p style="margin:0;color:#6f8f84;font-size:13px;line-height:1.5">Keep this file private. It can include transactions, friends, accounts, categories, settlements, and repayments.</p>
    `,
  );
  return { subject: "Your Micham data export", html, text };
}
