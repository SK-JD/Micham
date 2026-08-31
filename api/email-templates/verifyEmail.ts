export function verifyEmailTemplate(displayName: string, verifyUrl: string) {
  const text = `Hi ${displayName}, verify your Micham account: ${verifyUrl}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0b1f17">
      <h2>Verify your Micham account</h2>
      <p>Hi ${displayName},</p>
      <p>Use the button below to verify your email and start cloud sync.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;background:#04966d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Verify email</a></p>
      <p>If the button does not work, open this link:</p>
      <p>${verifyUrl}</p>
    </div>
  `;
  return { subject: "Verify your Micham account", html, text };
}
