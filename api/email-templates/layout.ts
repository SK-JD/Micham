export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function mailShell(title: string, preview: string, body: string) {
  const safeTitle = escapeHtml(title);
  const safePreview = escapeHtml(preview);
  return `<!doctype html>
<html>
  <body style="margin:0;background:#edf8f2;font-family:Inter,Segoe UI,Arial,sans-serif;color:#073426">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${safePreview}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf8f2;padding:32px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #bfe8d5;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(3,64,45,.12)">
            <tr>
              <td style="background:linear-gradient(135deg,#003c2d,#00c991);padding:28px 28px 22px">
                <div style="display:flex;align-items:center;gap:12px">
                  <span style="display:inline-grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#eafff6;color:#00684e;font-weight:900;font-size:26px">M</span>
                  <span>
                    <strong style="display:block;color:#b6ffe2;font-size:32px;line-height:1">Micham</strong>
                    <span style="display:block;color:#eafff6;font-size:12px;margin-top:4px">Micham evlo irukku?</span>
                  </span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px">
                <h1 style="margin:0 0 14px;color:#06291f;font-size:24px;line-height:1.25">${safeTitle}</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f6fcf9;color:#5f7f73;font-size:12px">
                This message was sent for your Micham account.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buttonLink(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:linear-gradient(135deg,#006b4f,#02c991);color:#ffffff;padding:13px 20px;border-radius:12px;text-decoration:none;font-weight:800">${escapeHtml(label)}</a>`;
}
