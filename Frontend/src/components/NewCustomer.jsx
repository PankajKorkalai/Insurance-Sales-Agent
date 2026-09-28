import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  User,
  MapPin,
  Car,
  CheckCircle2,
  Plus,
  Search,
  FilePlus,
} from "lucide-react";
import { api } from "../api";
import { avatarBg, formatDate, initials, statusLabel } from "../format";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  gender: "",
  date_of_birth: "",
  city: "",
  state: "",
  address: "",
  pincode: "",
  preferred_vehicle_id: "",
  registration_number: "",
  policy_type: "Comprehensive",
  lead_status: "hot",
  notes: "",
};

export default function NewCustomer({
  onBackToDashboard,
  onQuoteForCustomer,
  showForm: showFormProp,
}) {
  const [showForm, setShowForm] = useState(!!showFormProp);
  const [formData, setFormData] = useState(emptyForm);
  const [customers, setCustomers] = useState([]);
  const [cities, setCities] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.customers({ q: search || undefined, lead_status: leadFilter || undefined, limit: 200 }),
      api.cities(),
      api.vehicles(),
    ])
      .then(([cu, ci, v]) => {
        setCustomers(cu);
        setCities(ci);
        setVehicles(v);
        setFormData((f) => (f.city || !ci.length ? f : { ...f, city: ci[0].city }));
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, leadFilter, showFormProp]);

  useEffect(() => {
    if (showFormProp) setShowForm(true);
  }, [showFormProp]);

  const makesModels = useMemo(
    () => vehicles.map((v) => ({ id: v.vehicle_id, label: `${v.make} ${v.model} ${v.year} (${v.fuel_type})` })),
    [vehicles],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      setError("Full name and mobile number are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createCustomer({
        name: formData.name,
        phone: formData.phone,
        email: formData.email || null,
        city: formData.city,
        gender: formData.gender ? formData.gender.toLowerCase() : null,
        date_of_birth: formData.date_of_birth || null,
        address: formData.address || null,
        state: formData.state || null,
        pincode: formData.pincode || null,
        lead_status: formData.lead_status,
        preferred_vehicle_id: formData.preferred_vehicle_id ? Number(formData.preferred_vehicle_id) : null,
        registration_number: formData.registration_number || null,
        policy_type: formData.policy_type || null,
        notes: formData.notes || null,
      });
      setFormData(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const leadBadge = {
    hot: "bg-rose-100 text-rose-700 border-rose-200",
    warm: "bg-amber-100 text-amber-800 border-amber-200",
    cold: "bg-slate-100 text-slate-600 border-slate-200",
  };

  if (!showForm) {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customers</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">{customers.length} profiles · quotes and conversions from the same database</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setFormData(emptyForm); setShowForm(true); }} className="px-5 py-3 bg-blue-600 text-white font-bold text-sm rounded-xl flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Customer
            </button>
            <button onClick={onBackToDashboard} className="px-4 py-3 bg-slate-100 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </button>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, city…" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-1.5">
            {[{ k: "", l: "All" }, { k: "hot", l: "Hot" }, { k: "warm", l: "Warm" }, { k: "cold", l: "Cold" }].map((x) => (
              <button key={x.k} onClick={() => setLeadFilter(x.k)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold ${leadFilter === x.k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                {x.l}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>}

        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                <th className="py-3 px-6">Customer</th>
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4">Lead</th>
                <th className="py-3 px-4">Quotes</th>
                <th className="py-3 px-4">Added</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.customer_id} className="hover:bg-slate-50">
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${avatarBg(c.name)} font-bold text-xs flex items-center justify-center`}>{initials(c.name)}</div>
                      <div>
                        <p className="font-bold text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.phone}{c.email ? ` · ${c.email}` : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{c.city}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${leadBadge[c.lead_status] || leadBadge.warm}`}>
                      {statusLabel(c.lead_status)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{c.quote_count} · {c.converted_count} converted</td>
                  <td className="py-3 px-4 text-slate-500 text-xs">{formatDate(c.created_at)}</td>
                  <td className="py-3 px-6 text-right">
                    <button onClick={() => onQuoteForCustomer(c)} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5">
                      <FilePlus className="w-3.5 h-3.5" /> New quote
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && customers.length === 0 && (
                <tr><td colSpan="6" className="py-10 text-center text-slate-400">No customers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Add New Customer</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Saved to the same Postgres database used by the quote engine.</p>
        </div>
        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to list
        </button>
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><User className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Personal & Contact Information</h2>
              <p className="text-xs text-slate-500">Mobile number is unique — a duplicate is rejected.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Field label="Full Name" required><input name="name" value={formData.name} onChange={handleChange} required className={inputCls} /></Field>
            <Field label="Mobile Number" required><input name="phone" value={formData.phone} onChange={handleChange} placeholder="9876543210" required className={inputCls} /></Field>
            <Field label="Email Address"><input type="email" name="email" value={formData.email} onChange={handleChange} className={inputCls} /></Field>
            <Field label="Gender">
              <select name="gender" value={formData.gender} onChange={handleChange} className={inputCls}>
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Date of Birth"><input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className={inputCls} /></Field>
            <Field label="Lead Intent">
              <select name="lead_status" value={formData.lead_status} onChange={handleChange} className={inputCls}>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><MapPin className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Address & RTO Location</h2>
              <p className="text-xs text-slate-500">City drives zone pricing when you quote.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="sm:col-span-2"><Field label="Street Address"><input name="address" value={formData.address} onChange={handleChange} className={inputCls} /></Field></div>
            <Field label="City">
              <select name="city" value={formData.city} onChange={handleChange} className={inputCls}>
                {cities.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
              </select>
            </Field>
            <Field label="State"><input name="state" value={formData.state} onChange={handleChange} className={inputCls} /></Field>
            <Field label="Pincode"><input name="pincode" value={formData.pincode} onChange={handleChange} placeholder="400053" className={inputCls} /></Field>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center"><Car className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Vehicle & Policy Preference</h2>
              <p className="text-xs text-slate-500">Optional — used to pre-fill the quote wizard.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Field label="Preferred vehicle">
              <select name="preferred_vehicle_id" value={formData.preferred_vehicle_id} onChange={handleChange} className={inputCls}>
                <option value="">Not specified</option>
                {makesModels.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Registration number"><input name="registration_number" value={formData.registration_number} onChange={handleChange} className={inputCls} /></Field>
            <Field label="Policy type">
              <select name="policy_type" value={formData.policy_type} onChange={handleChange} className={inputCls}>
                <option>Comprehensive</option>
                <option>Third Party Only</option>
              </select>
            </Field>
          </div>
          <Field label="Agent notes">
            <textarea name="notes" rows="3" value={formData.notes} onChange={handleChange} className={inputCls} />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-4">
          <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-700">Cancel</button>
          <button type="submit" disabled={saving} className="px-8 py-3 rounded-xl font-bold text-sm bg-blue-600 text-white flex items-center gap-2 disabled:opacity-50">
            <CheckCircle2 className="w-4 h-4" /> {saving ? "Saving…" : "Save Customer Profile"}
          </button>
        </div>
      </form>
    </div>
  );
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
