import React, { useEffect, useState } from "react";
import {
  X,
  FileDown,
  MessageCircle,
  Mail,
  Link2,
  CheckCircle2,
  Bot,
  Copy,
} from "lucide-react";
import { api } from "../api";
import {
  addonLabel,
  avatarBg,
  formatDate,
  initials,
  inr,
  planLabel,
  statusBadge,
  statusLabel,
  vehicleLabel,
  waMeChatUrl,
  waMeSendUrl,
} from "../format";

export default function QuoteDetail({ quote, onClose, onChanged, onAskAI }) {
  const [busy, setBusy] = useState("");
  const [share, setShare] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [full, setFull] = useState(quote);

  useEffect(() => {
    setFull(quote);
    setShare(null);
    setError("");
    setEmailNotice("");
    if (!quote) return undefined;
    if (quote.breakdown) return undefined;
    let cancelled = false;
    api.quote(quote.quote_id).then((q) => {
      if (!cancelled) setFull(q);
    }).catch((err) => {
      if (!cancelled) setError(err.message);
    });
    return () => { cancelled = true; };
  }, [quote]);

  if (!quote || !full) return null;

  const status = full.effective_status || full.status;
  const breakdown = full.breakdown;
  const canShare = status === "draft" || status === "sent";
  const canConvert = status === "draft" || status === "sent";

  async function run(label, fn) {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function handleShare(channel = "link") {
    if (share?.share_url) return share;
    const result = await run("share", () => api.shareQuote(full.quote_id, channel));
    if (result) {
      setShare(result);
      setFull(result.quote);
      onChanged?.(result.quote);
    }
    return result;
  }

  async function sendWhatsApp() {
    const phone = full.customer?.phone;
    if (!waMeChatUrl(phone)) {
      setError("This customer has no mobile number to open WhatsApp.");
      return;
    }
    const result = share || await handleShare("whatsapp");
    if (!result) return;
    const url = result.whatsapp_url || waMeSendUrl(phone, result.message) || waMeChatUrl(phone);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function sendEmail() {
    const email = (full.customer?.email || "").trim();
    if (!email) {
      setError("This customer has no email address.");
      return;
    }
    const result = await run("email", () => api.sendQuoteEmail(full.quote_id));
    if (!result) return;
    setShare({
      ...(share || {}),
      share_url: result.share_url,
      message: result.message,
      quote: result.quote,
    });
    setFull(result.quote);
    onChanged?.(result.quote);
    setEmailNotice(`Sent from ${result.email_from} to ${result.email_to}`);
  }

  async function handleConvert() {
    const updated = await run("convert", () => api.updateQuoteStatus(full.quote_id, "converted"));
    if (updated) {
      setFull(updated);
      onChanged?.(updated);
    }
  }

  async function copyLink() {
    const url = share?.share_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the link.");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${avatarBg(full.customer?.name)} font-bold text-sm flex items-center justify-center`}>
              {initials(full.customer?.name)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900">{full.display_id}</h3>
              <p className="text-xs text-slate-500">
                {full.customer?.name} · {vehicleLabel(full.vehicle)} · {full.insurer || "—"} · {planLabel(full.plan_tier)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusBadge(status)}`}>
              {statusLabel(status)}
            </span>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 font-bold uppercase tracking-wide">Customer</p>
              <p className="font-semibold text-slate-900 mt-1">{full.customer?.name}</p>
              <p className="text-slate-500">{full.customer?.phone}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 font-bold uppercase tracking-wide">Valid until</p>
              <p className="font-semibold text-slate-900 mt-1">{formatDate(full.valid_until)}</p>
              <p className="text-slate-500">Issued {formatDate(full.created_at)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 font-bold uppercase tracking-wide">Policy provider</p>
              <p className="font-semibold text-slate-900 mt-1">{full.insurer || "—"}</p>
              <p className="text-slate-500">{planLabel(full.plan_tier)} · {full.claim_free_years} claim-free {full.claim_free_years === 1 ? "year" : "years"}</p>
            </div>
          </div>

          {breakdown && (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {full.plan_tier !== "basic" && (
                  <>
                    <tr>
                      <td className="py-2 text-slate-600">IDV</td>
                      <td className="py-2 text-right font-semibold">₹{inr(breakdown.idv)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-600">Own damage</td>
                      <td className="py-2 text-right">₹{inr(breakdown.od_premium)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-600">NCB ({breakdown.ncb_discount_pct}%)</td>
                      <td className="py-2 text-right text-emerald-700">-₹{inr(breakdown.ncb_discount_amount)}</td>
                    </tr>
                  </>
                )}
                <tr>
                  <td className="py-2 text-slate-600">Third-party</td>
                  <td className="py-2 text-right">₹{inr(breakdown.tp_premium)}</td>
                </tr>
                {(breakdown.addon_breakdown || []).map((a) => (
                  <tr key={a.addon_id}>
                    <td className="py-2 text-slate-600">{addonLabel(a.addon_name)}</td>
                    <td className="py-2 text-right">₹{inr(a.price)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold">Net premium</td>
                  <td className="py-2 text-right font-semibold">₹{inr(full.total_premium)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">GST @ 18%</td>
                  <td className="py-2 text-right">₹{inr(full.gst_amount)}</td>
                </tr>
                <tr>
                  <td className="py-2 font-extrabold text-slate-900">Total payable</td>
                  <td className="py-2 text-right font-extrabold text-blue-700 text-base">₹{inr(full.total_payable)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {emailNotice && (
            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              {emailNotice}
            </p>
          )}

          {share && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs space-y-2">
              <p className="font-bold text-emerald-800">Customer document link ready</p>
              <p className="text-slate-600 break-all">{share.share_url}</p>
              {full.customer?.phone && (
                <p className="font-mono text-emerald-800 break-all">{waMeChatUrl(full.customer.phone)}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={sendWhatsApp} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp {full.customer?.phone || ""}
                </button>
                <button onClick={sendEmail} className="px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 font-bold flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Email {full.customer?.email || ""}
                </button>
                <button onClick={copyLink} className="px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 font-bold flex items-center gap-1.5">
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 bg-slate-50">
          {canShare && (
            <>
              <button
                onClick={sendWhatsApp}
                disabled={!!busy}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <MessageCircle className="w-3.5 h-3.5" /> {busy === "share" ? "Opening…" : "WhatsApp"}
              </button>
              <button
                onClick={sendEmail}
                disabled={!!busy}
                className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" /> {busy === "email" ? "Sending…" : "Email"}
              </button>
            </>
          )}
          {canConvert && (
            <button
              onClick={handleConvert}
              disabled={!!busy}
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {busy === "convert" ? "Saving…" : "Mark converted"}
            </button>
          )}
          <a
            href={api.documentUrl(full.quote_id)}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> PDF
          </a>
          {onAskAI && (
            <button
              onClick={() => onAskAI(full)}
              className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center gap-1.5"
            >
              <Bot className="w-3.5 h-3.5" /> Pitch this quote
            </button>
          )}
          {full.share_url && !share && (
            <a href={full.share_url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Customer page
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
