import { getConfiguredBaseUrl } from "@/lib/site-url";

export type AaauTransactionalEmailAction = {
  label: string;
  url: string;
};

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

export function buildAaauTransactionalEmailHtml(input: {
  title: string;
  eyebrow: string;
  headerLabel: string;
  paragraphs: string[];
  action?: AaauTransactionalEmailAction;
  detailLines?: string[];
  footerNote?: string;
  previewText?: string;
}) {
  const baseUrl = getConfiguredBaseUrl();
  const logoUrl = `${baseUrl}/images/brand/Logo%20AAAU%20PNG.png`;
  const mascotUrl = `${baseUrl}/images/mascots/bull_torcida.png`;
  const paragraphs = input.paragraphs
    .map((paragraph) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#ddd0d5;">${escapeEmailHtml(paragraph)}</p>`)
    .join("");
  const details = input.detailLines?.length
    ? `<tr>
        <td style="padding:8px 28px 0;font-family:Arial,sans-serif;">
          <div style="border:1px solid rgba(227,189,143,.35);background:#1a1115;border-radius:14px;padding:16px;color:#f4ecef;font-size:14px;line-height:1.7;">
            ${input.detailLines.map((line) => escapeEmailHtml(line)).join("<br />")}
          </div>
        </td>
      </tr>`
    : "";
  const action = input.action
    ? `<tr>
        <td style="padding:24px 28px 8px;font-family:Arial,sans-serif;">
          <a href="${escapeEmailHtml(input.action.url)}" style="display:inline-block;background:#b0173f;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:13px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;">${escapeEmailHtml(input.action.label)}</a>
        </td>
      </tr>`
    : "";
  const footerNote = input.footerNote
    ? `<p style="margin:0 0 10px;">${escapeEmailHtml(input.footerNote)}</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeEmailHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#080607;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(input.previewText ?? input.title)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#080607;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;border-collapse:collapse;background:#120d0f;border:1px solid rgba(255,255,255,.12);border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:22px 28px;background:#7b1023;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td><img src="${escapeEmailHtml(logoUrl)}" width="92" alt="AAAU" style="display:block;width:92px;max-width:100%;height:auto;" /></td>
                    <td align="right" style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#ffffff;">${escapeEmailHtml(input.headerLabel)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;font-family:Arial,sans-serif;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td valign="top">
                      <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#e3bd8f;font-weight:800;">${escapeEmailHtml(input.eyebrow)}</div>
                      <h1 style="margin:10px 0 14px;font-size:30px;line-height:1.08;color:#ffffff;text-transform:uppercase;">${escapeEmailHtml(input.title)}</h1>
                      ${paragraphs}
                    </td>
                    <td align="right" valign="bottom" width="128" style="width:128px;padding-left:12px;">
                      <img src="${escapeEmailHtml(mascotUrl)}" width="108" alt="Bull da AAAU" style="display:block;width:108px;max-width:100%;height:auto;margin-left:auto;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${details}
            ${action}
            <tr>
              <td style="padding:16px 28px 30px;font-family:Arial,sans-serif;color:#c8b8bf;font-size:13px;line-height:1.7;">
                ${footerNote}
                <p style="margin:0;color:#8f7e85;">AAAU Uniritter</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
