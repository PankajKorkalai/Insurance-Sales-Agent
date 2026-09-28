import React, { useState } from "react";
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Car,
  FileText,
  CheckCircle2,
  Sparkles,
  Shield,
  Tag,
} from "lucide-react";

export default function NewCustomer({ onBackToDashboard, onSaveCustomer }) {
  const [formData, setFormData] = useState({
    fullName: "",
    mobile: "",
    email: "",
    gender: "Male",
    dob: "",
    city: "Mumbai",
    state: "Maharashtra",
    address: "",
    pincode: "",
    vehicleMakeModel: "Hyundai Creta",
    regNumber: "",
    policyType: "Motor Comprehensive",
    leadStatus: "Hot",
    notes: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.fullName || !formData.mobile) {
      alert("Please fill in required fields (Full Name & Mobile Number)");
      return;
    }

    const customerObj = {
      id: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
      name: formData.fullName,
      mobile: formData.mobile,
      email: formData.email || "N/A",
      city: formData.city,
      vehicle: formData.vehicleMakeModel,
      leadStatus: formData.leadStatus,
      createdOn: "Today",
    };

    if (onSaveCustomer) {
      onSaveCustomer(customerObj);
    } else if (onBackToDashboard) {
      onBackToDashboard();
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Add New Customer</h1>
            <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-100">
              Customer Management
            </span>
          </div>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Register a new client profile to issue quotes, track renewals, and send AI copilot recommendations.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToDashboard}
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Section 1: Personal Details */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Personal & Contact Information</h2>
              <p className="text-xs text-slate-500">Basic identification details for policy issuance.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="e.g. Amit Verma"
                  required
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="e.g. 9876543210"
                  required
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="e.g. amit@example.com"
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Gender</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none bg-white transition-all"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Date of Birth</label>
              <input
                type="date"
                name="dob"
                value={formData.dob}
                onChange={handleChange}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Lead Intent Status</label>
              <select
                name="leadStatus"
                value={formData.leadStatus}
                onChange={handleChange}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none bg-white transition-all"
              >
                <option value="Hot">🔥 Hot Lead (Immediate)</option>
                <option value="Warm">⚡ Warm Lead (Follow Up)</option>
                <option value="Cold">❄️ Cold Lead (Exploring)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Address & Location */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Address & RTO Location</h2>
              <p className="text-xs text-slate-500">Determines city risk rating and RTO zone pricing.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Street Address</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="e.g. Flat 402, Sunshine Heights, Andheri West"
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">City</label>
              <select
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none bg-white transition-all"
              >
                <option value="Mumbai">Mumbai</option>
                <option value="Delhi">Delhi</option>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Pune">Pune</option>
                <option value="Hyderabad">Hyderabad</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">State</label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Pincode</label>
              <input
                type="text"
                name="pincode"
                value={formData.pincode}
                onChange={handleChange}
                placeholder="e.g. 400053"
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Vehicle Interest Details */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Vehicle & Policy Preference</h2>
              <p className="text-xs text-slate-500">Details used to auto-populate quotes.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Vehicle Make & Model</label>
              <input
                type="text"
                name="vehicleMakeModel"
                value={formData.vehicleMakeModel}
                onChange={handleChange}
                placeholder="e.g. Hyundai Creta 2025"
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Vehicle Reg. Number (Optional)</label>
              <input
                type="text"
                name="regNumber"
                value={formData.regNumber}
                onChange={handleChange}
                placeholder="e.g. MH-02-CZ-9842"
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Policy Type Interest</label>
              <select
                name="policyType"
                value={formData.policyType}
                onChange={handleChange}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none bg-white transition-all"
              >
                <option value="Motor Comprehensive">Motor Comprehensive</option>
                <option value="Motor Third Party Only">Motor Third Party Only</option>
                <option value="Health Insurance">Health Insurance</option>
                <option value="Commercial Vehicle">Commercial Vehicle</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Agent Notes & Specific Requirements</label>
            <textarea
              name="notes"
              rows="3"
              value={formData.notes}
              onChange={handleChange}
              placeholder="e.g. Customer prefers ICICI Lombard or HDFC ERGO. Zero dep add-on is mandatory."
              className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
            ></textarea>
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="flex items-center justify-end gap-4 pt-4">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="px-6 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="px-8 py-3 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save Customer Profile</span>
          </button>
        </div>

      </form>
    </div>
  );
}
