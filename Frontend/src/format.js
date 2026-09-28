const ADDON_LABELS = {
  zero_depreciation: "Zero Depreciation",
  roadside_assistance: "24x7 Roadside Assistance",
  engine_protection: "Engine Protection",
  consumables_cover: "Consumables Cover",
  return_to_invoice: "Return to Invoice",
  key_replacement: "Key Replacement",
};

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
  "bg-cyan-100 text-cyan-700",
  "bg-teal-100 text-teal-700",
];

const STATUS_BADGE = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  converted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  expired: "bg-amber-100 text-amber-800 border-amber-200",
};

const ACTIVITY_DOT = {
  created: "bg-blue-500",
  sent: "bg-sky-500",
  converted: "bg-emerald-500",
  customer: "bg-purple-500",
};

export function addonLabel(name) {
  return ADDON_LABELS[name] || String(name || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function inr(value) {
  const n = Number(value || 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function inrWhole(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function inrCompact(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${inrWhole(n)}`;
}

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export function avatarBg(name) {
  const s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i) * (i + 1)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

export function statusBadge(status) {
  const key = String(status || "").toLowerCase();
  return STATUS_BADGE[key] || STATUS_BADGE.draft;
}

export function statusLabel(status) {
  const key = String(status || "").toLowerCase();
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Draft";
}

export function activityDot(kind) {
  return ACTIVITY_DOT[kind] || "bg-slate-400";
}

export function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(iso);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function vehicleLabel(v) {
  if (!v) return "-";
  if (typeof v === "string") return v;
  return `${v.make} ${v.model} ${v.year}`.trim();
}

export function planLabel(tier) {
  if (tier === "basic") return "Basic";
  if (tier === "premium") return "Premium";
  return "Standard";
}

export function waMeNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("91") && digits.length >= 12) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length >= 10) return `91${digits.slice(-10)}`;
  return digits;
}

export function waMeChatUrl(phone) {
  const wa = waMeNumber(phone);
  return wa ? `https://wa.me/${wa}` : "";
}

export function waMeSendUrl(phone, text) {
  const base = waMeChatUrl(phone);
  if (!base) return "";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function mailtoUrl(email, subject, body) {
  const to = String(email || "").trim();
  if (!to) return "";
  const parts = [];
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  return parts.length ? `mailto:${to}?${parts.join("&")}` : `mailto:${to}`;
}

export function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0 ? "↑ " : n < 0 ? "↓ " : "";
  return `${sign}${Math.abs(n).toFixed(n % 1 === 0 ? 0 : 1)}%`;
}
