import React, { useEffect, useState } from "react";
import { api } from "../api";
import { addonLabel, inr } from "../format";

export default function Settings() {
  const [vehicles, setVehicles] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [rates, setRates] = useState([]);
  const [cities, setCities] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.vehicles(), api.addonPolicies(), api.rateCard(), api.cities()])
      .then(([v, p, r, c]) => {
        setVehicles(v);
        setPolicies(p);
        setRates(r);
        setCities(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page-stack">
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Reference data</h1>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
          Per-insurer rate cards and add-on policies from Postgres. Changing the policy provider on a quote loads that insurer's rows.
        </p>
      </div>
      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>}

      <div className="panel">
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Insurer add-on policies ({policies.length})</h3>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 8px 8px 0" }}>Insurer</th>
              <th style={{ padding: 8 }}>Add-on</th>
              <th style={{ padding: 8 }}>Price rule</th>
              <th style={{ padding: 8 }}>Max age</th>
              <th style={{ padding: 8 }}>Min NCB years</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((a) => (
              <tr key={a.policy_id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 8px 10px 0", fontWeight: 700 }}>{a.insurer}</td>
                <td style={{ padding: 8 }}>{addonLabel(a.addon_name)}</td>
                <td style={{ padding: 8, fontFamily: "ui-monospace, monospace" }}>{a.price_rule}</td>
                <td style={{ padding: 8 }}>{a.max_vehicle_age_months == null ? "—" : `${a.max_vehicle_age_months} mo`}</td>
                <td style={{ padding: 8 }}>{a.min_claim_free_years}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Rate card ({rates.length})</h3>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 8px 8px 0" }}>Insurer</th>
              <th style={{ padding: 8 }}>Zone</th>
              <th style={{ padding: 8 }}>CC band</th>
              <th style={{ padding: 8 }}>OD rate %</th>
              <th style={{ padding: 8 }}>TP premium</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.rate_id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 8px 10px 0", fontWeight: 700 }}>{r.insurer}</td>
                <td style={{ padding: 8 }}>{r.city_zone}</td>
                <td style={{ padding: 8 }}>{r.cc_band}</td>
                <td style={{ padding: 8 }}>{r.od_rate_pct}</td>
                <td style={{ padding: 8, fontWeight: 700 }}>₹{inr(r.tp_premium_flat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Known cities ({cities.length})</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {cities.map((c) => (
            <span key={c.city} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
              {c.city} · {c.city_zone.replaceAll("_", " ")}{c.flood_prone ? " · flood-prone" : ""}
            </span>
          ))}
        </div>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Vehicle master ({vehicles.length})</h3>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 8px 8px 0" }}>Make / model</th>
              <th style={{ padding: 8 }}>Year</th>
              <th style={{ padding: 8 }}>Fuel</th>
              <th style={{ padding: 8 }}>CC</th>
              <th style={{ padding: 8 }}>Ex-showroom</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.vehicle_id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 8px 10px 0", fontWeight: 700 }}>{v.make} {v.model}</td>
                <td style={{ padding: 8 }}>{v.year}</td>
                <td style={{ padding: 8 }}>{v.fuel_type}</td>
                <td style={{ padding: 8 }}>{v.engine_cc}</td>
                <td style={{ padding: 8 }}>₹{inr(v.ex_showroom_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
