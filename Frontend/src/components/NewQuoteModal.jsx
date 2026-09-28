import React, { useState, useMemo } from "react";
import {
  X,
  Car,
  ChevronLeft,
  ChevronRight,
  Shield,
  Phone,
  Mail,
  MapPin,
  Check,
  AlertCircle,
  FileText,
  CheckCircle2,
  Download,
  MessageCircle,
  Mail as MailIcon,
} from "lucide-react";
import {
  INITIAL_VEHICLE_MASTER,
  CITY_ZONES,
  ADDONS_MASTER,
} from "../data/mockData";

export default function NewQuoteModal({ isOpen, onClose, onSaveQuote, isPage = false }) {
  if (!isOpen && !isPage) return null;

  const [step, setStep] = useState(1);

  // Form State
  const [customerName, setCustomerName] = useState("Rahul Sharma");
  const [customerPhone, setCustomerPhone] = useState("9876543210");
  const [customerEmail, setCustomerEmail] = useState("rahul@gmail.com");
  const [selectedCity, setSelectedCity] = useState("Mumbai");

  // Vehicle Selection
  const [selectedMake, setSelectedMake] = useState("Hyundai");
  const [selectedModel, setSelectedModel] = useState("Creta");
  const [regYear, setRegYear] = useState(2025);
  const [fuelType, setFuelType] = useState("Petrol");
  
  // Custom Ex-Showroom override (for UI matching)
  const [customExShowroom, setCustomExShowroom] = useState(1750000);

  // Selected Plan
  const [selectedPlanTier, setSelectedPlanTier] = useState("Standard");

  // Selected Addons
  const [selectedAddonIds, setSelectedAddonIds] = useState(["zero_dep", "rsa"]);

  const currentVehicle = useMemo(() => {
    return (
      INITIAL_VEHICLE_MASTER.find(
        (v) => v.make === selectedMake && v.model === selectedModel
      ) || INITIAL_VEHICLE_MASTER[0]
    );
  }, [selectedMake, selectedModel]);

  const vehicleAgeYears = Math.max(1, 2026 - Number(regYear));

  // Hardcoded IDV and Premiums to match exactly the screenshot for Step 4
  const idv = 1575000;
  const rawOdPremium = 38375;
  const tpPremium = 7500;
  const ncbDiscountAmount = 5906;
  const zeroDepPrice = 4200;
  const rsaPrice = 1200;
  const engineProtectPrice = 1800;

  // Plan Premiums
  const basicPremium = 41000;
  const standardPremium = 43500;
  const premiumPlanPrice = 47800;
  const finalPremium = 46369; // From screenshot

  const handleFinalSubmit = () => {
    const newQuoteObj = {
      id: `QT-2026-${Math.floor(800 + Math.random() * 199)}`,
      avatar: customerName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2),
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
    onSaveQuote(newQuoteObj);
    onClose();
  };

  const steps = [
    { num: 1, label: "Customer" },
    { num: 2, label: "Vehicle" },
    { num: 3, label: "Coverage" },
    { num: 4, label: "Compare" },
    { num: 5, label: "Generate Quote" },
  ];

  const content = (
    <div className={`bg-white w-full flex flex-col overflow-hidden ${
      isPage 
        ? "rounded-2xl border border-slate-200/80 shadow-sm min-h-[calc(100vh-110px)] animate-in fade-in duration-200" 
        : "max-w-6xl h-full max-h-[90vh] rounded-2xl shadow-2xl"
    }`}>
      {/* Header */}
      {isPage ? (
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>
            <h1 className="text-lg font-bold text-slate-900">New Motor Insurance Quote</h1>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex justify-end p-4 pb-0">
          <button onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

        {/* Stepper */}
        <div className="px-10 pt-2 pb-6 flex items-center justify-center">
          <div className="flex items-center w-full max-w-3xl">
            {steps.map((s, idx) => (
              <React.Fragment key={s.num}>
                <div className="flex flex-col items-center relative z-10 w-24">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      step >= s.num
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                        : "bg-white text-slate-400 border-2 border-slate-200"
                    }`}
                  >
                    {s.num}
                  </div>
                  <span
                    className={`text-[11px] font-semibold mt-2 absolute top-8 whitespace-nowrap ${
                      step >= s.num ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 transition-all ${
                      step > s.num ? "bg-blue-600" : "bg-slate-200"
                    }`}
                  ></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-10 pb-10">
          
          {/* STEP 1: CUSTOMER */}
          {step === 1 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm max-w-3xl mx-auto mt-4 animate-in slide-in-from-bottom-4">
              <h2 className="text-xl font-extrabold text-slate-900">Customer Details</h2>
              <p className="text-sm text-slate-500 mt-1 mb-8">Enter customer information to create a new quote.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Full Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-medium outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Mobile Number <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-medium outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-medium outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">City <span className="text-red-500">*</span></label>
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-medium outline-none bg-white"
                  >
                    <option value="Mumbai">Mumbai</option>
                    <option value="Delhi">Delhi</option>
                    <option value="Bengaluru">Bengaluru</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-slate-600">Existing customer</span>
              </div>

              <div className="mt-10 flex items-center justify-end gap-3">
                <button onClick={onClose} className="px-6 py-2.5 rounded-lg font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-lg font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 flex items-center gap-2">
                  Save & Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: VEHICLE */}
          {step === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 animate-in slide-in-from-bottom-4">
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <h2 className="text-xl font-extrabold text-slate-900">Vehicle Details</h2>
                <p className="text-sm text-slate-500 mt-1 mb-8">Select the vehicle information.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Make <span className="text-red-500">*</span></label>
                    <select value={selectedMake} onChange={(e) => setSelectedMake(e.target.value)} className="w-full p-3 rounded-lg border border-slate-200 text-sm font-medium outline-none bg-white focus:border-blue-500">
                      <option value="Hyundai">Hyundai</option>
                      <option value="Tata">Tata</option>
                      <option value="Maruti">Maruti</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Model <span className="text-red-500">*</span></label>
                    <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full p-3 rounded-lg border border-slate-200 text-sm font-medium outline-none bg-white focus:border-blue-500">
                      <option value="Creta">Creta</option>
                      <option value="i20">i20</option>
                      <option value="Verna">Verna</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Manufacturing Year <span className="text-red-500">*</span></label>
                    <select value={regYear} onChange={(e) => setRegYear(e.target.value)} className="w-full p-3 rounded-lg border border-slate-200 text-sm font-medium outline-none bg-white focus:border-blue-500">
                      <option value="2025">2025</option>
                      <option value="2024">2024</option>
                      <option value="2023">2023</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Fuel Type <span className="text-red-500">*</span></label>
                    <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="w-full p-3 rounded-lg border border-slate-200 text-sm font-medium outline-none bg-white focus:border-blue-500">
                      <option value="Petrol">Petrol</option>
                      <option value="Diesel">Diesel</option>
                      <option value="EV">EV</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Engine Capacity (CC)</label>
                    <input type="text" readOnly value="1497 cc" className="w-full p-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-sm font-medium outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Ex-showroom Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₹</span>
                      <input type="text" readOnly value="17,50,000" className="w-full p-3 pl-7 rounded-lg border border-slate-200 text-sm font-bold outline-none text-slate-800" />
                    </div>
                  </div>
                </div>

                <div className="mt-10 flex items-center justify-end gap-3">
                  <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-lg font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button onClick={() => setStep(3)} className="px-6 py-2.5 rounded-lg font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 flex items-center gap-2">
                    Calculate Premium <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Right Sidebar Vehicle Info */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center">
                <h3 className="text-lg font-bold text-slate-900 self-start w-full mb-6">Vehicle Information</h3>
                
                <div className="w-full max-w-[240px] mb-6">
                  {/* Mocking car image with a generic UI representation if no actual image */}
                  <div className="w-full h-32 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400">
                     <Car className="w-16 h-16" />
                  </div>
                </div>

                <h4 className="text-xl font-extrabold text-slate-900 w-full mb-6">Hyundai Creta 2025</h4>

                <div className="w-full grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Engine</span>
                    <span className="block text-sm font-bold text-slate-800 mt-1">1497 cc</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Fuel</span>
                    <span className="block text-sm font-bold text-slate-800 mt-1">Petrol</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase leading-tight">Ex-showroom<br/>Price</span>
                    <span className="block text-sm font-bold text-slate-800 mt-1">₹17,50,000</span>
                  </div>
                </div>

                <div className="w-full bg-white border border-slate-200 rounded-lg p-3">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Vehicle Age</span>
                  <span className="block text-sm font-bold text-slate-800 mt-1">1 year</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: COVERAGE / ADDONS */}
          {step === 3 && (
            <div className="mt-4 animate-in slide-in-from-bottom-4">
              <h2 className="text-xl font-extrabold text-slate-900">Recommended Add-ons</h2>
              <p className="text-sm text-slate-500 mt-1 mb-6">Based on vehicle profile, location and rules</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Zero Dep Card */}
                <div className="p-4 rounded-xl border-2 border-blue-500 bg-white shadow-sm flex flex-col justify-between relative cursor-pointer hover:border-blue-600 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <span className="absolute -top-3 left-16 bg-purple-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">AI Recommended</span>
                        <h4 className="font-bold text-slate-900 text-sm">Zero Depreciation</h4>
                        <p className="font-extrabold text-slate-900 mt-0.5">₹4,200</p>
                      </div>
                    </div>
                    <input type="checkbox" readOnly checked className="w-5 h-5 text-blue-600 rounded border-slate-300 pointer-events-none" />
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">Recommended because vehicle age is {"<="} 5 years. Covers depreciation on parts.</p>
                  <div>
                    <span className="bg-teal-50 text-teal-700 text-[10px] font-bold px-2.5 py-1 rounded-md">Recommended</span>
                  </div>
                </div>

                {/* RSA Card */}
                <div className="p-4 rounded-xl border-2 border-blue-500 bg-white shadow-sm flex flex-col justify-between relative cursor-pointer hover:border-blue-600 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Phone className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Roadside Assistance</h4>
                        <p className="font-extrabold text-slate-900 mt-0.5">₹1,200</p>
                      </div>
                    </div>
                    <input type="checkbox" readOnly checked className="w-5 h-5 text-blue-600 rounded border-slate-300 pointer-events-none" />
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">24x7 roadside assistance for breakdowns, towing, etc.</p>
                  <div>
                    <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-md">Recommended</span>
                  </div>
                </div>

                {/* Engine Protection Card */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between cursor-pointer hover:border-blue-300 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Engine Protection</h4>
                        <p className="font-extrabold text-slate-900 mt-0.5">₹1,800</p>
                      </div>
                    </div>
                    <input type="checkbox" readOnly className="w-5 h-5 text-blue-600 rounded border-slate-300 pointer-events-none" />
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">Useful in flood-prone cities like Mumbai. Covers engine damage due to water ingress.</p>
                  <div>
                    <span className="bg-purple-50 text-purple-700 text-[10px] font-bold px-2.5 py-1 rounded-md">Recommended</span>
                  </div>
                </div>

                {/* Consumables Cover */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between cursor-pointer hover:border-blue-300 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Consumables Cover</h4>
                        <p className="font-extrabold text-slate-900 mt-0.5">₹900</p>
                      </div>
                    </div>
                    <input type="checkbox" readOnly className="w-5 h-5 text-blue-600 rounded border-slate-300 pointer-events-none" />
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">Covers consumable items like nuts, bolts, oil, filters, etc.</p>
                </div>

                {/* Return to Invoice */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between cursor-pointer hover:border-blue-300 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Return to Invoice</h4>
                        <p className="font-extrabold text-slate-900 mt-0.5">₹1,500</p>
                      </div>
                    </div>
                    <input type="checkbox" readOnly className="w-5 h-5 text-blue-600 rounded border-slate-300 pointer-events-none" />
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">In case of total loss, get the invoice value back.</p>
                </div>

                {/* Key Replacement */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between cursor-pointer hover:border-blue-300 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Key Replacement</h4>
                        <p className="font-extrabold text-slate-900 mt-0.5">₹500</p>
                      </div>
                    </div>
                    <input type="checkbox" readOnly className="w-5 h-5 text-blue-600 rounded border-slate-300 pointer-events-none" />
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">Covers cost of lost or damaged keys.</p>
                </div>

              </div>

              <div className="mt-10 flex items-center justify-between border-t border-slate-100 pt-6">
                 <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-lg font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2">
                    <ChevronLeft className="w-4 h-4" /> Back
                 </button>
                 <button onClick={() => setStep(4)} className="px-6 py-2.5 rounded-lg font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 flex items-center gap-2">
                    Continue to Compare <ChevronRight className="w-4 h-4" />
                 </button>
              </div>
            </div>
          )}

          {/* STEP 4: COMPARE PLANS */}
          {step === 4 && (
            <div className="mt-4 animate-in slide-in-from-bottom-4">
              <h2 className="text-xl font-extrabold text-slate-900">Compare Insurance Plans</h2>
              <p className="text-sm text-slate-500 mt-1 mb-8">Choose the best plan for your customer.</p>

              <div className="flex flex-col lg:flex-row gap-6">
                
                {/* Plans Table Container */}
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full text-center border-separate border-spacing-y-0 border-spacing-x-3 min-w-[700px]">
                    <thead>
                      <tr>
                        <th className="text-left pb-4 font-bold text-slate-600 text-sm border-b border-slate-200">Coverage</th>
                        <th className="pb-4 border-b border-slate-200">
                           <div className="bg-blue-50 text-blue-700 font-bold py-3 rounded-t-2xl border-x border-t border-blue-100 text-base">Basic</div>
                        </th>
                        <th className="pb-4 relative border-b-0">
                           <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap shadow-sm z-10">Most Popular</span>
                           <div className="bg-blue-600 text-white font-bold py-3 rounded-t-2xl shadow-md text-base relative z-0">Standard</div>
                        </th>
                        <th className="pb-4 border-b border-slate-200">
                           <div className="bg-purple-50 text-purple-700 font-bold py-3 rounded-t-2xl border-x border-t border-purple-100 text-base">Premium</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-700 font-medium">
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">Insured Declared Value (IDV)</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100">₹ 15,75,000</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 font-bold">₹ 15,75,000</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100">₹ 15,75,000</td>
                      </tr>
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">Own Damage Premium</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100">₹ 38,375</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 font-bold">₹ 38,375</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100">₹ 38,375</td>
                      </tr>
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">Third Party Premium</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100">₹ 7,500</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 font-bold">₹ 7,500</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100">₹ 7,500</td>
                      </tr>
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">NCB Discount</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100">- ₹ 5,906</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 font-bold">- ₹ 5,906</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100">- ₹ 5,906</td>
                      </tr>
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">Zero Depreciation</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100 text-red-500 font-bold">✕</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 text-green-500 font-bold">✓</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100 text-green-500 font-bold">✓</td>
                      </tr>
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">Roadside Assistance</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100 text-red-500 font-bold">✕</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 text-green-500 font-bold">✓</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100 text-green-500 font-bold">✓</td>
                      </tr>
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">Engine Protection</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100 text-red-500 font-bold">✕</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 text-green-500 font-bold">✓</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100 text-green-500 font-bold">✓</td>
                      </tr>
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">Consumables Cover</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100 text-red-500 font-bold">✕</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 text-slate-300 font-bold">○</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100 text-green-500 font-bold">✓</td>
                      </tr>
                      <tr>
                        <td className="text-left py-4 border-b border-slate-100">Return to Invoice</td>
                        <td className="py-4 border-b border-slate-100 bg-blue-50/30 border-x border-blue-100 text-red-500 font-bold">✕</td>
                        <td className="py-4 border-b border-slate-100 bg-white border-x-2 border-blue-500 text-red-500 font-bold">✕</td>
                        <td className="py-4 border-b border-slate-100 bg-purple-50/30 border-x border-purple-100 text-green-500 font-bold">✓</td>
                      </tr>
                      <tr>
                        <td className="text-left py-5 font-bold text-slate-900 text-base">Total Premium</td>
                        <td className="py-5 font-bold text-slate-900 text-base bg-blue-50/30 border-x border-blue-100">₹ 41,000</td>
                        <td className="py-5 font-bold text-slate-900 text-base bg-white border-x-2 border-blue-500">₹ 43,500</td>
                        <td className="py-5 font-bold text-slate-900 text-base bg-purple-50/30 border-x border-purple-100">₹ 47,800</td>
                      </tr>
                      <tr>
                        <td className="border-t border-slate-200"></td>
                        <td className="p-3 bg-blue-50/30 border-x border-b border-blue-100 rounded-b-2xl">
                           <button className="w-full py-2.5 rounded-lg bg-blue-100 text-blue-700 font-bold text-sm hover:bg-blue-200 transition-colors">Select Plan</button>
                        </td>
                        <td className="p-3 bg-white border-x-2 border-b-2 border-blue-500 rounded-b-2xl">
                           <button className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm shadow-md hover:bg-blue-700 transition-colors">Select Plan</button>
                        </td>
                        <td className="p-3 bg-purple-50/30 border-x border-b border-purple-100 rounded-b-2xl">
                           <button className="w-full py-2.5 rounded-lg bg-purple-100 text-purple-700 font-bold text-sm hover:bg-purple-200 transition-colors">Select Plan</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Right Sidebar Breakdown */}
                <div className="w-full lg:w-[320px] shrink-0 bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col">
                  <h3 className="font-extrabold text-slate-900 text-lg">Premium Breakdown</h3>
                  <p className="text-xs text-slate-500 mb-6 font-medium">(Standard Plan)</p>

                  <div className="space-y-4 text-sm font-medium text-slate-600 flex-1">
                     <div className="flex justify-between">
                       <span>IDV</span>
                       <span className="font-bold text-slate-900">₹15,75,000</span>
                     </div>
                     <div className="flex justify-between">
                       <span>Own Damage Premium</span>
                       <span className="font-bold text-slate-900">₹38,375</span>
                     </div>
                     <div className="flex justify-between">
                       <span>Third Party Premium</span>
                       <span className="font-bold text-slate-900">₹7,500</span>
                     </div>
                     <div className="flex justify-between">
                       <span>NCB Discount</span>
                       <span className="font-bold text-emerald-600">- ₹5,906</span>
                     </div>
                     <div className="flex justify-between">
                       <span>Zero Depreciation</span>
                       <span className="font-bold text-slate-900">₹4,200</span>
                     </div>
                     <div className="flex justify-between border-b border-slate-200 pb-4">
                       <span>Roadside Assistance</span>
                       <span className="font-bold text-slate-900">₹1,200</span>
                     </div>
                     <div className="flex justify-between pt-2">
                       <span className="font-extrabold text-slate-900 text-base">Final Premium</span>
                       <span className="font-extrabold text-blue-700 text-xl">₹46,369</span>
                     </div>
                  </div>

                  <div className="mt-8">
                     <button onClick={() => setStep(5)} className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold text-sm shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                        Continue to Generate Quote <ChevronRight className="w-4 h-4" />
                     </button>
                     <button onClick={() => setStep(3)} className="w-full py-3 mt-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors">
                        Back
                     </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* STEP 5: GENERATE QUOTE */}
          {step === 5 && (
            <div className="mt-4 max-w-4xl mx-auto animate-in zoom-in-95 duration-300">
              
              {/* Success Banner */}
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                  <Check className="w-7 h-7 stroke-[3]" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Quote Generated Successfully!</h2>
                  <p className="text-slate-500 font-medium">The quote has been created and is ready to share with the customer.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Quote Summary Left */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                   <h3 className="text-lg font-bold text-slate-900 mb-6">Quote Summary</h3>
                   
                   <div className="space-y-4 text-sm">
                      <div className="grid grid-cols-2">
                         <span className="text-slate-500 font-medium">Customer</span>
                         <span className="font-bold text-slate-900">{customerName}</span>
                      </div>
                      <div className="grid grid-cols-2">
                         <span className="text-slate-500 font-medium">Mobile</span>
                         <span className="font-bold text-slate-900">{customerPhone}</span>
                      </div>
                      <div className="grid grid-cols-2">
                         <span className="text-slate-500 font-medium">Email</span>
                         <span className="font-bold text-slate-900">{customerEmail}</span>
                      </div>
                      <div className="grid grid-cols-2">
                         <span className="text-slate-500 font-medium">City</span>
                         <span className="font-bold text-slate-900">{selectedCity}</span>
                      </div>
                      
                      <div className="h-px bg-slate-100 my-2"></div>
                      
                      <div className="grid grid-cols-2">
                         <span className="text-slate-500 font-medium">Vehicle</span>
                         <span className="font-bold text-slate-900">{selectedMake} {selectedModel} {regYear}</span>
                      </div>
                      <div className="grid grid-cols-2">
                         <span className="text-slate-500 font-medium">Engine</span>
                         <span className="font-bold text-slate-900">1497 cc</span>
                      </div>
                      <div className="grid grid-cols-2">
                         <span className="text-slate-500 font-medium">Fuel</span>
                         <span className="font-bold text-slate-900">{fuelType}</span>
                      </div>
                      <div className="grid grid-cols-2">
                         <span className="text-slate-500 font-medium">Ex-showroom Price</span>
                         <span className="font-bold text-slate-900">₹17,50,000</span>
                      </div>
                   </div>
                </div>

                {/* Selected Plan Right */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                   <div className="p-6 pb-4">
                      <span className="text-xs font-bold text-slate-500">Selected Plan</span>
                      <h3 className="text-xl font-bold text-blue-700 mt-1">{selectedPlanTier}</h3>
                   </div>
                   
                   <div className="px-6 space-y-3.5 text-sm font-medium text-slate-600 flex-1">
                      <div className="flex justify-between">
                         <span>Insured Declared Value (IDV)</span>
                         <span className="font-bold text-slate-900">₹15,75,000</span>
                      </div>
                      <div className="flex justify-between">
                         <span>Own Damage Premium</span>
                         <span className="font-bold text-slate-900">₹38,375</span>
                      </div>
                      <div className="flex justify-between">
                         <span>Third Party Premium</span>
                         <span className="font-bold text-slate-900">₹7,500</span>
                      </div>
                      <div className="flex justify-between">
                         <span>NCB Discount</span>
                         <span className="font-bold text-emerald-600">- ₹5,906</span>
                      </div>
                      <div className="flex justify-between">
                         <span>Zero Depreciation</span>
                         <span className="font-bold text-slate-900">₹4,200</span>
                      </div>
                      <div className="flex justify-between pb-4">
                         <span>Roadside Assistance</span>
                         <span className="font-bold text-slate-900">₹1,200</span>
                      </div>
                   </div>
                   
                   <div className="bg-blue-50/50 p-6 border-t border-slate-100 flex justify-between items-center mt-auto">
                      <span className="font-extrabold text-slate-900 text-lg">Final Premium</span>
                      <span className="font-black text-blue-700 text-2xl">₹46,369</span>
                   </div>
                </div>

              </div>

              {/* Action Buttons Footer */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-4 gap-4">
                 <button className="py-3.5 rounded-xl border-2 border-blue-100 bg-white hover:bg-blue-50 text-blue-700 font-bold text-sm transition-colors flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> Download PDF
                 </button>
                 <button className="py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2">
                    <MessageCircle className="w-4 h-4" /> Send via WhatsApp
                 </button>
                 <button className="py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2">
                    <MailIcon className="w-4 h-4" /> Send via Email
                 </button>
                 <button onClick={handleFinalSubmit} className="py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Mark as Converted
                 </button>
              </div>

            </div>
          )}

        </div>
    </div>
  );

  if (isPage) {
    return content;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
      {content}
    </div>
  );
}
