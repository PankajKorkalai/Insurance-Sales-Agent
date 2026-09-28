/** JSON client for the quote engine. In Vite, /api is proxied to FastAPI. */

const BASE = "/api";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function flattenDetail(detail) {
  if (detail == null) return "Request failed";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        const loc = Array.isArray(item.loc) ? item.loc.filter((p) => p !== "body").join(".") : "";
        return loc ? `${loc}: ${item.msg}` : item.msg || JSON.stringify(item);
      })
      .join("; ");
  }
  return JSON.stringify(detail);
}

async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const payload = await res.json();
      detail = flattenDetail(payload.detail ?? payload);
    } catch {
      /* ignore non-JSON errors */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  health: () => request("/health"),
  cities: () => request("/cities"),
  vehicles: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, v);
    });
    const qs = q.toString();
    return request(`/vehicles${qs ? `?${qs}` : ""}`);
  },
  addons: () => request("/addons"),
  insurers: () => request("/insurers"),
  rateCard: (insurer) => {
    const q = insurer ? `?insurer=${encodeURIComponent(insurer)}` : "";
    return request(`/rate-card${q}`);
  },
  addonPolicies: (insurer) => {
    const q = insurer ? `?insurer=${encodeURIComponent(insurer)}` : "";
    return request(`/addon-policies${q}`);
  },
  addonOptions: (body) => request("/addons/options", { method: "POST", body }),
  addonMarket: (body) => request("/addons/market", { method: "POST", body }),
  adviseAddons: (body) => request("/advisor/addons", { method: "POST", body }),
  calculatePlans: (body) => request("/quotes/calculate", { method: "POST", body }),
  compareInsurers: (body) => request("/quotes/compare-insurers", { method: "POST", body }),
  createQuote: (body) => request("/quotes", { method: "POST", body }),
  quotes: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, v);
    });
    const qs = q.toString();
    return request(`/quotes${qs ? `?${qs}` : ""}`);
  },
  quote: (id) => request(`/quotes/${id}`),
  updateQuoteStatus: (id, status) =>
    request(`/quotes/${id}/status`, { method: "PATCH", body: { status } }),
  shareQuote: (id, channel = "link") =>
    request(`/quotes/${id}/share`, { method: "POST", body: { channel } }),
  sendQuoteEmail: (id) =>
    request(`/quotes/${id}/send-email`, { method: "POST" }),
  documentUrl: (id) => `${BASE}/quotes/${id}/document`,
  customers: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, v);
    });
    const qs = q.toString();
    return request(`/customers${qs ? `?${qs}` : ""}`);
  },
  customer: (id) => request(`/customers/${id}`),
  createCustomer: (body) => request("/customers", { method: "POST", body }),
  dashboard: (period = "month") => request(`/dashboard?period=${period}`),
  assistantStatus: () => request("/assistant/status"),
  askAssistant: (body) => request("/assistant/ask", { method: "POST", body }),
};
