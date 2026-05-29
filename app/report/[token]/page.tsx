import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const SAMPLE_PDF_URL = 'https://admin.roofworksoftexas.com/api/report/sample-packet';

interface HailEvent {
  date: string;
  rawDate: string;
  sizeIn: number;
  sizeLabel: string;
  risk: { label: string; color: string };
}

interface ReportData {
  prospect: {
    firstName: string;
    address: string;
    city: string;
    zip: string | null;
    county: string | null;
    yearBuilt: number | null;
    sqft: number | null;
    lat: number | null;
    lon: number | null;
    hailSizeIn: number | null;
    stormDate: string;
    hailLabel: string | null;
    risk: { label: string; color: string } | null;
  };
  stormEvents: HailEvent[];
}

async function getData(token: string): Promise<ReportData | null> {
  try {
    const res = await fetch(
      `https://admin.roofworksoftexas.com/api/report/${token}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const INSPECTION_AREAS = [
  { label: 'Roofing', desc: 'Shingles, flashing, ridge cap, granule loss, impact marks' },
  { label: 'Gutters', desc: 'Dents, downspouts, guards, detachment' },
  { label: 'Windows & Screens', desc: 'Window screens, door screens, pool enclosures' },
  { label: 'Siding', desc: 'Vinyl, HardiePlank, brick, stucco — cracks & impact damage' },
  { label: 'Chimney', desc: 'Flashing, cap, crown, brick & mortar integrity' },
  { label: 'Garage Doors', desc: 'Dents, bent panels, operational damage' },
  { label: 'Patio Cover', desc: 'Metal, wood, screen enclosures, pergolas' },
  { label: 'Fence', desc: 'Wood, vinyl, metal — broken boards, blown sections, leaning' },
];

const ESTIMATE_RANGES = [
  { label: 'Roof Only (asphalt shingle)', range: '$6,500 – $16,000' },
  { label: 'Roof + Gutters', range: '$8,000 – $20,000' },
  { label: 'Full Exterior (roof, gutters, siding)', range: '$14,000 – $42,000' },
  { label: 'Roof + Gutters + Fence', range: '$10,500 – $26,000' },
];

const HOW_IT_WORKS = [
  { title: 'Schedule Free Inspection', desc: 'Call or text us to pick a time. We come to you — takes about 30 minutes.' },
  { title: 'We Inspect & Document', desc: 'Our inspector photographs every damage area and records all findings in our system.' },
  { title: 'Receive Your Full Report', desc: 'You get a complete inspection report with photos and an insurance-ready estimate at no cost.' },
  { title: 'We Handle the Claim', desc: 'If you choose to proceed, we work directly with your adjuster. You pay only your deductible.' },
];

export default async function PropertyReportPage({ params }: { params: { token: string } }) {
  const data = await getData(params.token);
  if (!data) notFound();

  const { prospect, stormEvents } = data;
  const mapQuery = encodeURIComponent(prospect.address + ', ' + prospect.city + ', TX');
  const mapSrc = 'https://maps.google.com/maps?q=' + mapQuery + '&t=k&z=18&ie=UTF8&output=embed';

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>

      {/* HEADER */}
      <div style={{ background: '#1a2e4a' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://admin.roofworksoftexas.com/images/main_logo_navy_red.png"
              alt="Roof Works of Texas"
              style={{ height: 48, width: 'auto' }}
            />
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Roof Works of Texas</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>Roofing Contractor · DFW & North Texas</div>
            </div>
          </div>
          <div style={{ background: '#9b1c1c', margin: '0 -20px', padding: '16px 20px' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>Storm Damage Property Report</div>
            <div style={{ color: '#fecaca', fontSize: 13, marginTop: 4 }}>
              {'Prepared for ' + prospect.firstName + ' · ' + prospect.address + ', ' + prospect.city}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 20px 48px' }}>

        {/* STORM ALERT BANNER */}
        {prospect.hailSizeIn && prospect.risk && (
          <div style={{ background: prospect.risk.color, color: '#fff', borderRadius: '0 0 12px 12px', padding: '16px 20px', marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {'HAIL EVENT DETECTED — ' + prospect.risk.label + ' RISK'}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: 0.92 }}>
              {'On ' + prospect.stormDate + ', your property was in the path of a storm with '}
              <strong>{prospect.hailLabel}</strong>
              {' hail (' + prospect.hailSizeIn.toFixed(2) + '" diameter). Hail this size is known to cause insurance-claimable damage.'}
            </div>
          </div>
        )}

        {/* PROPERTY INFO */}
        <Section title="Your Property">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <InfoRow label="Address" value={prospect.address + ', ' + prospect.city + (prospect.zip ? ' ' + prospect.zip : '')} />
            <InfoRow label="County" value={(prospect.county ? prospect.county + ' County' : 'North Texas')} />
            {prospect.yearBuilt ? <InfoRow label="Year Built" value={String(prospect.yearBuilt)} /> : null}
            {prospect.sqft ? <InfoRow label="Living Sq Ft" value={prospect.sqft.toLocaleString() + ' sq ft'} /> : null}
          </div>
          {(prospect.lat && prospect.lon) ? (
            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              <iframe src={mapSrc} width="100%" height="240" style={{ border: 0, display: 'block' }} loading="lazy" title="Property Location" />
            </div>
          ) : null}
        </Section>

        {/* HAIL HISTORY */}
        <Section title={'Recorded Hail Events at Your Property'}>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
            Our records show{' '}
            <strong>{stormEvents.length === 1 ? '1 hail event' : stormEvents.length + ' hail events'}</strong>
            {' recorded at your specific address. The date(s) below are what you will need to reference when filing an insurance claim with your provider.'}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1a2e4a', color: '#fff' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Claim Date</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Hail Size</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {stormEvents.map((h, i) => (
                  <tr key={h.rawDate} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 700 }}>{h.date}</td>
                    <td style={{ padding: '7px 10px' }}>{h.sizeLabel}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      <span style={{ background: h.risk.color + '22', color: h.risk.color, padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                        {h.risk.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
            Source: Storm tracking data for your specific property address.
          </p>
        </Section>

        {/* WHAT WE INSPECT */}
        <Section title="What Our Free Inspection Covers">
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Our certified inspector documents every exterior component that insurance companies evaluate during a storm damage claim:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {INSPECTION_AREAS.map((area) => (
              <div key={area.label} style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{area.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{area.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '12px 16px', marginTop: 14, fontSize: 13 }}>
            <strong>What you receive after inspection:</strong> A full written report with photos of every damage area, all measurements, and a complete insurance-ready estimate — at no cost to you.
          </div>
        </Section>

        {/* SAMPLE INSPECTION REPORT */}
        <Section title="See Your Full Documentation Packet">
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            This is a real documentation packet from a recent DFW job — the exact same reports, estimate, and documents you will receive after we complete your inspection:
          </p>
          <a
            href={SAMPLE_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '14px 16px', textDecoration: 'none', color: '#15803d' }}
          >
            <div style={{ fontSize: 28 }}>{'📄'}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>View Full Sample Documentation Packet (PDF)</div>
              <div style={{ fontSize: 12, color: '#16a34a' }}>
                Inspection report · Estimate · Lien waiver · Post-construction checklist · Certificate
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 18 }}>{'↗'}</div>
          </a>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
            Your report will include your property address, inspector name, and all findings specific to your home.
          </p>
        </Section>

        {/* TYPICAL CLAIM VALUES */}
        <Section title="Typical DFW Storm Claim Values">
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
            Actual amounts depend on your property's specific damage, roof size, and insurance policy. These are typical ranges for DFW storm claims:
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Scope of Work</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Typical Range</th>
              </tr>
            </thead>
            <tbody>
              {ESTIMATE_RANGES.map((r, i) => (
                <tr key={r.label} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '8px 10px' }}>{r.label}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{r.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
            Your actual estimate is provided free after inspection — no commitment required to receive it.
          </p>
        </Section>

        {/* HOW IT WORKS */}
        <Section title="How It Works">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {HOW_IT_WORKS.map((item, idx) => (
              <div key={item.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a2e4a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                  {idx + 1}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <div style={{ background: '#1a2e4a', borderRadius: 12, padding: '28px 24px', textAlign: 'center', marginTop: 20 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Schedule Your Free Inspection</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>No cost. No commitment. We come to you.</div>
          <a href="tel:+12147953905" style={{ display: 'block', background: '#9b1c1c', color: '#fff', padding: '16px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
            Call (214) 795-3905
          </a>
          <a href="sms:+19723621301" style={{ display: 'block', background: '#334155', color: '#fff', padding: '14px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>
            Text (972) 362-1301
          </a>
        </div>

        {/* FOOTER */}
        <div style={{ textAlign: 'center', marginTop: 32, paddingTop: 24, borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, color: '#1a2e4a', marginBottom: 4 }}>Roof Works of Texas</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            (214) 795-3905 · info@roofworksoftexas.com · roofworksoftexas.com
          </div>
          <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8 }}>
            Storm data sourced from NOAA Storm Prediction Center. Estimate ranges reflect typical DFW values and are not a guarantee.
          </div>
        </div>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: 16 }}>
      <div style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', padding: '12px 16px', fontWeight: 700, fontSize: 15, color: '#1a2e4a' }}>
        {title}
      </div>
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>{value}</div>
    </div>
  );
}
