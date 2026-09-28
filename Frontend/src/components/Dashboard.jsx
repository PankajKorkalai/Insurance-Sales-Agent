import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Bot,
  FileText,
  Send,
  CheckCircle2,
  IndianRupee,
  ChevronDown,
  ArrowUpRight,
  UserPlus,
  Layers,
  Sparkles,
  FileDown,
  ChevronRight,
  Car,
  Calendar,
} from "lucide-react";
import { api } from "../api";
import {
  activityDot,
  avatarBg,
  formatDate,
  greeting,
  initials,
  inr,
  inrCompact,
  pct,
  statusBadge,
  statusLabel,
  timeAgo,
  vehicleLabel,
} from "../format";

const PERIODS = [
  { key: "month", label: "This Month" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

function MetricCard({ icon: Icon, iconBg, iconColor, label, metric, money }) {
  const value = metric?.value ?? 0;
  const change = metric?.change_pct;
  const display = money ? inrCompact(value) : Number(value).toLocaleString("en-IN");
  const up = change == null || change >= 0;
  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 140 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon className="w-5 h-5" />
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>{display}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{label}</div>
        {change == null ? (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>No prior period</div>
        ) : (
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: up ? "#059669" : "#e11d48" }}>
            {pct(change)} <span style={{ fontWeight: 400, color: "#94a3b8" }}>from previous period</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({
  onNewQuote,
  onOpenAI,
  onViewQuote,
  onAddCustomer,
  onViewQuotes,
  period,
  onPeriodChange,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null);
  const [periodOpen, setPeriodOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .dashboard(period)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const trend = data?.trend || [];
  const trendMax = useMemo(
    () => Math.max(1, ...trend.flatMap((r) => [r.created, r.sent, r.converted])),
    [trend],
  );
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || "This Month";
  const funnel = data?.funnel || { created: 0, sent: 0, converted: 0 };
  const created = funnel.created || 0;
  const metrics = data?.metrics || {};
  const topVehicles = data?.top_vehicles || [];
  const maxVehicle = Math.max(1, ...topVehicles.map((v) => v.count));

  return (
    <div className="page-stack">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: 0 }}>
            {greeting()}
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "6px 0 0" }}>
            {data?.period?.label || "This month"} · {metrics.open_quotes ?? 0} open quotes
            {metrics.expiring_soon ? ` · ${metrics.expiring_soon} expiring within 7 days` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onNewQuote} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Quote
          </button>
          <button onClick={onOpenAI} className="px-4 py-2.5 bg-blue-50 text-blue-700 font-semibold text-sm rounded-xl border border-blue-200 flex items-center gap-2">
            <Bot className="w-4 h-4" /> Ask Insurance AI
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => setPeriodOpen((o) => !o)} className="px-3 py-2.5 bg-white text-slate-600 font-medium text-sm rounded-xl border border-slate-200 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {periodLabel} <ChevronDown className="w-4 h-4" />
            </button>
            {periodOpen && (
              <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { onPeriodChange(p.key); setPeriodOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm ${p.key === period ? "text-blue-700 font-semibold bg-blue-50" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
          Could not load dashboard: {error}. Start the quote engine on port 8000.
        </p>
      )}

      <div className="metrics-grid">
        <MetricCard icon={FileText} iconBg="#eff6ff" iconColor="#2563eb" label="Quotes Created" metric={metrics.quotes_created} />
        <MetricCard icon={Send} iconBg="#ecfdf5" iconColor="#059669" label="Quotes Sent" metric={metrics.quotes_sent} />
        <MetricCard icon={CheckCircle2} iconBg="#f5f3ff" iconColor="#7c3aed" label="Quotes Converted" metric={metrics.quotes_converted} />
        <MetricCard icon={IndianRupee} iconBg="#fff7ed" iconColor="#d97706" label="Premium Generated" metric={metrics.premium_converted} money />
      </div>

      <div className="mid-grid">
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Quotes Overview</h3>
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#475569", fontWeight: 600 }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: "#2563eb", marginRight: 6 }} />Created</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: "#38bdf8", marginRight: 6 }} />Sent</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: "#10b981", marginRight: 6 }} />Converted</span>
            </div>
          </div>
          {loading && <p style={{ color: "#94a3b8", fontSize: 14 }}>Loading…</p>}
          {!loading && trend.length === 0 && <p style={{ color: "#94a3b8", fontSize: 14 }}>No quotes in this period.</p>}
          {trend.length > 0 && (
            <div className="chart-row">
              {trend.map((item, idx) => (
                <div
                  key={`${item.label}-${idx}`}
                  className="chart-group"
                  onMouseEnter={() => setHoveredBarIndex(idx)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                  style={{ position: "relative" }}
                >
                  {hoveredBarIndex === idx && (
                    <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", background: "#0f172a", color: "#fff", fontSize: 11, padding: "8px 10px", borderRadius: 8, whiteSpace: "nowrap", zIndex: 5, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700 }}>{item.label}</div>
                      <div>Created {item.created} · Sent {item.sent} · Converted {item.converted}</div>
                    </div>
                  )}
                  <div className="chart-bars">
                    <div className="chart-bar" style={{ height: `${(item.created / trendMax) * 100}%`, background: "#2563eb" }} />
                    <div className="chart-bar" style={{ height: `${(item.sent / trendMax) * 100}%`, background: "#38bdf8" }} />
                    <div className="chart-bar" style={{ height: `${(item.converted / trendMax) * 100}%`, background: "#10b981" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 8, whiteSpace: "nowrap" }}>{item.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Conversion Funnel</h3>
          {[
            { n: funnel.created, label: "Quotes Created", bg: "#2563eb", pct: 100 },
            { n: funnel.sent, label: "Quotes Sent", bg: "#38bdf8", pct: created ? Math.round((funnel.sent / created) * 100) : 0 },
            { n: funnel.converted, label: "Converted", bg: "#10b981", pct: created ? Math.round((funnel.converted / created) * 100) : 0 },
          ].map((row, i) => (
            <div key={row.label} style={{ background: row.bg, color: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, marginLeft: i * 12, marginRight: i * 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{row.n}</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{row.label}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.2)", padding: "4px 8px", borderRadius: 6 }}>{row.pct}%</span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "8px 0 0" }}>
            Conversion rate {metrics.conversion_rate ?? 0}% of quotes created in this period.
          </p>
        </div>

        <div className="panel">
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Top Vehicle Models</h3>
          {topVehicles.length === 0 && <p style={{ color: "#94a3b8", fontSize: 14 }}>No quotes yet.</p>}
          {topVehicles.map((car) => (
            <div key={car.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Car className="w-3.5 h-3.5 text-slate-600" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{car.name}</div>
                <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, marginTop: 4 }}>
                  <div style={{ width: `${(car.count / maxVehicle) * 100}%`, height: "100%", background: "#2563eb", borderRadius: 99 }} />
                </div>
              </div>
              <span style={{ fontWeight: 700 }}>{car.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bottom-grid">
        <div className="panel" style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recent Quotes</h3>
            <button onClick={onViewQuotes} className="text-xs font-bold text-blue-600 flex items-center gap-1">
              View All <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
            <thead>
              <tr style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase" }}>
                <th style={{ padding: "8px 8px 12px 0" }}>Customer</th>
                <th style={{ padding: "8px" }}>Vehicle</th>
                <th style={{ padding: "8px" }}>Premium</th>
                <th style={{ padding: "8px" }}>Status</th>
                <th style={{ padding: "8px" }}>Created</th>
                <th style={{ padding: "8px 0 12px 8px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent_quotes || []).map((quote) => (
                <tr key={quote.quote_id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 8px 12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className={`w-7 h-7 rounded-full ${avatarBg(quote.customer?.name)} font-bold text-[11px] flex items-center justify-center`}>
                        {initials(quote.customer?.name)}
                      </div>
                      <span style={{ fontWeight: 700 }}>{quote.customer?.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: 8 }}>{vehicleLabel(quote.vehicle)}<div style={{ color: "#64748b", fontSize: 11 }}>{quote.insurer || ""}</div></td>
                  <td style={{ padding: 8, fontWeight: 700 }}>₹{inr(quote.total_payable)}</td>
                  <td style={{ padding: 8 }}>
                    <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusBadge(quote.effective_status)}`}>
                      {statusLabel(quote.effective_status)}
                    </span>
                  </td>
                  <td style={{ padding: 8, color: "#64748b" }}>{formatDate(quote.created_at)}</td>
                  <td style={{ padding: "12px 0 12px 8px", textAlign: "right" }}>
                    <button onClick={() => onViewQuote(quote)} className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-[11px]">
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !(data?.recent_quotes || []).length && (
                <tr><td colSpan="6" style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>No quotes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel">
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>Quick Actions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { label: "New Quote", onClick: onNewQuote, bg: "#eff6ff", iconBg: "#2563eb", Icon: FileText },
                { label: "Add Customer", onClick: onAddCustomer, bg: "#ecfdf5", iconBg: "#059669", Icon: UserPlus },
                { label: "View Quotes", onClick: onViewQuotes, bg: "#f5f3ff", iconBg: "#7c3aed", Icon: Layers },
                { label: "Ask AI", onClick: onOpenAI, bg: "#eff6ff", iconBg: "#2563eb", Icon: Bot },
                { label: "Compare Plans", onClick: onNewQuote, bg: "#eef2ff", iconBg: "#4f46e5", Icon: Sparkles },
                { label: "Quotes PDF", onClick: onViewQuotes, bg: "#fff1f2", iconBg: "#e11d48", Icon: FileDown },
              ].map((a) => (
                <button key={a.label} onClick={a.onClick} style={{ background: a.bg, border: "none", borderRadius: 12, padding: 12, textAlign: "left", cursor: "pointer" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: a.iconBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                    <a.Icon className="w-4 h-4" />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", display: "flex", justifyContent: "space-between" }}>
                    {a.label} <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>Recent Activity</h3>
            {(data?.recent_activity || []).map((act, i) => (
              <div key={`${act.at}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <span className={`w-2 h-2 rounded-full ${activityDot(act.kind)}`} style={{ marginTop: 6, flexShrink: 0 }} />
                  <span style={{ color: "#1e293b", fontWeight: 500 }}>{act.text}</span>
                </div>
                <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>{timeAgo(act.at)}</span>
              </div>
            ))}
            {!loading && !(data?.recent_activity || []).length && (
              <p style={{ color: "#94a3b8", fontSize: 14 }}>Activity appears as quotes are created and sent.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
