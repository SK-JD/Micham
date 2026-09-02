import { buttonLink, escapeHtml, mailShell } from "./layout";

export function verifyEmailTemplate(displayName: string, verifyUrl: string) {
  const text = `Hi ${displayName}, verify your Micham account: ${verifyUrl}`;
  const html = mailShell(
    "Verify your Micham account",
    "Verify your email to activate cloud sync.",
    `
      <p style="margin:0 0 16px;color:#315f51;font-size:15px;line-height:1.6">Hi ${escapeHtml(displayName)},</p>
      <p style="margin:0 0 24px;color:#315f51;font-size:15px;line-height:1.6">Verify this email to activate your account and start cloud sync.</p>
      <p style="margin:0 0 24px">${buttonLink(verifyUrl, "Verify email")}</p>
      <p style="margin:0;color:#6f8f84;font-size:13px;line-height:1.5">If the button does not work, open this link:<br><a href="${escapeHtml(verifyUrl)}" style="color:#007a5b;word-break:break-all">${escapeHtml(verifyUrl)}</a></p>
    `,
  );
  return { subject: "Verify your Micham account", html, text };
}
