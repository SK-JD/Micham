import { buttonLink, escapeHtml, mailShell } from "./layout";

export function resetPasswordTemplate(displayName: string, resetUrl: string) {
  const text = `Hi ${displayName}, reset your Micham password: ${resetUrl}`;
  const html = mailShell(
    "Reset your Micham password",
    "Use this secure link to set a new password.",
    `
      <p style="margin:0 0 16px;color:#315f51;font-size:15px;line-height:1.6">Hi ${escapeHtml(displayName)},</p>
      <p style="margin:0 0 24px;color:#315f51;font-size:15px;line-height:1.6">Use this secure link to set a new password. The link expires soon.</p>
      <p style="margin:0 0 24px">${buttonLink(resetUrl, "Reset password")}</p>
      <p style="margin:0;color:#6f8f84;font-size:13px;line-height:1.5">If the button does not work, open this link:<br><a href="${escapeHtml(resetUrl)}" style="color:#007a5b;word-break:break-all">${escapeHtml(resetUrl)}</a></p>
    `,
  );
  return { subject: "Reset your Micham password", html, text };
}
