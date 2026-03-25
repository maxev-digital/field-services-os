export interface WrapperOptions {
  preheader?: string
  unsubscribeUrl?: string
}

export function wrapInBrandedEmail(body: string, options: WrapperOptions = {}): string {
  const { preheader = '', unsubscribeUrl } = options

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Roof Works of Texas</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#111827;">${preheader}</div>` : ''}

<!-- Wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111827;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Card -->
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">

        <!-- Header -->
        <tr>
          <td style="background-color:#dc2626;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">🏠 Roof Works of Texas</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#fecaca;">DFW's Trusted Roofing &amp; Storm Damage Specialists</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:32px;">
            ${body}
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td style="background-color:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">Roof Works of Texas</p>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
              📞 <a href="tel:+12147953905" style="color:#dc2626;text-decoration:none;">(214) 795-3905</a>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              🌐 <a href="https://roofworksoftexas.com" style="color:#dc2626;text-decoration:none;">roofworksoftexas.com</a>
            </p>
            <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Licensed &amp; Insured · DFW Texas</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#111827;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#6b7280;">
              You received this email because you may have roof damage in your area.
              ${unsubscribeUrl ? `<br/><a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a>` : ''}
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td>
  </tr>
</table>
<!-- /Wrapper -->

</body>
</html>`
}
