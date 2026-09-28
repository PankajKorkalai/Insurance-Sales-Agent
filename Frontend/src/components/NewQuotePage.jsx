import React, { useState, useMemo } from "react";
import {
  Car,
  ChevronLeft,
  ChevronRight,
  Shield,
  Phone,
  AlertCircle,
  FileText,
  CheckCircle2,
  Download,
  MessageCircle,
  Mail as MailIcon,
  Check,
  ArrowLeft,
  Sparkles,
  Plus,
  Search,
  Filter,
  UserCheck,
  Eye,
  FilePlus,
  RefreshCw,
} from "lucide-react";
import {
  INITIAL_VEHICLE_MASTER,
  CITY_ZONES,
  ADDONS_MASTER,
  INITIAL_QUOTES,
} from "../data/mockData";

export default function NewQuotePage({ onSaveQuote, onBackToDashboard }) {
  // Mode State: false = Show Customer & Quotes Table View (default); true = 5-Step Generator
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [step, setStep] = useState(1);

  // Table State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [quotesList, setQuotesList] = useState(INITIAL_QUOTES);

  // Form State - Customer
  const [customerName, setCustomerName] = useState("Rahul Sharma");
  const [customerPhone, setCustomerPhone] = useState("9876543210");
  const [customerEmail, setCustomerEmail] = useState("rahul@gmail.com");
  const [selectedCity, setSelectedCity] = useState("Mumbai");
  const [isExistingCustomer, setIsExistingCustomer] = useState(true);

  // Vehicle Selection
  const [selectedMake, setSelectedMake] = useState("Hyundai");
  const [selectedModel, setSelectedModel] = useState("Creta");
  const [regYear, setRegYear] = useState("2025");
  const [fuelType, setFuelType] = useState("Petrol");

  // Selected Plan
  const [selectedPlanTier, setSelectedPlanTier] = useState("Standard");

  // Selected Addons
  const [selectedAddonIds, setSelectedAddonIds] = useState(["zero_dep", "rsa"]);

  // Start quote wizard for a specific existing customer from the table
  const handleStartQuoteForCustomer = (cust) => {
    if (cust) {
      setCustomerName(cust.customer || cust.name || "Customer");
      setCustomerPhone(cust.phone || cust.mobile || "9876543210");
      setCustomerEmail(cust.email || "customer@example.com");
      if (cust.city) setSelectedCity(cust.city);
      if (cust.vehicle) {
        const parts = cust.vehicle.split(" ");
        if (parts.length >= 2) {
          setSelectedMake(parts[0]);
          setSelectedModel(parts[1]);
        }
      }
    }
    setStep(1);
    setIsCreatingQuote(true);
  };

  // Start fresh blank quote wizard
  const handleAddNewQuote = () => {
    setCustomerName("Rahul Sharma");
    setCustomerPhone("9876543210");
    setCustomerEmail("rahul@gmail.com");
    setSelectedCity("Mumbai");
    setSelectedMake("Hyundai");
    setSelectedModel("Creta");
    setStep(1);
    setIsCreatingQuote(true);
  };

  const currentVehicle = useMemo(() => {
    return (
      INITIAL_VEHICLE_MASTER.find(
        (v) => v.make === selectedMake && v.model === selectedModel
      ) || INITIAL_VEHICLE_MASTER[0]
    );
  }, [selectedMake, selectedModel]);

  const vehicleAgeYears = Math.max(1, 2026 - Number(regYear));
  const exShowroom = currentVehicle.exShowroom;
  
  const idv = useMemo(() => {
    const depPercent = vehicleAgeYears <= 1 ? 0.1 : vehicleAgeYears <= 2 ? 0.2 : 0.3;
    return Math.round(exShowroom * (1 - depPercent));
  }, [exShowroom, vehicleAgeYears]);

  const basePremium = useMemo(() => {
    const zoneFactor = CITY_ZONES[selectedCity] === "Zone A" ? 0.028 : 0.025;
    return Math.round(idv * zoneFactor);
  }, [idv, selectedCity]);

  const addonsTotalCost = useMemo(() => {
    return selectedAddonIds.reduce((sum, id) => {
      const addon = ADDONS_MASTER.find((a) => a.id === id);
      return sum + (addon ? addon.price : 0);
    }, 0);
  }, [selectedAddonIds]);

  const planMultiplier = useMemo(() => {
    if (selectedPlanTier === "Basic") return 0.85;
    if (selectedPlanTier === "Premium") return 1.25;
    return 1.0; // Standard
  }, [selectedPlanTier]);

  const grossPremium = Math.round((basePremium + addonsTotalCost) * planMultiplier);
  const gstAmount = Math.round(grossPremium * 0.18);
  const finalPremium = grossPremium + gstAmount;

  const toggleAddon = (addonId) => {
    if (selectedAddonIds.includes(addonId)) {
      setSelectedAddonIds(selectedAddonIds.filter((id) => id !== addonId));
    } else {
      setSelectedAddonIds([...selectedAddonIds, addonId]);
    }
  };

  const handleFinalSubmit = () => {
    const newQuoteObj = {
      id: `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      avatar: customerName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase(),
      avatarBg: "bg-blue-100 text-blue-700",
      customer: customerName,
      phone: customerPhone,
      email: customerEmail,
      city: selectedCity,
      vehicle: `${selectedMake} ${selectedModel} ${regYear}`,
      fuel: fuelType,
      year: regYear,
      premium: finalPremium,
      status: "Sent",
      statusColor: "bg-blue-100 text-blue-700 border-blue-200",
      createdOn: "Today",
      idv: idv,
      addons: selectedAddonIds,
    };
    
    setQuotesList([newQuoteObj, ...quotesList]);
    if (onSaveQuote) onSaveQuote(newQuoteObj);
    setIsCreatingQuote(false);
  };

  const filteredQuotes = useMemo(() => {
    return quotesList.filter((item) => {
      const matchesSearch =
        item.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.vehicle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.city.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "All" || item.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [quotesList, searchQuery, statusFilter]);

  const steps = [
    { num: 1, label: "Customer" },
    { num: 2, label: "Vehicle" },
    { num: 3, label: "Coverage" },
    { num: 4, label: "Compare" },
    { num: 5, label: "Generate Quote" },
  ];

  // -------------------------------------------------------------
  // DEFAULT VIEW: EXISTING CUSTOMERS & QUOTES TABLE
  // -------------------------------------------------------------
  if (!isCreatingQuote) {
    return (
      <div className="space-y-6 pb-12 animate-in fade-in duration-200">
        
        {/* Header Bar with "+ Add New Quote" Button at Top */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Existing Customer Quotes</h1>
              <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-100">
                {quotesList.length} Active Records
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Select an existing customer to generate a motor quote or click Add New Quote to start fresh.
            </p>
          </div>

          {/* Primary Top Action Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddNewQuote}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add New Quote</span>
            </button>

            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 flex items-center gap-2 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by customer name, quote ID, vehicle, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>

          {/* Status Filter Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {["All", "Sent", "Converted", "Draft", "Expired"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  statusFilter === st
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

        </div>

        {/* Dummy Data Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-4 px-6">Quote ID & Customer</th>
                  <th className="py-4 px-4">Contact & Location</th>
                  <th className="py-4 px-4">Vehicle Details</th>
                  <th className="py-4 px-4">Insured IDV</th>
                  <th className="py-4 px-4">Premium</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium">
                {filteredQuotes.length > 0 ? (
                  filteredQuotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-blue-50/30 transition-colors">
                      
                      {/* Customer Name & ID */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full ${quote.avatarBg} font-bold text-xs flex items-center justify-center shrink-0 shadow-sm`}>
                            {quote.avatar}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 leading-tight">{quote.customer}</h4>
                            <span className="text-xs text-slate-400 font-medium font-mono">{quote.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Contact & City */}
                      <td className="py-4 px-4">
                        <div className="text-xs text-slate-700 font-medium space-y-0.5">
                          <p className="font-semibold text-slate-900">{quote.phone}</p>
                          <p className="text-slate-400 truncate max-w-[150px]">{quote.email}</p>
                          <span className="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                            {quote.city}
                          </span>
                        </div>
                      </td>

                      {/* Vehicle */}
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{quote.vehicle}</p>
                          <span className="text-xs text-slate-400 font-medium">Fuel: {quote.fuel} ({quote.year})</span>
                        </div>
                      </td>

                      {/* IDV */}
                      <td className="py-4 px-4 font-bold text-slate-700">
                        ₹{quote.idv ? quote.idv.toLocaleString("en-IN") : "8,50,000"}
                      </td>

                      {/* Premium */}
                      <td className="py-4 px-4">
                        <span className="font-black text-blue-700 text-base">
                          ₹{quote.premium.toLocaleString("en-IN")}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full border text-xs font-bold ${quote.statusColor}`}>
                          {quote.status}
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleStartQuoteForCustomer(quote)}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                            title="Generate a new quote for this customer"
                          >
                            <FilePlus className="w-3.5 h-3.5" />
                            <span>Create Quote</span>
                          </button>

                          <button
                            onClick={() => alert(`Viewing full details for ${quote.customer} (${quote.id})`)}
                            className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            title="View Quote Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-400">
                      <p className="text-lg font-bold text-slate-600">No quotes found</p>
                      <p className="text-sm mt-1">Try adjusting your search query or status filter.</p>
                      <button
                        onClick={handleAddNewQuote}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md"
                      >
                        + Create New Quote
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Stats */}
          <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-xs font-semibold text-slate-500 flex justify-between items-center">
            <span>Showing {filteredQuotes.length} of {quotesList.length} customer records</span>
            <span>InsureAI Copilot active</span>
          </div>
        </div>

      </div>
    );
  }

  // -------------------------------------------------------------
  // 5-STEP QUOTE GENERATOR VIEW (when isCreatingQuote === true)
  // -------------------------------------------------------------
  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      
      {/* Generator Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Motor Quote Engine Wizard</h1>
            <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-100">
              5-Step Assistant
            </span>
          </div>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Calculating IDV for {customerName} ({selectedMake} {selectedModel})
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreatingQuote(false)}
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Customer Table</span>
        </button>
      </div>

      {/* Stepper Progress Bar Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center justify-center">
          <div className="flex items-center w-full max-w-4xl">
            {steps.map((s, idx) => (
              <React.Fragment key={s.num}>
                <div
                  className="flex flex-col items-center relative z-10 cursor-pointer"
                  onClick={() => s.num < step && setStep(s.num)}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      step >= s.num
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                        : "bg-slate-100 text-slate-400 border-2 border-slate-200"
                    }`}
                  >
                    {step > s.num ? <Check className="w-5 h-5 stroke-[3]" /> : s.num}
                  </div>
                  <span
                    className={`text-xs font-semibold mt-2.5 whitespace-nowrap ${
                      step >= s.num ? "text-slate-900 font-bold" : "text-slate-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>

                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 rounded-full transition-all ${
                      step > s.num ? "bg-blue-600" : "bg-slate-200"
                    }`}
                  ></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main Form Content */}
      <div className="space-y-6">

        {/* STEP 1: CUSTOMER DETAILS */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm max-w-3xl mx-auto animate-in slide-in-from-bottom-4">
            <h2 className="text-xl font-extrabold text-slate-900">Step 1: Customer Details</h2>
            <p className="text-sm text-slate-500 mt-1 mb-8">Confirm customer information to calculate localized risk and RTO zone.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Mobile Number <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="e.g. rahul@example.com"
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">City / RTO Zone <span className="text-red-500">*</span></label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm font-medium outline-none bg-white transition-all"
                >
                  <option value="Mumbai">Mumbai (Zone A - Flood Risk)</option>
                  <option value="Delhi">Delhi NCR (Zone A)</option>
                  <option value="Bengaluru">Bengaluru (Zone A)</option>
                  <option value="Pune">Pune (Zone B)</option>
                  <option value="Chennai">Chennai (Zone A)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2.5">
              <input
                type="checkbox"
                id="existingCustomerCheck"
                checked={isExistingCustomer}
                onChange={(e) => setIsExistingCustomer(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="existingCustomerCheck" className="text-sm font-medium text-slate-700 cursor-pointer">
                Existing Customer (Pre-filled from CRM database)
              </label>
            </div>

            <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCreatingQuote(false)}
                className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                Save & Continue <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: VEHICLE DETAILS */}
        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm">
              <h2 className="text-xl font-extrabold text-slate-900">Step 2: Vehicle Details</h2>
              <p className="text-sm text-slate-500 mt-1 mb-8">Select the vehicle make, model, and registration year to calculate Insured Declared Value (IDV).</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Make <span className="text-red-500">*</span></label>
                  <select
                    value={selectedMake}
                    onChange={(e) => setSelectedMake(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium outline-none bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option value="Hyundai">Hyundai</option>
                    <option value="Tata">Tata</option>
                    <option value="Maruti">Maruti</option>
                    <option value="Honda">Honda</option>
                    <option value="Mahindra">Mahindra</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Model <span className="text-red-500">*</span></label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium outline-none bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option value="Creta">Creta</option>
                    <option value="i20">i20</option>
                    <option value="Verna">Verna</option>
                    <option value="Nexon">Nexon</option>
                    <option value="Baleno">Baleno</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Manufacturing Year <span className="text-red-500">*</span></label>
                  <select
                    value={regYear}
                    onChange={(e) => setRegYear(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium outline-none bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option value="2025">2025 (New)</option>
                    <option value="2024">2024 (1 Yr Old)</option>
                    <option value="2023">2023 (2 Yrs Old)</option>
                    <option value="2022">2022 (3 Yrs Old)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Fuel Type <span className="text-red-500">*</span></label>
                  <select
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium outline-none bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="EV">EV (Electric)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Engine Capacity (CC)</label>
                  <input
                    type="text"
                    readOnly
                    value={`${currentVehicle.engineCc} cc`}
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm font-medium outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Ex-showroom Price</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₹</span>
                    <input
                      type="text"
                      readOnly
                      value={exShowroom.toLocaleString("en-IN")}
                      className="w-full p-3 pl-8 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-bold outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-10 flex items-center justify-between pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 flex items-center gap-2"
                >
                  Calculate Premium <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Vehicle Summary Card */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-6">IDV Calculation Summary</h3>

                <div className="w-full h-36 bg-slate-200/70 rounded-xl flex flex-col items-center justify-center text-slate-400 mb-6 border border-slate-200">
                  <Car className="w-16 h-16 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500 mt-2">{selectedMake} {selectedModel}</span>
                </div>

                <h4 className="text-xl font-extrabold text-slate-900 mb-4">{selectedMake} {selectedModel} ({regYear})</h4>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Engine</span>
                    <span className="block text-sm font-bold text-slate-800 mt-0.5">{currentVehicle.engineCc} cc</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Fuel</span>
                    <span className="block text-sm font-bold text-slate-800 mt-0.5">{fuelType}</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex justify-between items-center text-xs text-slate-500 font-medium mb-1">
                    <span>Ex-Showroom Price</span>
                    <span>₹{exShowroom.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 font-medium mb-2">
                    <span>Depreciation ({vehicleAgeYears <= 1 ? "10%" : "20%"})</span>
                    <span className="text-rose-600">- ₹{(exShowroom - idv).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-sm">Calculated IDV</span>
                    <span className="font-extrabold text-blue-700 text-base">₹{idv.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: COVERAGE & ADD-ONS */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm animate-in slide-in-from-bottom-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Step 3: Recommended Add-ons</h2>
                <p className="text-sm text-slate-500 mt-1">Based on vehicle profile ({selectedMake} {selectedModel}) and city risk profile ({selectedCity}).</p>
              </div>
              <div className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-xl border border-purple-100 text-xs font-bold flex items-center gap-1.5 self-start">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>AI Recommendation Active</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              
              {/* Zero Dep Card */}
              <div
                onClick={() => toggleAddon("zero_dep")}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative ${
                  selectedAddonIds.includes("zero_dep")
                    ? "border-blue-600 bg-blue-50/20 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <span className="bg-purple-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">AI Top Pick</span>
                      <h4 className="font-bold text-slate-900 text-base mt-0.5">Zero Depreciation</h4>
                      <p className="font-extrabold text-blue-700 text-lg">₹4,200</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedAddonIds.includes("zero_dep")}
                    onChange={() => {}}
                    className="w-5 h-5 text-blue-600 rounded-md border-slate-300"
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  Highly recommended for vehicles {"<="} 5 years old. Pays full cost of parts replacement without depreciation deduction.
                </p>
                <div className="flex items-center justify-between">
                  <span className="bg-teal-50 text-teal-700 text-[11px] font-bold px-2.5 py-1 rounded-lg">Recommended</span>
                  <span className="text-xs font-semibold text-slate-500">Adds ~₹4,200</span>
                </div>
              </div>

              {/* RSA Card */}
              <div
                onClick={() => toggleAddon("rsa")}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative ${
                  selectedAddonIds.includes("rsa")
                    ? "border-blue-600 bg-blue-50/20 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Phone className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">Roadside Assistance</h4>
                      <p className="font-extrabold text-blue-700 text-lg">₹1,200</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedAddonIds.includes("rsa")}
                    onChange={() => {}}
                    className="w-5 h-5 text-blue-600 rounded-md border-slate-300"
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  24x7 emergency assistance including towing, battery jumpstart, flat tire change, and fuel delivery.
                </p>
                <div className="flex items-center justify-between">
                  <span className="bg-blue-50 text-blue-700 text-[11px] font-bold px-2.5 py-1 rounded-lg">Recommended</span>
                  <span className="text-xs font-semibold text-slate-500">Adds ~₹1,200</span>
                </div>
              </div>

              {/* Engine Protection Card */}
              <div
                onClick={() => toggleAddon("engine_protect")}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative ${
                  selectedAddonIds.includes("engine_protect")
                    ? "border-blue-600 bg-blue-50/20 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">Engine Protection</h4>
                      <p className="font-extrabold text-blue-700 text-lg">₹1,800</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedAddonIds.includes("engine_protect")}
                    onChange={() => {}}
                    className="w-5 h-5 text-blue-600 rounded-md border-slate-300"
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  Essential for flood-prone metro cities like {selectedCity}. Protects against hydrostatic lock and oil leakage.
                </p>
                <div className="flex items-center justify-between">
                  <span className="bg-amber-50 text-amber-700 text-[11px] font-bold px-2.5 py-1 rounded-lg">High Risk Area</span>
                  <span className="text-xs font-semibold text-slate-500">Adds ~₹1,800</span>
                </div>
              </div>

            </div>

            <div className="mt-10 flex items-center justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                Continue to Compare <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: COMPARE PLANS */}
        {step === 4 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm animate-in slide-in-from-bottom-4">
            <h2 className="text-xl font-extrabold text-slate-900">Step 4: Compare Insurance Plans</h2>
            <p className="text-sm text-slate-500 mt-1 mb-8">Compare coverage options and choose the plan for your customer.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Basic Plan */}
              <div
                onClick={() => setSelectedPlanTier("Basic")}
                className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  selectedPlanTier === "Basic"
                    ? "border-blue-600 bg-blue-50/20 shadow-md ring-2 ring-blue-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Third Party Only</span>
                    {selectedPlanTier === "Basic" && <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Selected</span>}
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">Basic Plan</h3>
                  <div className="mt-4 mb-6">
                    <span className="text-3xl font-black text-slate-900">₹{Math.round(grossPremium * 0.85).toLocaleString("en-IN")}</span>
                    <span className="text-xs text-slate-500 block font-medium mt-1">+ GST 18%</span>
                  </div>

                  <ul className="space-y-3 text-xs font-medium text-slate-700">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Third-party Liability Cover
                    </li>
                    <li className="flex items-center gap-2 text-slate-400">
                      <span className="w-4 text-center">✕</span> Own Damage Cover (Not included)
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPlanTier("Basic");
                    setStep(5);
                  }}
                  className={`w-full py-3 rounded-xl font-bold text-sm mt-8 transition-all ${
                    selectedPlanTier === "Basic"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Select Basic
                </button>
              </div>

              {/* Standard Plan (Recommended) */}
              <div
                onClick={() => setSelectedPlanTier("Standard")}
                className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative ${
                  selectedPlanTier === "Standard"
                    ? "border-blue-600 bg-blue-50/30 shadow-lg ring-2 ring-blue-500/20"
                    : "border-blue-300 bg-white hover:border-blue-400"
                }`}
              >
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-extrabold px-3 py-1 rounded-full shadow-md uppercase tracking-wider">
                  Most Popular & Recommended
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2 mt-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Comprehensive</span>
                    {selectedPlanTier === "Standard" && <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Selected</span>}
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">Standard Plan</h3>
                  <div className="mt-4 mb-6">
                    <span className="text-3xl font-black text-blue-700">₹{grossPremium.toLocaleString("en-IN")}</span>
                    <span className="text-xs text-slate-500 block font-medium mt-1">+ GST 18%</span>
                  </div>

                  <ul className="space-y-3 text-xs font-medium text-slate-700">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Own Damage Cover
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Third-party Liability Cover
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Zero Depreciation included
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPlanTier("Standard");
                    setStep(5);
                  }}
                  className="w-full py-3 rounded-xl font-bold text-sm mt-8 bg-blue-600 text-white shadow-md shadow-blue-500/30 hover:bg-blue-700 transition-all"
                >
                  Select Standard Plan
                </button>
              </div>

              {/* Premium Plan */}
              <div
                onClick={() => setSelectedPlanTier("Premium")}
                className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  selectedPlanTier === "Premium"
                    ? "border-purple-600 bg-purple-50/20 shadow-md ring-2 ring-purple-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-600">Full Protection</span>
                    {selectedPlanTier === "Premium" && <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Selected</span>}
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">Premium Plan</h3>
                  <div className="mt-4 mb-6">
                    <span className="text-3xl font-black text-purple-700">₹{Math.round(grossPremium * 1.25).toLocaleString("en-IN")}</span>
                    <span className="text-xs text-slate-500 block font-medium mt-1">+ GST 18%</span>
                  </div>

                  <ul className="space-y-3 text-xs font-medium text-slate-700">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" /> All Standard features included
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Engine & Gearbox Protection
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPlanTier("Premium");
                    setStep(5);
                  }}
                  className={`w-full py-3 rounded-xl font-bold text-sm mt-8 transition-all ${
                    selectedPlanTier === "Premium"
                      ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Select Premium
                </button>
              </div>

            </div>

            <div className="mt-10 flex items-center justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                Generate Final Quote <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: GENERATE QUOTE SUMMARY */}
        {step === 5 && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
            
            {/* Header notification banner */}
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Quote Generated Successfully!</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Quote ID <span className="font-bold text-slate-900">QT-2026-9842</span> has been created for {customerName}.
                  </p>
                </div>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
                Ready to Send
              </span>
            </div>

            {/* Quote Details Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Customer & Vehicle Overview Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
                <h3 className="font-extrabold text-slate-900 text-lg border-b border-slate-100 pb-3">Customer Profile</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Customer Name</span>
                    <span className="font-bold text-slate-900">{customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mobile</span>
                    <span className="font-bold text-slate-900">{customerPhone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email</span>
                    <span className="font-bold text-slate-900">{customerEmail}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">City / RTO Zone</span>
                    <span className="font-bold text-slate-900">{selectedCity}</span>
                  </div>
                </div>

                <h3 className="font-extrabold text-slate-900 text-lg border-b border-slate-100 pb-3 pt-4">Vehicle Summary</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Make & Model</span>
                    <span className="font-bold text-slate-900">{selectedMake} {selectedModel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reg. Year & Fuel</span>
                    <span className="font-bold text-slate-900">{regYear} ({fuelType})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Calculated IDV</span>
                    <span className="font-bold text-blue-700">₹{idv.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>

              {/* Premium Breakdown Card (2 cols) */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">Premium Breakdown</h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">Plan Tier: <span className="font-bold text-blue-600">{selectedPlanTier} Plan</span></p>
                    </div>
                    <span className="text-xs bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full">Annual Policy</span>
                  </div>

                  <div className="space-y-3.5 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Own Damage (OD) Premium</span>
                      <span className="font-bold text-slate-900">₹{basePremium.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Third Party (TP) Premium</span>
                      <span className="font-bold text-slate-900">₹7,500</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Selected Add-ons ({selectedAddonIds.length})</span>
                      <span className="font-bold text-slate-900">₹{addonsTotalCost.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600">
                      <span>No Claim Bonus (NCB 25%)</span>
                      <span className="font-bold">- ₹{Math.round(basePremium * 0.25).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 border-t border-slate-100 pt-3">
                      <span>Net Premium</span>
                      <span className="font-bold text-slate-900">₹{grossPremium.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>GST (18%)</span>
                      <span className="font-bold text-slate-900">₹{gstAmount.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50/70 p-5 rounded-xl border border-blue-100 flex justify-between items-center mt-6">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Payable Premium</span>
                    <span className="text-2xl font-black text-blue-700">₹{finalPremium.toLocaleString("en-IN")}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">Includes 18% GST</span>
                </div>
              </div>

            </div>

            {/* Quick Actions Footer */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4">
              <button
                type="button"
                onClick={() => alert("Downloading Quote PDF...")}
                className="py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 text-slate-600" /> Download PDF
              </button>
              
              <button
                type="button"
                onClick={() => alert(`Sending quote to WhatsApp (${customerPhone})...`)}
                className="py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> Send via WhatsApp
              </button>
              
              <button
                type="button"
                onClick={() => alert(`Sending quote to Email (${customerEmail})...`)}
                className="py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <MailIcon className="w-4 h-4" /> Send via Email
              </button>
              
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="py-3.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Save & Return to Table
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
