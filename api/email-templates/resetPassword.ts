export function resetPasswordTemplate(displayName: string, resetUrl: string) {
  const text = `Hi ${displayName}, reset your Micham password: ${resetUrl}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0b1f17">
      <h2>Reset your Micham password</h2>
      <p>Hi ${displayName},</p>
      <p>Use the button below to set a new password. This link expires soon.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#04966d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
      <p>If the button does not work, open this link:</p>
      <p>${resetUrl}</p>
    </div>
  `;
  return { subject: "Reset your Micham password", html, text };
}
