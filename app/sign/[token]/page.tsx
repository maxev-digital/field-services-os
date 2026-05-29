"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

const fmt = (n: number) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function SignPage() {
  const params        = useParams<{ token: string }>();
  const token         = params.token;
  const searchParams  = useSearchParams();
  const estimateId    = searchParams.get("est") || "";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing,      setDrawing]      = useState(false);
  const [hasSig,       setHasSig]       = useState(false);
  const [signerName,   setSignerName]   = useState("");
  const [estimate,     setEstimate]     = useState<any>(null);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [done,         setDone]         = useState(false);
  const [alreadySigned,setAlreadySigned]= useState(false);

  useEffect(() => {
    if (!token || !estimateId) { setError("Invalid link."); setLoading(false); return; }
    fetch("/api/sign/" + token + "?est=" + estimateId)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        if (d.already_signed) { setAlreadySigned(true); return; }
        setEstimate(d.estimate);
      })
      .catch(() => setError("Failed to load estimate."))
      .finally(() => setLoading(false));
  }, [token, estimateId]);

  function getPos(e: any, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: any) {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    setDrawing(true); e.preventDefault();
  }

  function draw(e: any) {
    if (!drawing) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#1a3a5c";
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    setHasSig(true); e.preventDefault();
  }

  function endDraw() { setDrawing(false); }

  function clearSig() {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  async function submit() {
    if (!hasSig || !signerName.trim()) return;
    const canvas = canvasRef.current; if (!canvas) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/sign/" + token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimateId, signatureDataUrl: canvas.toDataURL("image/png"), signerName: signerName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500 text-lg">Loading your estimate...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md text-center shadow-lg">
        <div className="text-4xl mb-4">Warning</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Link Problem</h1>
        <p className="text-gray-600">{error}</p>
        <p className="text-sm text-gray-400 mt-4">Call us: (214) 795-3905</p>
      </div>
    </div>
  );

  if (alreadySigned) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-green-200 p-8 max-w-md text-center shadow-lg">
        <div className="text-5xl mb-4">Signed</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Already Signed</h1>
        <p className="text-gray-600">We have your signature on file. Our team will be in touch soon.</p>
        <p className="text-sm text-gray-400 mt-4">Questions? (214) 795-3905</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-green-200 p-8 max-w-md text-center shadow-lg">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Estimate Signed!</h1>
        <p className="text-gray-600 mb-2">Thank you, {signerName}. Your estimate has been approved and our team will reach out shortly to schedule your job.</p>
        <p className="text-sm text-gray-400">Questions? Call or text (214) 795-3905</p>
        <div className="mt-6 p-4 bg-blue-50 rounded-xl text-sm text-blue-700">
          Roof Works of Texas &middot; Licensed &amp; Insured
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-[#1a3a5c] rounded-2xl p-6 text-white">
          <h1 className="text-2xl font-bold">Review &amp; Sign Your Estimate</h1>
          <p className="text-blue-200 text-sm mt-1">Roof Works of Texas &middot; Licensed &amp; Insured</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Estimate Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Property</span>
              <span className="font-medium text-sm text-right">{estimate?.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Customer</span>
              <span className="font-medium text-sm">{estimate?.customer_name}</span>
            </div>
            {estimate?.insurance_total > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Insurance RCV</span>
                <span className="font-medium text-sm">{fmt(estimate.insurance_total)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 mt-3">
              <span className="font-bold text-gray-800">Our Total</span>
              <span className="font-bold text-2xl text-green-600">{fmt(estimate?.our_total)}</span>
            </div>
          </div>
        </div>

        {estimate?.line_items?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Scope of Work</h2>
            <div className="space-y-3">
              {estimate.line_items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.description}</span>
                  <span className="text-gray-600 font-medium">{fmt(item.line_total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-800">
          <p className="font-semibold mb-1">Authorization</p>
          <p>By signing below, I authorize Roof Works of Texas to perform the roofing work described above at the stated price. I acknowledge that I have reviewed and agree to the scope of work.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Your Signature</h2>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Full Name *</label>
            <input type="text" value={signerName} onChange={e => setSignerName(e.target.value)}
              placeholder="Type your full name"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-600">Draw your signature *</label>
              <button onClick={clearSig} className="text-xs text-red-500 hover:text-red-700">Clear</button>
            </div>
            <canvas ref={canvasRef} width={560} height={160}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 cursor-crosshair touch-none"
              style={{ touchAction: "none" }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
            {!hasSig && <p className="text-xs text-gray-400 mt-1 text-center">Sign with mouse or finger above</p>}
          </div>
          <button onClick={submit} disabled={!hasSig || !signerName.trim() || submitting}
            className="w-full bg-[#dc2626] hover:bg-red-700 disabled:opacity-40 text-white font-bold py-4 rounded-xl text-lg transition-colors">
            {submitting ? "Submitting..." : "Approve & Sign Estimate"}
          </button>
          <p className="text-xs text-gray-400 text-center">Secure &middot; No account required &middot; Legally binding</p>
        </div>

        <div className="text-center text-xs text-gray-400 pb-6">
          Roof Works of Texas &middot; (214) 795-3905 &middot; roofworksoftexas.com
        </div>
      </div>
    </div>
  );
}
