export interface WrapperOptions {
  preheader?: string
  unsubscribeUrl?: string
  repName?: string
  repTitle?: string
}

export function wrapInBrandedEmail(body: string, options: WrapperOptions = {}): string {
  const {
    preheader = '',
    unsubscribeUrl,
    repName  = 'Austin Peterson',
    repTitle = 'Owner, Roof Works of Texas',
  } = options

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Roof Works of Texas</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#f1f5f9;">${preheader}</div>` : ''}
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background-color:#ffffff;border:1px solid #cbd5e1;">

        <!-- Header -->
        <tr>
          <td style="background-color:#1a3a5c;padding:22px 32px;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#ffffff;font-family:Georgia,'Times New Roman',serif;letter-spacing:0.5px;">ROOF WORKS OF TEXAS</p>
            <p style="margin:5px 0 0;font-size:11px;color:#93c5fd;font-family:Arial,sans-serif;letter-spacing:1.2px;">INSURED &nbsp;&middot;&nbsp; DFW TEXAS</p>
          </td>
        </tr>

        <!-- Credential strip -->
        <tr>
          <td style="background-color:#f8fafc;border-top:3px solid #dc2626;border-bottom:1px solid #e2e8f0;padding:10px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="text-align:center;width:33%;padding:2px 6px;border-right:1px solid #cbd5e1;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#1a3a5c;font-family:Arial,sans-serif;letter-spacing:0.8px;">A+ BBB ACCREDITED</p>
                </td>
                <td style="text-align:center;width:34%;padding:2px 6px;border-right:1px solid #cbd5e1;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#1a3a5c;font-family:Arial,sans-serif;letter-spacing:0.8px;">11 YEARS SERVING DFW</p>
                </td>
                <td style="text-align:center;width:33%;padding:2px 6px;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#1a3a5c;font-family:Arial,sans-serif;letter-spacing:0.8px;">FREE DETAILED ESTIMATES</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;background-color:#ffffff;">
            ${body}
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td style="background-color:#f8fafc;padding:20px 32px;border-top:2px solid #1a3a5c;">
            <p style="margin:0;font-size:14px;font-weight:700;color:#1a3a5c;font-family:Arial,sans-serif;">${repName}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#374151;font-family:Arial,sans-serif;">${repTitle}</p>
            <p style="margin:8px 0 0;font-size:13px;color:#374151;font-family:Arial,sans-serif;">
              <a href="tel:+12147953905" style="color:#dc2626;text-decoration:none;font-weight:600;">(214) 795-3905</a>
              &nbsp;&nbsp;&middot;&nbsp;&nbsp;
              <a href="https://roofworksoftexas.com" style="color:#1a3a5c;text-decoration:none;">roofworksoftexas.com</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#1a3a5c;padding:12px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#93c5fd;font-family:Arial,sans-serif;">
              You received this message because your property may be in a storm-affected area.
              ${unsubscribeUrl ? `<br/><a href="${unsubscribeUrl}" style="color:#bfdbfe;text-decoration:underline;">Unsubscribe</a>` : ''}
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
