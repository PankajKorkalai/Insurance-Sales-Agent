import React, { useEffect, useState } from "react";
import { api } from "../api";
import { addonLabel, inrCompact } from "../format";

const PERIODS = [
  { key: "month", label: "This month" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

export default function Analytics() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.dashboard(period)
      .then((d) => { if (!cancelled) { setData(d); setError(""); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [period]);

  const mix = data?.plan_mix || {};
  const mixTotal = Object.values(mix).reduce((s, n) => s + n, 0) || 1;
  const attach = data?.addon_attach || [];
  const trend = data?.trend || [];
  const funnel = data?.funnel || { created: 0, sent: 0, converted: 0, expired: 0 };
  const metrics = data?.metrics || {};

  return (
    <div className="page-stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Analytics</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
            Built from saved quotes in Postgres — plan mix, add-on attach, and conversion.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-2 rounded-xl text-sm font-bold ${period === p.key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>}

      <div className="metrics-grid">
        {[
          ["Created", funnel.created],
          ["Sent", funnel.sent],
          ["Converted", funnel.converted],
          ["Expired", funnel.expired],
        ].map(([label, n]) => (
          <div key={label} className="panel">
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{n ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="bottom-grid">
        <div className="panel">
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Plan mix</h3>
          {Object.keys(mix).length === 0 && <p style={{ color: "#94a3b8" }}>No quotes in this period.</p>}
          {Object.entries(mix).map(([tier, n]) => (
            <div key={tier} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                <span style={{ textTransform: "capitalize" }}>{tier}</span>
                <span>{n} · {Math.round((n / mixTotal) * 100)}%</span>
              </div>
              <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99 }}>
                <div style={{ width: `${(n / mixTotal) * 100}%`, height: "100%", background: "#2563eb", borderRadius: 99 }} />
              </div>
            </div>
          ))}
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 16 }}>
            Premium won {inrCompact(metrics.premium_converted?.value || 0)} · conversion {metrics.conversion_rate ?? 0}%
          </p>
        </div>

        <div className="panel">
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Add-on attach rate</h3>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Share of comprehensive quotes that included each add-on.</p>
          {attach.length === 0 && <p style={{ color: "#94a3b8" }}>No add-ons sold in this period.</p>}
          {attach.map((row) => (
            <div key={row.addon_name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, fontSize: 13 }}>
              <div style={{ width: 180, fontWeight: 600 }}>{row.label || addonLabel(row.addon_name)}</div>
              <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 99 }}>
                <div style={{ width: `${Math.min(100, row.attach_rate)}%`, height: "100%", background: "#10b981", borderRadius: 99 }} />
              </div>
              <span style={{ width: 72, textAlign: "right", fontWeight: 700 }}>{row.attach_rate}% · {row.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Activity over time</h3>
        <div className="chart-row" style={{ height: 160 }}>
          {trend.map((item, idx) => {
            const max = Math.max(1, ...trend.flatMap((r) => [r.created, r.sent, r.converted]));
            return (
              <div key={`${item.label}-${idx}`} className="chart-group">
                <div className="chart-bars">
                  <div className="chart-bar" style={{ height: `${(item.created / max) * 100}%`, background: "#2563eb" }} />
                  <div className="chart-bar" style={{ height: `${(item.sent / max) * 100}%`, background: "#38bdf8" }} />
                  <div className="chart-bar" style={{ height: `${(item.converted / max) * 100}%`, background: "#10b981" }} />
                </div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 8 }}>{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
