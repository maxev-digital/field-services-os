"use client";
import { useEffect, useState } from "react";
import { Satellite, ChevronDown, ExternalLink, RefreshCw, CheckCircle2, Clock, AlertCircle } from "lucide-react";

const PRODUCTS = [
  { id: 110, name: "Bid Perfect",           price: "$18–49", note: "Instant AI estimate" },
  { id: 1,   name: "Premium Residential",   price: "$30–75", note: "Full measurements, 48hr" },
  { id: 106, name: "Roof Report",           price: "$33–90", note: "Detailed roof report" },
];

interface EvReport {
  id: string; status: string; product_name: string | null;
  ev_order_id: number | null; address: string; pdf_url: string | null;
  created_at: string;
}

interface Props {
  address:     string;
  city?:       string;
  zip?:        string;
  prospectId?: string;
  customerId?: string;
  estimateId?: string;
  compact?:    boolean; // true = collapsed by default
}

export default function EvOrderWidget({ address, city, zip, prospectId, customerId, estimateId, compact = false }: Props) {
  const [open,       setOpen]       = useState(!compact);
  const [report,     setReport]     = useState<EvReport | null | undefined>(undefined); // undefined = loading
  const [productId,  setProductId]  = useState(1);
  const [ordering,   setOrdering]   = useState(false);
  const [error,      setError]      = useState("");

  const entityParam = prospectId ? "prospectId=" + prospectId
    : customerId ? "customerId=" + customerId
    : "address=" + encodeURIComponent(address);

  async function load() {
    try {
      const r = await fetch("/api/admin/ev-order?" + entityParam);
      const d = await r.json();
      setReport(d.report ?? null);
    } catch { setReport(null); }
  }

  useEffect(() => { load(); }, [prospectId, customerId, address]);

  // Auto-poll while ordered/processing
  useEffect(() => {
    if (report?.status !== "ordered" && report?.status !== "processing") return;
    const t = setInterval(load, 45_000);
    return () => clearInterval(t);
  }, [report?.status]);

  async function placeOrder() {
    setOrdering(true); setError("");
    try {
      const r = await fetch("/api/admin/ev-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, city, zip, productId, prospectId, customerId, estimateId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setReport(d.report);
    } catch (e: any) { setError(e.message); }
    finally { setOrdering(false); }
  }

  const statusColor = report?.status === "completed" ? "#22c55e"
    : report?.status === "ordered" || report?.status === "processing" ? "#60a5fa"
    : report?.status === "failed" ? "#f87171" : "#6b7280";

  const statusLabel = report?.status === "completed" ? "Complete"
    : report?.status === "ordered" ? "Ordered — awaiting delivery"
    : report?.status === "processing" ? "Processing"
    : report?.status === "failed" ? "Failed" : "";

  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 10, overflow: "hidden", marginTop: 12 }}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <Satellite size={15} color="#60a5fa" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd", flex: 1 }}>EagleView Report</span>
        {report && (
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, background: statusColor + "22",
            padding: "2px 8px", borderRadius: 20 }}>
            {statusLabel || report.status.toUpperCase()}
          </span>
        )}
        {report === null && (
          <span style={{ fontSize: 11, color: "#4b5563" }}>Not ordered</span>
        )}
        <ChevronDown size={14} color="#4b5563"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }} />
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {report === undefined ? (
            <div style={{ fontSize: 12, color: "#4b5563" }}>Loading...</div>

          ) : report === null ? (
            // ── Order form ──────────────────────────────────────────────
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {PRODUCTS.map(p => (
                  <button key={p.id} onClick={() => setProductId(p.id)}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                      border: "2px solid " + (productId === p.id ? "#ca8a04" : "#1e3a5f"),
                      background: productId === p.id ? "#78350f" : "#1e293b",
                      color: productId === p.id ? "#fbbf24" : "#94a3b8" }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>{p.price}</div>
                    <div style={{ fontSize: 10, marginTop: 1, opacity: 0.6 }}>{p.note}</div>
                  </button>
                ))}
              </div>
              {error && (
                <div style={{ background: "#450a0a", color: "#fca5a5", borderRadius: 6,
                  padding: "8px 10px", fontSize: 12, marginBottom: 8 }}>
                  {error}
                </div>
              )}
              <button onClick={placeOrder} disabled={ordering}
                style={{ background: ordering ? "#374151" : "#b45309", color: "#fff", border: "none",
                  borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13,
                  cursor: ordering ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                {ordering ? <><RefreshCw size={13} className="animate-spin" /> Placing...</> : <><Satellite size={13} /> Order Report</>}
              </button>
            </div>

          ) : (
            // ── Status view ─────────────────────────────────────────────
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                {report.product_name} · Ordered {new Date(report.created_at).toLocaleDateString()}
                {report.ev_order_id && <> · Order #{report.ev_order_id}</>}
              </div>

              {(report.status === "ordered" || report.status === "processing") && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                  color: "#60a5fa", background: "#0c1a2e", borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
                  <Clock size={13} /> Processing — auto-refreshing every 45s
                </div>
              )}

              {report.status === "completed" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                  color: "#22c55e", marginBottom: 10 }}>
                  <CheckCircle2 size={13} /> Report complete
                </div>
              )}

              {report.status === "failed" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                  color: "#f87171", background: "#1c0a0a", borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
                  <AlertCircle size={13} /> Failed — you can re-order below
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {report.pdf_url && (
                  <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
                      color: "#60a5fa", background: "#0c1a2e", padding: "6px 12px", borderRadius: 6,
                      textDecoration: "none" }}>
                    <ExternalLink size={12} /> Download PDF
                  </a>
                )}
                <button onClick={load}
                  style={{ fontSize: 12, color: "#6b7280", background: "#1e293b", border: "none",
                    borderRadius: 6, padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <RefreshCw size={12} /> Check Status
                </button>
                {report.status === "failed" && (
                  <button onClick={() => setReport(null)}
                    style={{ fontSize: 12, color: "#fbbf24", background: "#1e293b", border: "none",
                      borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
                    Re-order
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
