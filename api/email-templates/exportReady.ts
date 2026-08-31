export function exportReadyTemplate(displayName: string) {
  const text = `Hi ${displayName}, your Micham data export is attached.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0b1f17">
      <h2>Your Micham export is ready</h2>
      <p>Hi ${displayName},</p>
      <p>Your requested data export is attached as a CSV file that opens in Excel.</p>
    </div>
  `;
  return { subject: "Your Micham data export", html, text };
}
