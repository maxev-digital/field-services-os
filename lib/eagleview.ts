/**
 * EagleView API Client
 *
 * Covers two separate APIs:
 *   1. Measurement Order API  (apicenter.eagleview.com)  — client_credentials OAuth2
 *   2. Property Data API      (apis.eagleview.com)        — client_credentials OAuth2
 *
 * Required env vars:
 *   EV_ENV                    = "sandbox" | "production"  (default: sandbox)
 *
 *   Measurement Order API (both sandbox and production use same token URL):
 *   EV_CLIENT_ID              — OAuth2 client_id  (from developer portal app)
 *   EV_CLIENT_SECRET          — OAuth2 client_secret
 *
 *   Property Data API:
 *   EV_PROPERTY_CLIENT_ID     — Client Credentials id
 *   EV_PROPERTY_CLIENT_SECRET — Client Credentials secret
 *
 * Token endpoint is always https://apicenter.eagleview.com/token (even for sandbox).
 * Sandbox API base:       https://sandbox.apicenter.eagleview.com
 * Production API base:    https://apicenter.eagleview.com
 */

const IS_SANDBOX = (process.env.EV_ENV ?? 'sandbox') !== 'production';

// ── Measurement Order API ──────────────────────────────────────────────────
const MO_BASE = IS_SANDBOX
  ? 'https://sandbox.apicenter.eagleview.com'
  : 'https://apicenter.eagleview.com';

// Token URL is ALWAYS production (per EV sandbox docs) — uses Okta oauth2
const MO_TOKEN_URL = 'https://apicenter.eagleview.com/oauth2/v1/token';

// ── Property Data API ──────────────────────────────────────────────────────
const PD_BASE = IS_SANDBOX
  ? 'https://sandbox.apis.eagleview.com'
  : 'https://apis.eagleview.com';

const PD_TOKEN_URL = IS_SANDBOX
  ? 'https://sandbox.apis.eagleview.com/oauth/token'
  : 'https://apis.eagleview.com/oauth/token';

// ─── Token cache (in-process) ───────────────────────────────────────────────
let _moToken: string | null = null;
let _moTokenExp = 0;
let _pdToken: string | null = null;
let _pdTokenExp = 0;

async function getMoToken(): Promise<string> {
  if (_moToken && Date.now() < _moTokenExp) return _moToken;

  const res = await fetch(MO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     process.env.EV_CLIENT_ID ?? '',
      client_secret: process.env.EV_CLIENT_SECRET ?? '',
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[EV] Token fetch failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  _moToken = data.access_token;
  // expires_in is in seconds; subtract 60s buffer
  _moTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return _moToken!;
}

async function getPdToken(): Promise<string> {
  if (_pdToken && Date.now() < _pdTokenExp) return _pdToken;

  const res = await fetch(PD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     process.env.EV_PROPERTY_CLIENT_ID ?? '',
      client_secret: process.env.EV_PROPERTY_CLIENT_SECRET ?? '',
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[EV Property] Token fetch failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  _pdToken = data.access_token;
  _pdTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return _pdToken!;
}

// ─── Measurement Order API helpers ─────────────────────────────────────────

export async function evGetAvailableProducts() {
  const token = await getMoToken();
  const res = await fetch(`${MO_BASE}/v2/Product/GetAvailableProducts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`[EV] GetAvailableProducts failed (${res.status})`);
  return res.json();
}

export interface PlaceOrderAddress {
  street: string;
  city:   string;
  state:  string;
  zip:    string;
}

export interface PlaceOrderResult {
  orderId:   number;
  reportIds: number[];
}

/**
 * Place a measurement order.
 * productId — use evGetAvailableProducts() to find the right ID.
 *   Common IDs: Bid Perfect ≈ 8,  EagleView Premium ≈ 2  (confirm via API)
 * refId     — our internal reference (estimateId) to correlate webhooks.
 */
export async function evPlaceOrder(
  address:   PlaceOrderAddress,
  productId: number,
  refId:     string,
  opts?: { claimNo?: string; insuredName?: string }
): Promise<PlaceOrderResult> {
  const token = await getMoToken();

  const body = {
    OrderReports: {
      ReportAddresses: {
        Address:     address.street,
        City:        address.city,
        State:       address.state,
        Zip:         address.zip,
        AddressType: 1,
      },
      PrimaryProductId:         productId,
      DeliveryProductId:        2,          // standard JSON delivery
      MeasurementInstructionType: 1,        // 1 = Roof
      ChangesInLast4Years:      false,
      ReferenceId:              refId,
      ...(opts?.claimNo     && { ClaimNumber:  opts.claimNo }),
      ...(opts?.insuredName && { InsuredName:  opts.insuredName }),
    },
  };

  const res = await fetch(`${MO_BASE}/v2/Order/PlaceOrder`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[EV] PlaceOrder failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  // API returns array wrapping object
  const result = Array.isArray(data) ? data[0] : data;
  return { orderId: result.OrderId, reportIds: result.ReportIds };
}

export interface EvReportMeasurements {
  status:        string;
  area:          string | null;      // sq ft as string
  pitch:         string | null;
  lengthRidge:   string | null;
  lengthHip:     string | null;
  lengthValley:  string | null;
  lengthEave:    string | null;
  lengthRake:    string | null;
  totalFacets:   string | null;
  pdfUrl:        string | null;
  pitchTable:    { pitch: string; roofArea: string; pct: string }[] | null;
  wasteTable:    any | null;
}

export async function evGetReport(reportId: number): Promise<EvReportMeasurements> {
  const token = await getMoToken();
  const res = await fetch(`${MO_BASE}/v3/Report/GetReport?reportId=${reportId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`[EV] GetReport failed (${res.status})`);

  const data = await res.json();
  const r = Array.isArray(data) ? data[0] : data;

  return {
    status:       r.DisplayStatus ?? r.Status ?? 'Unknown',
    area:         r.Area          ?? null,
    pitch:        r.Pitch         ?? null,
    lengthRidge:  r.LengthRidge   ?? null,
    lengthHip:    r.LengthHip     ?? null,
    lengthValley: r.LengthValley  ?? null,
    lengthEave:   r.LengthEave    ?? null,
    lengthRake:   r.LengthRake    ?? null,
    totalFacets:  r.TotalRoofFacets ?? null,
    pdfUrl:       r.ReportDownloadLink ?? null,
    pitchTable:   r.PitchTable ? [{
      pitch:    r.PitchTable.Pitch,
      roofArea: r.PitchTable.RoofArea,
      pct:      r.PitchTable.PercentageRoofArea,
    }] : null,
    wasteTable: null,
  };
}

export async function evGetWaste(reportId: number) {
  const token = await getMoToken();
  const res = await fetch(`${MO_BASE}/v1/reports/${reportId}/structure-waste-measurements`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

// ─── Property Data API helpers ─────────────────────────────────────────────

export interface PropertySummaryResult {
  requestId: string;
  status:    string;
  roofCondition?:  string;  // green | yellow | red
  roofMaterial?:   string;  // shingle | wood shingle | other
  solarPanels?:    string;  // yes | no | unknown
  imageryDate?:    string;
}

export async function evRequestPropertySummary(
  address: string,
  callbackUrl?: string
): Promise<{ requestId: string; status: string }> {
  const token = await getPdToken();

  const body: any = {
    input: {
      addresses: [{ address: { completeAddress: address }, refId: 'roof-works' }],
    },
  };
  if (callbackUrl) body.callbackUrl = callbackUrl;

  const res = await fetch(`${PD_BASE}/property-summary/v2/request`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[EV Property] request failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  return { requestId: data.request?.id, status: data.request?.status };
}

export async function evGetPropertySummaryResult(requestId: string): Promise<PropertySummaryResult> {
  const token = await getPdToken();
  const res = await fetch(`${PD_BASE}/property-summary/v2/result/${requestId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`[EV Property] result fetch failed (${res.status})`);

  const data = await res.json();
  const status = data.request?.status ?? 'Unknown';

  if (status !== 'Completed') return { requestId, status };

  const result = data.results?.[0];
  return {
    requestId,
    status,
    roofCondition: result?.roof_condition_rating?.value,
    roofMaterial:  result?.roof_material?.value,
    solarPanels:   result?.roof_solar_panel_presence?.value,
    imageryDate:   result?.roof_condition_rating?.imagery_date,
  };
}
