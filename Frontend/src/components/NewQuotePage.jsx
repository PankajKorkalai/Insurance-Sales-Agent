import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Car,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
  CheckCircle2,
  Download,
  MessageCircle,
  Mail as MailIcon,
  Check,
  ArrowLeft,
  Plus,
  Search,
  Eye,
  FilePlus,
  Bot,
} from "lucide-react";
import { api } from "../api";
import {
  addonLabel,
  avatarBg,
  formatDate,
  initials,
  inr,
  inrWhole,
  mailtoUrl,
  planLabel,
  statusBadge,
  statusLabel,
  vehicleLabel,
  waMeChatUrl,
  waMeNumber,
  waMeSendUrl,
} from "../format";

const STEPS = [
  { num: 1, label: "Customer" },
  { num: 2, label: "Vehicle" },
  { num: 3, label: "Coverage" },
  { num: 4, label: "Compare plans" },
  { num: 5, label: "Policy document" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => CURRENT_YEAR + 1 - i);
const FUEL_OPTIONS = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "cng", label: "CNG" },
  { value: "electric", label: "Electric" },
];
const BASE_CC = [
  0, 598, 796, 799, 814, 998, 999, 1086, 1197, 1198, 1199, 1248, 1330, 1368, 1373,
  1451, 1462, 1482, 1493, 1496, 1497, 1498, 1582, 1591, 1598, 1798, 1956, 1968,
  1984, 1991, 1995, 1997, 1998, 1999, 2143, 2157, 2184, 2198, 2393, 2487, 2494,
  2694, 2755, 2925, 2993, 2998, 3198, 3996,
];

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  city: "",
  existingId: null,
  vehicleId: null,
  engineCc: "",
  exShowroom: "",
  claimFreeYears: 0,
  insurer: "HDFC ERGO",
  registrationDate: "",
  selectedAddonIds: [],
  planTier: "premium",
};

export default function NewQuotePage({
  onBackToDashboard,
  onViewQuote,
  onAskAI,
  startCustomer,
  startWizard,
  initialSearch = "",
}) {
  const [isCreatingQuote, setIsCreatingQuote] = useState(!!startWizard);
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState("All");
  const [quotesList, setQuotesList] = useState([]);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);

  const [cities, setCities] = useState([]);
  const [insurers, setInsurers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [fuel, setFuel] = useState("");

  const [addonOptions, setAddonOptions] = useState([]);
  const [addonMeta, setAddonMeta] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [plans, setPlans] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [share, setShare] = useState(null);
  const [emailNotice, setEmailNotice] = useState("");

  const loadQuotes = useCallback(async () => {
    setListLoading(true);
    try {
      const params = { limit: 200 };
      if (statusFilter !== "All") params.status = statusFilter.toLowerCase();
      if (searchQuery.trim()) params.q = searchQuery.trim();
      setQuotesList(await api.quotes(params));
      setListError("");
    } catch (err) {
      setListError(err.message);
    } finally {
      setListLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  useEffect(() => {
    Promise.all([api.cities(), api.insurers(), api.vehicles(), api.customers({ limit: 200 })])
      .then(([c, ins, v, cu]) => {
        setCities(c);
        setInsurers(ins);
        setVehicles(v);
        setCustomers(cu);
        setForm((f) => ({
          ...f,
          city: f.city || c[0]?.city || "",
          insurer: f.insurer || ins[0] || "HDFC ERGO",
        }));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!startCustomer) return;
    setForm((f) => ({
      ...f,
      name: startCustomer.name || "",
      phone: startCustomer.phone || "",
      email: startCustomer.email || "",
      city: startCustomer.city || "",
      existingId: startCustomer.customer_id,
      vehicleId: startCustomer.preferred_vehicle_id || f.vehicleId,
    }));
    setIsCreatingQuote(true);
  }, [startCustomer]);

  useEffect(() => {
    if (!vehicles.length || !form.vehicleId || form.engineCc !== "") return;
    const v = vehicles.find((row) => row.vehicle_id === form.vehicleId);
    if (v) applyCatalog(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, form.vehicleId]);

  const makes = useMemo(() => [...new Set(vehicles.map((v) => v.make))].sort(), [vehicles]);
  const models = useMemo(
    () => [...new Set(vehicles.filter((v) => !make || v.make === make).map((v) => v.model))].sort(),
    [vehicles, make],
  );
  const ccOptions = useMemo(() => {
    const fromDb = vehicles.map((v) => v.engine_cc);
    const extra = form.engineCc === "" ? [] : [Number(form.engineCc)];
    return [...new Set([...BASE_CC, ...fromDb, ...extra.filter((n) => !Number.isNaN(n))])].sort((a, b) => a - b);
  }, [vehicles, form.engineCc]);

  const currentVehicle = useMemo(
    () => vehicles.find((v) => v.vehicle_id === form.vehicleId) || null,
    [vehicles, form.vehicleId],
  );

  function applyCatalog(v) {
    if (!v) {
      setForm((f) => ({ ...f, vehicleId: null, engineCc: "", exShowroom: "" }));
      return;
    }
    setYear(String(v.year));
    setFuel(v.fuel_type);
    setForm((f) => ({
      ...f,
      vehicleId: v.vehicle_id,
      engineCc: String(v.engine_cc),
      exShowroom: String(Math.round(Number(v.ex_showroom_price))),
    }));
  }

  function catalogFor(nextMake, nextModel) {
    const rows = vehicles.filter((v) => v.make === nextMake && v.model === nextModel);
    if (!rows.length) return null;
    return [...rows].sort((a, b) => b.year - a.year)[0];
  }

  function pricingFields() {
    const price = Number(String(form.exShowroom).replace(/,/g, ""));
    return {
      engine_cc: form.engineCc === "" ? undefined : Number(form.engineCc),
      ex_showroom_price: Number.isFinite(price) && price > 0 ? price : undefined,
      year: year ? Number(year) : undefined,
      fuel_type: fuel || undefined,
    };
  }

  function coveragePayload(overrides = {}) {
    return {
      vehicle_id: form.vehicleId,
      city: form.city,
      registration_date: form.registrationDate || null,
      claim_free_years: Number(overrides.claimFreeYears ?? form.claimFreeYears),
      insurer: overrides.insurer ?? form.insurer,
      ...pricingFields(),
    };
  }

  function startBlank() {
    setForm({
      ...emptyForm,
      city: cities[0]?.city || "",
      insurer: insurers[0] || "HDFC ERGO",
    });
    setMake("");
    setModel("");
    setYear("");
    setFuel("");
    setAddonOptions([]);
    setAdvice(null);
    setPlans(null);
    setComparison(null);
    setSaved(null);
    setShare(null);
    setEmailNotice("");
    setError("");
    setStep(1);
    setIsCreatingQuote(true);
  }

  function startForQuote(q) {
    setForm({
      ...emptyForm,
      name: q.customer?.name || "",
      phone: q.customer?.phone || "",
      email: q.customer?.email || "",
      city: q.city || q.customer?.city || "",
      existingId: q.customer_id,
      vehicleId: q.vehicle_id,
      engineCc: q.vehicle ? String(q.vehicle.engine_cc) : "",
      exShowroom: q.vehicle ? String(Math.round(Number(q.vehicle.ex_showroom_price))) : "",
      claimFreeYears: q.claim_free_years ?? 0,
      insurer: q.insurer || insurers[0] || "HDFC ERGO",
    });
    if (q.vehicle) {
      setMake(q.vehicle.make);
      setModel(q.vehicle.model);
      setYear(String(q.vehicle.year));
      setFuel(q.vehicle.fuel_type);
    }
    setStep(1);
    setSaved(null);
    setShare(null);
    setEmailNotice("");
    setIsCreatingQuote(true);
  }

  async function lookupPhone(phone) {
    if (!/^(\+91[\s-]?)?[6-9]\d{9}$/.test(phone)) return;
    try {
      const found = await api.customers({ phone });
      const match = found[0];
      if (match) {
        setForm((f) => ({
          ...f,
          existingId: match.customer_id,
          name: match.name,
          email: match.email || f.email,
          city: match.city || f.city,
        }));
      } else {
        setForm((f) => ({ ...f, existingId: null }));
      }
    } catch {
      /* ignore lookup errors */
    }
  }

  async function loadCoverage() {
    if (!form.vehicleId) {
      setError("Select a vehicle first.");
      return false;
    }
    setBusy("coverage");
    setError("");
    try {
      const opts = await api.addonMarket(coveragePayload());
      setAddonMeta(opts);
      setAddonOptions(opts.options);
      const recommended = opts.options.filter((o) => o.recommended && o.available).map((o) => o.addon_id);
      setForm((f) => ({ ...f, selectedAddonIds: recommended }));
      setAdvice(null);
      setStep(3);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function refreshSuggestedAddons(claimFreeYears) {
    if (!form.vehicleId) return;
    setBusy("coverage");
    setError("");
    try {
      const opts = await api.addonMarket(coveragePayload({ claimFreeYears }));
      setAddonMeta(opts);
      setAddonOptions(opts.options);
      const recommended = opts.options.filter((o) => o.recommended && o.available).map((o) => o.addon_id);
      setForm((f) => ({ ...f, selectedAddonIds: recommended }));
      setAdvice(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function onClaimFreeYearsChange(years) {
    setForm((f) => ({ ...f, claimFreeYears: years }));
    refreshSuggestedAddons(years);
  }

  async function loadComparison() {
    setBusy("plans");
    setError("");
    try {
      const result = await api.compareInsurers({
        ...coveragePayload(),
        selected_addon_ids: form.selectedAddonIds,
      });
      setComparison(result);
      const lowest = result.providers.find((p) => p.is_lowest) || result.providers[0];
      if (lowest) {
        setForm((f) => ({ ...f, insurer: lowest.insurer, planTier: "premium" }));
      }
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function loadAdvice() {
    setBusy("advice");
    setError("");
    try {
      const result = await api.adviseAddons(coveragePayload());
      setAdvice(result);
      setForm((f) => ({ ...f, selectedAddonIds: result.recommendations.map((r) => r.addon_id) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function saveQuote() {
    setBusy("save");
    setError("");
    try {
      const payload = {
        ...coveragePayload(),
        plan_tier: form.planTier,
        selected_addon_ids: form.planTier === "premium" ? offerAddons() : null,
      };
      if (form.existingId) payload.existing_customer_id = form.existingId;
      else {
        payload.customer = {
          name: form.name,
          phone: form.phone,
          email: form.email || null,
          city: form.city,
        };
      }
      const quote = await api.createQuote(payload);
      let shared = null;
      try {
        shared = await api.shareQuote(quote.quote_id);
      } catch {
        shared = null;
      }
      setSaved(shared?.quote || quote);
      setShare(shared);
      setStep(5);
      loadQuotes();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function customerPhone() {
    return (form.phone || saved?.customer?.phone || "").trim();
  }

  function customerEmail() {
    return (form.email || saved?.customer?.email || "").trim();
  }

  async function ensureShare(channel = "link") {
    if (share?.share_url) return share;
    const result = await api.shareQuote(saved.quote_id, channel);
    setShare(result);
    setSaved(result.quote);
    loadQuotes();
    return result;
  }

  function shareLinks(shared) {
    const phone = customerPhone();
    const email = customerEmail();
    const wa = waMeNumber(phone);
    const docLink = shared?.share_url || "";
    const message = shared?.message
      || `Hi${form.name ? ` ${form.name.split(" ")[0]}` : ""}, here is your ${saved?.insurer || ""} motor policy document ${saved?.display_id || ""}.${docLink ? ` Open, download and accept it here: ${docLink}` : ""}`.replace(/\s+/g, " ").trim();
    const subject = `Your ${saved?.insurer || ""} motor policy document ${saved?.display_id || ""}`.trim();
    const ready = Boolean(docLink);
    return {
      phone,
      email,
      wa,
      ready,
      waChat: waMeChatUrl(phone),
      whatsappUrl: ready ? waMeSendUrl(phone, message) : "",
      emailUrl: ready ? mailtoUrl(email, subject, message) : "",
    };
  }

  async function sendOnWhatsApp() {
    if (!saved) return;
    if (!waMeNumber(customerPhone())) {
      setError("Enter a mobile number in Step 1 to send this document on WhatsApp.");
      return;
    }
    setBusy("whatsapp");
    setError("");
    try {
      const result = await ensureShare("whatsapp");
      const url = shareLinks(result).whatsappUrl || shareLinks(result).waChat;
      if (!url) throw new Error("Could not build the WhatsApp link.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function sendOnEmail() {
    if (!saved) return;
    if (!customerEmail()) {
      setError("Enter an email address in Step 1 to send this document.");
      return;
    }
    setBusy("email");
    setError("");
    setEmailNotice("");
    try {
      const result = await api.sendQuoteEmail(saved.quote_id);
      setShare((prev) => ({
        ...(prev || {}),
        share_url: result.share_url,
        message: result.message,
        quote: result.quote,
      }));
      setSaved(result.quote);
      setEmailNotice(`Sent from ${result.email_from} to ${result.email_to}`);
      loadQuotes();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function offerAddons() {
    const offer = comparison?.providers.find((p) => p.insurer === form.insurer);
    return offer?.applied_addon_ids ?? form.selectedAddonIds;
  }

  function toggleAddon(id, available) {
    if (!available) return;
    setForm((f) => ({
      ...f,
      selectedAddonIds: f.selectedAddonIds.includes(id)
        ? f.selectedAddonIds.filter((x) => x !== id)
        : [...f.selectedAddonIds, id],
    }));
  }

  const selectedOffer = comparison?.providers.find((p) => p.insurer === form.insurer);
  const selectedBreakdown = selectedOffer?.[form.planTier] || selectedOffer?.premium;
  const sendDest = shareLinks(share);
  const lowestByTier = comparison
    ? Object.fromEntries(
      ["basic", "standard", "premium"].map((tier) => [
        tier,
        Math.min(...comparison.providers.map((p) => Number(p[tier]?.total_payable || Infinity))),
      ]),
    )
    : {};

  if (!isCreatingQuote) {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quotes</h1>
              <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-100">
                {quotesList.length} records
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Live quotes from the rate card. Create, send on WhatsApp, or open the printable PDF.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={startBlank} className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center gap-2">
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add New Quote</span>
            </button>
            {onBackToDashboard && (
              <button onClick={onBackToDashboard} className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search customer, quote ID, vehicle, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {["All", "Sent", "Converted", "Draft", "Expired"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap ${
                  statusFilter === st ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {listError && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{listError}</p>}

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-4 px-6">Quote & Customer</th>
                  <th className="py-4 px-4">Contact</th>
                  <th className="py-4 px-4">Vehicle</th>
                  <th className="py-4 px-4">IDV</th>
                  <th className="py-4 px-4">Premium</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium">
                {quotesList.map((quote) => (
                  <tr key={quote.quote_id} className="hover:bg-blue-50/30">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${avatarBg(quote.customer?.name)} font-bold text-xs flex items-center justify-center`}>
                          {initials(quote.customer?.name)}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 leading-tight">{quote.customer?.name}</h4>
                          <span className="text-xs text-slate-400 font-mono">{quote.display_id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-xs space-y-0.5">
                      <p className="font-semibold text-slate-900">{quote.customer?.phone}</p>
                      <p className="text-slate-400 truncate max-w-[150px]">{quote.customer?.email || "—"}</p>
                      <span className="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{quote.city}</span>
                    </td>
                    <td className="py-4 px-4">
                      <p className="font-bold text-slate-800">{vehicleLabel(quote.vehicle)}</p>
                      <span className="text-xs text-slate-400">{quote.insurer || "—"} · {planLabel(quote.plan_tier)}</span>
                    </td>
                    <td className="py-4 px-4 font-bold text-slate-700">₹{inrWhole(quote.idv)}</td>
                    <td className="py-4 px-4 font-black text-blue-700">₹{inr(quote.total_payable)}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full border text-xs font-bold ${statusBadge(quote.effective_status)}`}>
                        {statusLabel(quote.effective_status)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startForQuote(quote)} className="px-3.5 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5">
                          <FilePlus className="w-3.5 h-3.5" /> Quote again
                        </button>
                        <button onClick={() => onViewQuote(quote)} className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!listLoading && quotesList.length === 0 && (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-400">
                      <p className="text-lg font-bold text-slate-600">No quotes found</p>
                      <button onClick={startBlank} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">+ Create New Quote</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Motor Quote Engine</h1>
            <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-100">5-Step Assistant</span>
          </div>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {form.name || "New customer"} {currentVehicle ? `· ${vehicleLabel(currentVehicle)}` : ""}
          </p>
        </div>
        <button onClick={() => setIsCreatingQuote(false)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to quotes
        </button>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center w-full max-w-4xl mx-auto">
          {STEPS.map((s, idx) => (
            <React.Fragment key={s.num}>
              <div className="flex flex-col items-center relative z-10 cursor-pointer" onClick={() => s.num < step && setStep(s.num)}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${step >= s.num ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-400 border-2 border-slate-200"}`}>
                  {step > s.num ? <Check className="w-5 h-5 stroke-[3]" /> : s.num}
                </div>
                <span className={`text-xs mt-2.5 whitespace-nowrap ${step >= s.num ? "text-slate-900 font-bold" : "text-slate-400"}`}>{s.label}</span>
              </div>
              {idx < STEPS.length - 1 && <div className={`flex-1 h-1 mx-2 rounded-full ${step > s.num ? "bg-blue-600" : "bg-slate-200"}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>}

      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm max-w-3xl mx-auto">
          <h2 className="text-xl font-extrabold text-slate-900">Step 1: Customer Details</h2>
          <p className="text-sm text-slate-500 mt-1 mb-8">City sets the rate-card zone and flood-prone add-on rules.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field label="Full Name" required>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, existingId: form.existingId })} className={inputCls} />
            </Field>
            <Field label="Mobile Number" required>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value, existingId: null })}
                onBlur={(e) => lookupPhone(e.target.value)}
                placeholder="9876543210"
                className={inputCls}
              />
              <p className="text-[11px] text-slate-400 mt-1">Used to send the policy document on WhatsApp (wa.me).</p>
            </Field>
            <Field label="Email Address">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              <p className="text-[11px] text-slate-400 mt-1">Used to send the policy document by email.</p>
            </Field>
            <Field label="City / RTO Zone" required>
              <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls}>
                {cities.map((c) => (
                  <option key={c.city} value={c.city}>
                    {c.city} ({c.city_zone.replaceAll("_", " ")}){c.flood_prone ? " · flood-prone" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {form.existingId && (
            <p className="mt-4 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              Matched existing customer #{form.existingId}. This quote will be attached to their profile.
            </p>
          )}
          {customers.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold text-slate-500 mb-2">Or pick a saved customer</p>
              <div className="flex flex-wrap gap-2">
                {customers.slice(0, 8).map((c) => (
                  <button
                    key={c.customer_id}
                    type="button"
                    onClick={() => setForm({ ...form, name: c.name, phone: c.phone, email: c.email || "", city: c.city, existingId: c.customer_id, vehicleId: c.preferred_vehicle_id || form.vehicleId })}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-xs font-semibold text-slate-700"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Nav
            back={() => setIsCreatingQuote(false)}
            backLabel="Cancel"
            next={() => {
              if (!form.name.trim() || !form.phone.trim() || !form.city) setError("Name, mobile and city are required.");
              else { setError(""); setStep(2); }
            }}
            nextLabel="Save & Continue"
          />
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm">
            <h2 className="text-xl font-extrabold text-slate-900">Step 2: Vehicle Details</h2>
            <p className="text-sm text-slate-500 mt-1 mb-8">
              Pick make and model from the catalog, then edit year, fuel, engine size and ex-showroom — IDV and premium use these values.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label="Make" required>
                <select
                  value={make}
                  onChange={(e) => {
                    const next = e.target.value;
                    setMake(next);
                    setModel("");
                    setYear("");
                    setFuel("");
                    applyCatalog(null);
                  }}
                  className={inputCls}
                >
                  <option value="">Select make</option>
                  {makes.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Model" required>
                <select
                  value={model}
                  onChange={(e) => {
                    const next = e.target.value;
                    setModel(next);
                    applyCatalog(catalogFor(make, next));
                  }}
                  className={inputCls}
                >
                  <option value="">Select model</option>
                  {models.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Year" required>
                <select value={year} onChange={(e) => setYear(e.target.value)} className={inputCls}>
                  <option value="">Select year</option>
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="Fuel type" required>
                <select
                  value={fuel}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFuel(next);
                    if (next === "electric") setForm((f) => ({ ...f, engineCc: "0" }));
                    else if (form.engineCc === "0" && currentVehicle) setForm((f) => ({ ...f, engineCc: String(currentVehicle.engine_cc || 1197) }));
                  }}
                  className={inputCls}
                >
                  <option value="">Select fuel</option>
                  {FUEL_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Engine capacity (cc)" required>
                <select
                  value={form.engineCc}
                  onChange={(e) => setForm({ ...form, engineCc: e.target.value })}
                  disabled={fuel === "electric"}
                  className={inputCls}
                >
                  <option value="">Select cc</option>
                  {ccOptions.map((cc) => (
                    <option key={cc} value={cc}>
                      {cc === 0 ? "0 cc — Electric" : `${cc} cc`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ex-showroom price (₹)" required>
                <input
                  type="number"
                  min="1"
                  step="1000"
                  value={form.exShowroom}
                  onChange={(e) => setForm({ ...form, exShowroom: e.target.value })}
                  placeholder="e.g. 1499000"
                  className={`${inputCls} font-bold`}
                />
              </Field>
              <Field label="Registration date (optional)">
                <input type="date" value={form.registrationDate} onChange={(e) => setForm({ ...form, registrationDate: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Nav
              back={() => setStep(1)}
              next={loadCoverage}
              nextLabel={busy === "coverage" ? "Calculating…" : "Calculate IDV"}
              disabled={!form.vehicleId || !year || !fuel || form.engineCc === "" || !form.exShowroom || busy === "coverage"}
            />
          </div>
          <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Vehicle</h3>
            <div className="w-full h-36 bg-slate-200/70 rounded-xl flex flex-col items-center justify-center text-slate-400 mb-6">
              <Car className="w-16 h-16" />
              <span className="text-xs font-semibold mt-2">{make && model ? `${make} ${model} ${year || ""}`.trim() : "Select a vehicle"}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-slate-500">Fuel</span><span className="font-bold">{fuel || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Engine</span><span className="font-bold">{form.engineCc === "" ? "—" : `${form.engineCc} cc`}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Ex-showroom</span><span className="font-bold">{form.exShowroom ? `₹${inr(form.exShowroom)}` : "—"}</span></div>
              {addonMeta && (
                <>
                  <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-slate-500">Age</span><span className="font-bold">{addonMeta.vehicle_age_months} months</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Depreciation</span><span className="font-bold">{addonMeta.depreciation_pct}%</span></div>
                  <div className="flex justify-between border-t border-slate-100 pt-2"><span className="font-bold">IDV</span><span className="font-extrabold text-blue-700">₹{inr(addonMeta.idv)}</span></div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Step 3: Coverage & add-ons</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Choose claim-free years and the add-ons for the premium plan. Prices below are the range across HDFC ERGO, ICICI Lombard and Bajaj Allianz — the next step calculates each provider exactly.
                </p>
              </div>
              <button onClick={loadAdvice} disabled={busy === "advice"} className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold flex items-center gap-2">
                <Bot className="w-4 h-4" /> {busy === "advice" ? "Asking…" : "Ask AI advisor"}
              </button>
            </div>
            <div className="max-w-xs mb-6">
              <Field label="Claim-free years (NCB)">
                <select
                  value={form.claimFreeYears}
                  onChange={(e) => onClaimFreeYearsChange(Number(e.target.value))}
                  disabled={busy === "coverage"}
                  className={inputCls}
                >
                  {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? "year" : "years"}</option>)}
                </select>
                {addonMeta && (
                  <p className="text-xs text-slate-500 mt-2">
                    NCB {addonMeta.ncb_discount_pct ?? 0}% on own-damage premium
                    {busy === "coverage" ? " · updating suggestions…" : ""}
                  </p>
                )}
              </Field>
            </div>
            {advice && (
              <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm">
                <p className="font-bold text-indigo-900 mb-1">Advisor ({advice.source === "ai" ? "AI" : "rules"})</p>
                <p className="text-indigo-800">{advice.summary}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addonOptions.map((opt) => {
                const on = form.selectedAddonIds.includes(opt.addon_id);
                const same = opt.price_min != null && Number(opt.price_min) === Number(opt.price_max);
                return (
                  <button
                    key={opt.addon_id}
                    type="button"
                    disabled={!opt.available}
                    onClick={() => toggleAddon(opt.addon_id, opt.available)}
                    className={`text-left p-4 rounded-2xl border transition-all ${
                      !opt.available ? "bg-slate-50 border-slate-200 opacity-60"
                        : on ? "bg-blue-50 border-blue-500"
                          : "bg-white border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{addonLabel(opt.addon_name)}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {opt.recommended_by?.length
                            ? `Suggested by ${opt.recommended_by.join(", ")}`
                            : (opt.by_insurer || []).find((p) => p.reason)?.reason}
                        </p>
                      </div>
                      <span className="font-extrabold text-slate-900 whitespace-nowrap">
                        {opt.available
                          ? (same ? `₹${inrWhole(opt.price_min)}` : `₹${inrWhole(opt.price_min)}–₹${inrWhole(opt.price_max)}`)
                          : "n/a"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(opt.by_insurer || []).map((p) => (
                        <span key={p.insurer} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.available ? "bg-slate-100 text-slate-600" : "bg-rose-50 text-rose-600"}`}>
                          {p.insurer.split(" ")[0]} {p.available ? `₹${inrWhole(p.price)}` : "n/a"}
                        </span>
                      ))}
                    </div>
                    {opt.recommended && opt.available && (
                      <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Recommended</span>
                    )}
                  </button>
                );
              })}
            </div>
            <Nav back={() => setStep(2)} next={loadComparison} nextLabel={busy === "plans" ? "Calculating…" : "Compare providers"} disabled={busy === "plans"} />
          </div>
        </div>
      )}

      {step === 4 && comparison && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-extrabold text-slate-900">Step 4: Compare every plan from every provider</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl mx-auto">
              Basic is third-party only. Standard is own-damage + third-party with NCB. Premium adds your selected add-ons, using that insurer's rate card. Click a plan to see how it was calculated.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {comparison.providers.map((offer) => {
              const selectedInsurer = form.insurer === offer.insurer;
              return (
                <div
                  key={offer.insurer}
                  className={`bg-white rounded-2xl border p-5 shadow-sm ${selectedInsurer ? "border-blue-600 ring-2 ring-blue-100" : "border-slate-200"}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <h3 className="font-extrabold text-slate-900">{offer.insurer}</h3>
                    {selectedInsurer && <span className="text-[10px] font-bold uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full">Selected</span>}
                  </div>
                  <div className="space-y-2">
                    {["basic", "standard", "premium"].map((tier) => {
                      const p = offer[tier];
                      if (!p) return null;
                      const on = selectedInsurer && form.planTier === tier;
                      const tied = comparison.providers.every(
                        (other) => Number(other[tier]?.total_payable) === lowestByTier[tier],
                      );
                      const lowest = !tied && Number(p.total_payable) === lowestByTier[tier];
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setForm({ ...form, insurer: offer.insurer, planTier: tier })}
                          className={`w-full text-left rounded-xl border px-3 py-3 ${on ? "border-blue-600 bg-blue-50" : "border-slate-100 hover:border-blue-200"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-slate-900">{planLabel(tier)}</span>
                            <span className="flex items-center gap-1">
                              {lowest && <span className="text-[9px] font-bold uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">Lowest</span>}
                              <span className="text-sm font-black text-blue-700">₹{inr(p.total_payable)}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{PLAN_BLURB[tier]}</p>
                          <p className="text-[11px] text-slate-400">
                            {tier === "basic"
                              ? `Third-party ₹${inr(p.tp_premium)} · GST ₹${inr(p.gst_amount)}`
                              : `OD ${p.od_rate_pct}% · NCB ${p.ncb_discount_pct}% · GST ₹${inr(p.gst_amount)}`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {offer.skipped_addons.length > 0 && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg px-2 py-1 mt-3">
                      Not on this insurer's premium: {offer.skipped_addons.map((s) => addonLabel(s.addon_name)).join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-3 leading-relaxed">{offer.suggestion}</p>
                </div>
              );
            })}
          </div>

          {selectedBreakdown && selectedOffer && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm">
                <h4 className="font-bold mb-1 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-600" /> How {selectedOffer.insurer} {planLabel(form.planTier)} was calculated
                </h4>
                <p className="text-xs text-slate-500 mb-4">Each step uses the database rate card and NCB slab — nothing is estimated.</p>
                <ol className="space-y-4">
                  {explainQuote(selectedBreakdown).map((stepExplain, i) => (
                    <li key={stepExplain.title} className="border-l-2 border-blue-100 pl-3">
                      <p className="text-xs font-extrabold text-slate-900">{i + 1}. {stepExplain.title}</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{stepExplain.why}</p>
                      <p className="text-xs font-mono text-slate-800 bg-slate-50 rounded-lg px-2 py-1.5 mt-1.5 whitespace-pre-wrap">{stepExplain.calc}</p>
                    </li>
                  ))}
                </ol>
                {selectedBreakdown.formula_trace?.length > 0 && (
                  <details className="mt-4 text-xs text-slate-500">
                    <summary className="cursor-pointer font-semibold text-slate-600">Raw formula log</summary>
                    <ol className="mt-2 font-mono space-y-1 text-slate-500">
                      {selectedBreakdown.formula_trace.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm">
                <h4 className="font-bold mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" /> What this plan includes</h4>
                <ul className="text-xs text-slate-600 space-y-1.5 mb-4">
                  <li className="flex justify-between"><span>Plan</span><span className="font-bold">{planLabel(selectedBreakdown.plan_tier)}</span></li>
                  <li className="flex justify-between"><span>IDV</span><span className="font-semibold">{selectedBreakdown.plan_tier === "basic" ? "n/a" : `₹${inr(selectedBreakdown.idv)}`}</span></li>
                  <li className="flex justify-between"><span>Own damage</span><span>₹{inr(selectedBreakdown.od_premium)}</span></li>
                  <li className="flex justify-between"><span>NCB {selectedBreakdown.ncb_discount_pct}%</span><span className="text-emerald-700">-₹{inr(selectedBreakdown.ncb_discount_amount)}</span></li>
                  <li className="flex justify-between"><span>Third-party</span><span>₹{inr(selectedBreakdown.tp_premium)}</span></li>
                  {(selectedBreakdown.addon_breakdown || []).map((a) => (
                    <li key={a.addon_id} className="flex justify-between gap-2">
                      <span>{addonLabel(a.addon_name)}</span><span>₹{inr(a.price)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between border-t border-slate-100 pt-2"><span>Net premium</span><span className="font-semibold">₹{inr(selectedBreakdown.total_premium)}</span></li>
                  <li className="flex justify-between"><span>GST 18%</span><span>₹{inr(selectedBreakdown.gst_amount)}</span></li>
                  <li className="flex justify-between font-extrabold text-slate-900"><span>Total payable</span><span>₹{inr(selectedBreakdown.total_payable)}</span></li>
                </ul>
                {form.planTier === "premium" ? (
                  <ul className="space-y-3 border-t border-slate-100 pt-4">
                    {(selectedOffer.addon_notes || []).map((note) => (
                      <li key={note.addon_id}>
                        <p className="font-bold text-slate-900">{addonLabel(note.addon_name)} · ₹{inr(note.price)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{note.applicability_note || note.recommendation_reason}</p>
                        {note.formula && <p className="text-[11px] font-mono text-slate-400 mt-0.5">{note.formula}</p>}
                      </li>
                    ))}
                    {!selectedOffer.addon_notes?.length && (
                      <li className="text-xs text-slate-500">No add-ons on this premium. Go back to Step 3 to select covers.</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 border-t border-slate-100 pt-4">
                    {form.planTier === "basic"
                      ? "Basic does not cover your own vehicle. Switch to Standard or Premium on this provider to include own-damage."
                      : "Standard covers own-damage and third-party, without add-ons. Switch to Premium on this provider to include Zero Dep, RSA and the rest."}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 flex items-center gap-2"><ChevronLeft className="w-4 h-4" /> Back</button>
            <button onClick={saveQuote} disabled={busy === "save" || !form.insurer} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white flex items-center gap-2">
              {busy === "save" ? "Saving…" : `Generate ${form.insurer} ${planLabel(form.planTier)} document`} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 5 && saved && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Step 5: {saved.insurer} policy document</h2>
                  <p className="text-sm text-slate-500">{saved.display_id} · valid until {formatDate(saved.valid_until)} · total payable ₹{inr(saved.total_payable)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {sendDest.whatsappUrl ? (
                  <a href={sendDest.whatsappUrl} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" /> Send on WhatsApp
                  </a>
                ) : (
                  <button type="button" onClick={sendOnWhatsApp} disabled={busy === "whatsapp" || !sendDest.wa} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                    <MessageCircle className="w-4 h-4" /> {busy === "whatsapp" ? "Opening WhatsApp…" : "Send on WhatsApp"}
                  </button>
                )}
                <button type="button" onClick={sendOnEmail} disabled={busy === "email" || !sendDest.email} className="px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                  <MailIcon className="w-4 h-4" /> {busy === "email" ? "Sending email…" : emailNotice ? "Sent by email" : "Send by email"}
                </button>
                <a href={api.documentUrl(saved.quote_id)} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-bold flex items-center gap-2">
                  <Download className="w-4 h-4" /> Print / PDF
                </a>
                {onAskAI && (
                  <button onClick={() => onAskAI(saved)} className="px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold flex items-center gap-2">
                    <Bot className="w-4 h-4" /> Competitive pitch
                  </button>
                )}
                <button onClick={() => { setIsCreatingQuote(false); loadQuotes(); }} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Back to list
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <p className="text-sm font-extrabold text-emerald-900 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" /> WhatsApp · Step 1 mobile
                </p>
                {sendDest.wa ? (
                  <>
                    <p className="text-xs text-emerald-800 mt-1">Opens a chat with {sendDest.phone} and the policy document link.</p>
                    {sendDest.whatsappUrl ? (
                      <a href={sendDest.whatsappUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[11px] font-mono text-emerald-800 underline break-all">
                        {sendDest.waChat}
                      </a>
                    ) : (
                      <button type="button" onClick={sendOnWhatsApp} className="mt-2 block text-left text-[11px] font-mono text-emerald-800 underline break-all">
                        {sendDest.waChat}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-emerald-800 mt-1">Enter a mobile number in Step 1 to send this document on WhatsApp.</p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <MailIcon className="w-4 h-4" /> Email from dhawalevs@rknec.edu
                </p>
                {sendDest.email ? (
                  <>
                    <p className="text-xs text-slate-600 mt-1">
                      Sends this policy document to {sendDest.email} (from Step 1).
                    </p>
                    <button type="button" onClick={sendOnEmail} disabled={busy === "email"} className="mt-2 text-left text-[11px] font-mono text-slate-700 underline break-all disabled:opacity-50">
                      {sendDest.email}
                    </button>
                    {emailNotice && <p className="text-xs font-semibold text-emerald-700 mt-2">{emailNotice}</p>}
                  </>
                ) : (
                  <p className="text-xs text-slate-600 mt-1">Enter an email address in Step 1 to send this document.</p>
                )}
              </div>
            </div>
            {share?.share_url && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 break-all mb-4">
                Customer document link: {share.share_url}
              </p>
            )}
            <iframe
              title={`${saved.insurer} policy document`}
              src={api.documentUrl(saved.quote_id)}
              className="w-full min-h-[80vh] rounded-xl border border-slate-200 bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}

const PLAN_BLURB = {
  basic: "Third-party liability only. No cover for your own vehicle.",
  standard: "Own-damage + third-party, with NCB. No add-ons.",
  premium: "Own-damage + third-party + selected add-ons.",
};

function explainQuote(plan) {
  if (!plan) return [];
  const who = plan.insurer || "This insurer";
  const steps = [
    {
      title: "Which insurer is pricing this",
      why: `${who} uses its own own-damage rate for this city zone and engine size. Third-party premium is the IRDAI national tariff, so Basic is the same rupee amount on HDFC ERGO, ICICI Lombard and Bajaj Allianz.`,
      calc: `${who} · zone ${plan.city_zone} · engine band ${plan.cc_band} · ${plan.vehicle}`,
    },
    {
      title: "Vehicle age",
      why: "Age in completed months picks the IDV depreciation slab. Registration date is used when you entered one; otherwise 1 January of the model year is assumed. Older cars have a lower insured value.",
      calc: `${plan.vehicle_age_months} completed months · ${plan.age_basis}`,
    },
  ];
  if (plan.plan_tier === "basic") {
    steps.push({
      title: "Basic skips own-damage",
      why: "A third-party-only plan does not pay for damage, theft or fire to this vehicle. IDV, own-damage premium, NCB and add-ons are therefore all zero. Switch to Standard or Premium on this provider to cover the car itself.",
      calc: "IDV, OD premium and NCB = ₹0.00",
    });
  } else {
    steps.push({
      title: "Insured Declared Value (IDV)",
      why: "IDV is the maximum own-damage payout. It starts from the ex-showroom price and is reduced by the IRDAI depreciation percentage for this age band (for example 5% in the first 6 months, 15% from 6–12 months, 20% from 12–24 months).",
      calc: `₹${inr(plan.ex_showroom_price)} × (1 − ${plan.depreciation_pct}%) = ₹${inr(plan.idv)}`,
    });
    steps.push({
      title: "Own-damage premium",
      why: `This is the charge for covering accident, theft, fire and natural calamity to your vehicle. ${who} applies its own OD rate (from the rate card for this zone and engine band) to the IDV — that is why Standard and Premium totals differ across providers.`,
      calc: `₹${inr(plan.idv)} × ${plan.od_rate_pct}% = ₹${inr(plan.od_premium)}`,
    });
    steps.push({
      title: "No Claim Bonus (NCB)",
      why: plan.claim_free_years
        ? `IRDAI NCB slabs are 20% after 1 claim-free year, 25% after 2, 35% after 3, 45% after 4 and 50% after 5 or more. With ${plan.claim_free_years} claim-free year(s) you get ${plan.ncb_discount_pct}% off own-damage only — never off third-party or add-ons.`
        : "IRDAI NCB slabs are 20% after 1 claim-free year, 25% after 2, 35% after 3, 45% after 4 and 50% after 5 or more. You have 0 claim-free years, so NCB is 0% this year.",
      calc: `₹${inr(plan.od_premium)} × ${plan.ncb_discount_pct}% = ₹${inr(plan.ncb_discount_amount)}\nNet OD = ₹${inr(plan.od_premium)} − ₹${inr(plan.ncb_discount_amount)} = ₹${inr(plan.net_od_premium)}`,
    });
  }
  steps.push({
    title: "Third-party liability",
    why: "Compulsory cover if you injure someone or damage their property. It is a flat IRDAI amount by engine-size band and does not change between these three insurers.",
    calc: `₹${inr(plan.tp_premium)} flat for ${plan.cc_band}`,
  });
  if (plan.plan_tier === "premium" && (plan.addon_breakdown || []).length) {
    steps.push({
      title: "Add-ons",
      why: `Optional covers from ${who}'s schedule. A flat rule is a fixed rupee amount; a % of IDV rule scales with the insured value. An add-on that this insurer does not sell is left off this premium instead of blocking the quote.`,
      calc: (plan.addon_breakdown || [])
        .map((a) => `${addonLabel(a.addon_name)}: ${a.formula} → ₹${inr(a.price)}`)
        .join("\n"),
    });
  } else {
    steps.push({
      title: "Add-ons",
      why: plan.plan_tier === "basic"
        ? "Add-ons cannot be attached to a third-party-only plan."
        : "Standard is own-damage + third-party without add-ons. Choose Premium on this provider to include Zero Dep, RSA and the rest.",
      calc: "Add-ons total ₹0.00",
    });
  }
  const addonsTotal = plan.addons_total ?? 0;
  steps.push({
    title: "GST and total payable",
    why: "Net premium is own-damage after NCB, plus third-party, plus add-ons. GST at 18% is then charged on that net premium.",
    calc: `Net premium = ₹${inr(plan.net_od_premium)} + ₹${inr(plan.tp_premium)} + ₹${inr(addonsTotal)} = ₹${inr(plan.total_premium)}\nGST 18% = ₹${inr(plan.gst_amount)}\nTotal payable = ₹${inr(plan.total_premium)} + ₹${inr(plan.gst_amount)} = ₹${inr(plan.total_payable)}`,
  });
  return steps;
}

const inputCls = "w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none bg-white";

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Nav({ back, backLabel = "Back", next, nextLabel, disabled }) {
  return (
    <div className="mt-10 flex items-center justify-between pt-6 border-t border-slate-100">
      <button type="button" onClick={back} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-2">
        {backLabel === "Back" && <ChevronLeft className="w-4 h-4" />} {backLabel}
      </button>
      <button type="button" onClick={next} disabled={disabled} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
        {nextLabel} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
