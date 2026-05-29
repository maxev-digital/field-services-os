import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const MAPPINGS: Record<string, Record<string, string>> = {
  tarrant: {
    apn: 'AccountNum', owner_name: 'OwnerName', prop_address: 'SitusAddress',
    prop_city: 'SitusCity', prop_zip: 'SitusZip', owner_mail_addr: 'MailAddress',
    owner_mail_city: 'MailCity', owner_mail_state: 'MailState', owner_mail_zip: 'MailZip',
    prop_type: 'StateCategory', year_built: 'YearBuilt', living_sqft: 'LivingArea',
    total_value: 'AppraisedValue',
  },
  collin: {
    apn: 'PropID', owner_name: 'OwnerName1', prop_address: 'SitusAddress',
    prop_city: 'SitusCity', prop_zip: 'SitusZip5', owner_mail_addr: 'MailAddr1',
    owner_mail_city: 'MailCity', owner_mail_state: 'MailState', owner_mail_zip: 'MailZip',
    prop_type: 'PropertyType', year_built: 'YrBuilt', living_sqft: 'LivingArea',
    total_value: 'TotalAppr',
  },
  denton: {
    apn: 'Acct', owner_name: 'OwnerName', prop_address: 'SitusAddress',
    prop_city: 'SitusCity', prop_zip: 'SitusZipCode', owner_mail_addr: 'MailAddress1',
    owner_mail_city: 'MailCity', owner_mail_state: 'MailState', owner_mail_zip: 'MailZip',
    prop_type: 'PropertyClass', year_built: 'YearBuilt', living_sqft: 'LivingArea',
    total_value: 'TotalAppraisedValue',
  },
  rockwall: {
    apn: 'AccountNumber', owner_name: 'OwnerName', prop_address: 'SitusAddress',
    prop_city: 'SitusCity', prop_zip: 'SitusZip', owner_mail_addr: 'MailAddress',
    owner_mail_city: 'MailCity', owner_mail_state: 'MailState', owner_mail_zip: 'MailZip',
    prop_type: 'LandUseCode', year_built: 'YearBuilt', living_sqft: 'LivingArea',
    total_value: 'TotalValue',
  },
  ellis: {
    apn: 'Account', owner_name: 'Owner', prop_address: 'PropertyAddress',
    prop_city: 'City', prop_zip: 'Zip', owner_mail_addr: 'MailAddress',
    owner_mail_city: 'MailCity', owner_mail_state: 'MailState', owner_mail_zip: 'MailZip',
    prop_type: 'PropertyClass', year_built: 'YearBuilt', living_sqft: 'SqFt',
    total_value: 'AppraisedTotal',
  },
  johnson: {
    apn: 'AccountNum', owner_name: 'OwnerName', prop_address: 'SitusAddress',
    prop_city: 'SitusCity', prop_zip: 'SitusZip', owner_mail_addr: 'MailAddress',
    owner_mail_city: 'MailCity', owner_mail_state: 'MailState', owner_mail_zip: 'MailZip',
    prop_type: 'PropertyClass', year_built: 'YearBuilt', living_sqft: 'LivingArea',
    total_value: 'TotalAppraisedValue',
  },
};

const RESIDENTIAL_CODES: Record<string, string[]> = {
  tarrant:  ['A1','A2','A3','A4','A5','A6'],
  collin:   ['R','RS','A','A1','A2'],
  denton:   ['A','A1','A2','RS','RES'],
  rockwall: ['A','A1','A2','1110','1120'],
  ellis:    ['A','A1','A2','RS'],
  johnson:  ['A','A1','A2','RS'],
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file     = formData.get('file') as File;
  const county   = ((formData.get('county') as string) || '').toLowerCase();
  const resOnly  = formData.get('residentialOnly') === 'true';

  if (!file)   return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!county) return NextResponse.json({ error: 'county required' }, { status: 400 });

  const mapping = MAPPINGS[county];
  if (!mapping) return NextResponse.json({ error: 'Unknown county: ' + county }, { status: 400 });

  const text    = await file.text();
  const lines   = text.split('\n');
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g,'').trim());

  const get = (row: string[], field: string): string | null => {
    const col = mapping[field];
    if (!col) return null;
    const idx = headers.indexOf(col);
    if (idx < 0) return null;
    return row[idx]?.replace(/^"|"$/g,'').trim() || null;
  };

  const resCodes = resOnly ? (RESIDENTIAL_CODES[county] ?? []) : [];
  let inserted = 0, skipped = 0, errors = 0;
  const BATCH = 500;

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const row = parseCSVLine(raw);

    const propType = get(row, 'prop_type');
    if (resOnly && resCodes.length && propType && !resCodes.includes(propType)) { skipped++; continue; }

    const apn     = get(row, 'apn');
    const address = get(row, 'prop_address');
    if (!address) { skipped++; continue; }

    const mailAddr = get(row, 'owner_mail_addr');
    const isOwnOcc = mailAddr ? mailAddr.toLowerCase() === address.toLowerCase() : null;
    const yrRaw    = get(row, 'year_built');
    const sqRaw    = get(row, 'living_sqft');
    const valRaw   = get(row, 'total_value');

    try {
      await prisma.$executeRaw`
        INSERT INTO parcels
          (apn, cad_source, county, owner_name, owner_mail_addr, owner_mail_city,
           owner_mail_state, owner_mail_zip, prop_address, prop_city, prop_zip,
           prop_type, year_built, living_sqft, total_value, is_owner_occupied)
        VALUES (
          ${apn}, ${county}, ${county},
          ${get(row,'owner_name')}, ${mailAddr},
          ${get(row,'owner_mail_city')}, ${get(row,'owner_mail_state')}, ${get(row,'owner_mail_zip')},
          ${address}, ${get(row,'prop_city')}, ${get(row,'prop_zip')},
          ${propType},
          ${yrRaw  ? parseInt(yrRaw)                    : null},
          ${sqRaw  ? parseInt(sqRaw)                    : null},
          ${valRaw ? parseFloat(valRaw.replace(/,/g,'')): null},
          ${isOwnOcc}
        )
        ON CONFLICT (apn) DO UPDATE SET
          owner_name = EXCLUDED.owner_name, prop_type = EXCLUDED.prop_type,
          total_value = EXCLUDED.total_value, is_owner_occupied = EXCLUDED.is_owner_occupied`;
      inserted++;
    } catch { errors++; }
  }

  return NextResponse.json({ ok: true, inserted, skipped, errors, county });
}
