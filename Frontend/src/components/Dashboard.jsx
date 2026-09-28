import React, { useState } from "react";
import {
  Plus,
  Bot,
  FileText,
  Send,
  CheckCircle2,
  IndianRupee,
  ChevronDown,
  ArrowUpRight,
  MoreVertical,
  UserPlus,
  Layers,
  Sparkles,
  FileDown,
  ChevronRight,
  Car,
  Info,
  Calendar,
} from "lucide-react";

export default function Dashboard({
  quotesList,
  topVehicles,
  quotesActivity,
  recentActivities,
  onNewQuote,
  onOpenAI,
  onViewQuote,
  onEditQuote,
  onAddCustomer,
  onComparePlans,
  onGeneratePDF,
}) {
  const [selectedPeriod, setSelectedPeriod] = useState("This Month");
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null);

  return (
    <div className="space-y-6">
      {/* Greeting Banner & Header CTA Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Good morning, Pankaj! <span className="animate-bounce inline-block">👋</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Create quotes, manage customers and close more sales with AI.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onNewQuote}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all transform active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>New Quote</span>
          </button>

          <button
            onClick={onOpenAI}
            className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-sm rounded-xl border border-blue-200/80 flex items-center gap-2 transition-all"
          >
            <Bot className="w-4 h-4 text-blue-600" />
            <span>Ask Insurance AI</span>
          </button>

          <button className="px-3 py-2.5 bg-white text-slate-600 font-medium text-sm rounded-xl border border-slate-200 flex items-center gap-2 hover:bg-slate-50 transition-all ml-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>This Month</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Top Row: 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Quotes Created */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
            {/* Blue Sparkline Wave */}
            <svg className="w-20 h-9" viewBox="0 0 80 36" fill="none">
              <path
                d="M2 28 C 15 28, 25 15, 35 18 C 45 22, 55 8, 78 5"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">24</h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5">Quotes Created</p>
            <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-2">
              <span>↑ 12%</span>
              <span className="text-slate-400 font-normal">from last month</span>
            </p>
          </div>
        </div>

        {/* Card 2: Quotes Sent */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Send className="w-5 h-5" />
            </div>
            {/* Green Sparkline Wave */}
            <svg className="w-20 h-9" viewBox="0 0 80 36" fill="none">
              <path
                d="M2 30 C 18 30, 30 18, 42 22 C 54 25, 62 10, 78 6"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">18</h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5">Quotes Sent</p>
            <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-2">
              <span>↑ 8%</span>
              <span className="text-slate-400 font-normal">from last month</span>
            </p>
          </div>
        </div>

        {/* Card 3: Quotes Converted */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            {/* Purple Sparkline Wave */}
            <svg className="w-20 h-9" viewBox="0 0 80 36" fill="none">
              <path
                d="M2 26 C 20 26, 32 12, 45 20 C 58 28, 65 8, 78 4"
                stroke="#a855f7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">8</h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5">Quotes Converted</p>
            <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-2">
              <span>↑ 14%</span>
              <span className="text-slate-400 font-normal">from last month</span>
            </p>
          </div>
        </div>

        {/* Card 4: Premium Generated */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 font-bold">
              <IndianRupee className="w-5 h-5" />
            </div>
            {/* Orange Sparkline Wave */}
            <svg className="w-20 h-9" viewBox="0 0 80 36" fill="none">
              <path
                d="M2 28 C 15 28, 30 16, 45 22 C 60 28, 68 12, 78 5"
                stroke="#f97316"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">₹3.2L</h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5">Premium Generated</p>
            <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-2">
              <span>↑ 18%</span>
              <span className="text-slate-400 font-normal">from last month</span>
            </p>
          </div>
        </div>
      </div>

      {/* Middle Row: Charts & Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Quotes Activity Bar Chart (6 cols) */}
        <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-slate-900 text-base">Quotes Overview</h3>
              <Info className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="flex items-center gap-4">
              {/* Legend */}
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                  Created
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span>
                  Sent
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                  Converted
                </span>
              </div>

              {/* Time Filter */}
              <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <span>{selectedPeriod}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* SVG Grouped Bar Chart */}
          <div className="relative pt-4 pb-2">
            {/* Grid background lines */}
            <div className="space-y-6 text-xs text-slate-300 font-mono">
              {[40, 30, 20, 10, 0].map((val) => (
                <div key={val} className="flex items-center gap-2">
                  <span className="w-4 text-right text-slate-400 text-[10px]">{val}</span>
                  <div className="flex-1 border-b border-slate-100"></div>
                </div>
              ))}
            </div>

            {/* Bars container overlay */}
            <div className="absolute inset-x-0 bottom-6 top-4 left-8 flex items-end justify-between px-3">
              {quotesActivity.map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center group relative cursor-pointer"
                  onMouseEnter={() => setHoveredBarIndex(idx)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                >
                  {/* Tooltip */}
                  {hoveredBarIndex === idx && (
                    <div className="absolute -top-12 bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-xl z-20 whitespace-nowrap pointer-events-none">
                      <p className="font-bold">{item.date}</p>
                      <p className="text-blue-300">Created: {item.created}</p>
                      <p className="text-sky-300">Sent: {item.sent}</p>
                      <p className="text-emerald-300">Converted: {item.converted}</p>
                    </div>
                  )}

                  {/* Grouped Bar Column */}
                  <div className="flex items-end gap-1 h-36">
                    {/* Created Bar */}
                    <div
                      style={{ height: `${(item.created / 40) * 100}%` }}
                      className="w-2.5 bg-blue-600 rounded-t-sm group-hover:brightness-110 transition-all"
                    ></div>
                    {/* Sent Bar */}
                    <div
                      style={{ height: `${(item.sent / 40) * 100}%` }}
                      className="w-2.5 bg-sky-400 rounded-t-sm group-hover:brightness-110 transition-all"
                    ></div>
                    {/* Converted Bar */}
                    <div
                      style={{ height: `${(item.converted / 40) * 100}%` }}
                      className="w-2.5 bg-emerald-500 rounded-t-sm group-hover:brightness-110 transition-all"
                    ></div>
                  </div>

                  {/* X axis Label */}
                  <span className="text-[11px] font-medium text-slate-500 mt-2">{item.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Conversion Funnel (3 cols) */}
        <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm flex flex-col justify-between">
          <h3 className="font-bold text-slate-900 text-base mb-4">Conversion Funnel</h3>

          <div className="space-y-2.5 flex-1 flex flex-col justify-center">
            {/* Step 1: Quotes Created */}
            <div className="relative bg-blue-600 text-white p-3.5 rounded-xl shadow-sm clip-trapezoid flex items-center justify-between">
              <div>
                <p className="text-lg font-extrabold leading-none">128</p>
                <p className="text-xs font-medium text-blue-100 mt-1">Quotes Created</p>
              </div>
              <span className="text-xs font-bold bg-blue-500/80 px-2 py-1 rounded-md">100%</span>
            </div>

            {/* Step 2: Quotes Sent */}
            <div className="relative bg-sky-400 text-white p-3 rounded-xl shadow-sm flex items-center justify-between mx-3">
              <div>
                <p className="text-lg font-extrabold leading-none">94</p>
                <p className="text-xs font-medium text-sky-50 mt-1">Quotes Sent</p>
              </div>
              <span className="text-xs font-bold bg-sky-500/60 px-2 py-1 rounded-md">73%</span>
            </div>

            {/* Step 3: Converted */}
            <div className="relative bg-emerald-500 text-white p-3 rounded-xl shadow-sm flex items-center justify-between mx-6">
              <div>
                <p className="text-lg font-extrabold leading-none">42</p>
                <p className="text-xs font-medium text-emerald-50 mt-1">Converted</p>
              </div>
              <span className="text-xs font-bold bg-emerald-600/60 px-2 py-1 rounded-md">33%</span>
            </div>
          </div>
        </div>

        {/* Top Vehicle Models (3 cols) */}
        <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-base">Top Vehicle Models</h3>
            <button className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <span>This Month</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </div>

          <div className="space-y-3.5">
            {topVehicles.map((car, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Car className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                  <span className="font-semibold text-slate-800 truncate">{car.name}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${car.percent}%` }}
                      className={`h-full rounded-full ${car.barColor || "bg-blue-600"}`}
                    ></div>
                  </div>
                  <span className="font-bold text-slate-900 w-4 text-right">{car.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Quotes Table + Right Sidebar Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Recent Quotes Table (7 cols) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-base">Recent Quotes</h3>
            <button
              onClick={() => alert("Viewing all quotes...")}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3 pr-2">Customer</th>
                  <th className="pb-3 px-2">Vehicle</th>
                  <th className="pb-3 px-2">Premium</th>
                  <th className="pb-3 px-2">Status</th>
                  <th className="pb-3 px-2">Created On</th>
                  <th className="pb-3 pl-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {quotesList.map((quote) => (
                  <tr key={quote.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 pr-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-full ${quote.avatarBg} font-bold text-[11px] flex items-center justify-center shrink-0`}
                        >
                          {quote.avatar}
                        </div>
                        <span className="font-bold text-slate-900 truncate">{quote.customer}</span>
                      </div>
                    </td>

                    <td className="py-3 px-2 font-medium text-slate-700">{quote.vehicle}</td>

                    <td className="py-3 px-2 font-bold text-slate-900">
                      ₹{quote.premium.toLocaleString("en-IN")}
                    </td>

                    <td className="py-3 px-2">
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${quote.statusColor}`}>
                        {quote.status}
                      </span>
                    </td>

                    <td className="py-3 px-2 text-slate-500 font-medium">{quote.createdOn}</td>

                    <td className="py-3 pl-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onViewQuote(quote)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] transition-colors"
                        >
                          {quote.status === "Draft" ? "Edit" : "View"}
                        </button>
                        <button
                          onClick={() => alert(`Quote options for ${quote.customer}`)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Quick Actions + Recent Activity (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Quick Actions Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm">
            <h3 className="font-bold text-slate-900 text-base mb-4">Quick Actions</h3>

            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={onNewQuote}
                className="p-3 rounded-xl bg-blue-50/70 hover:bg-blue-100/70 border border-blue-100 text-left transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-2 shadow-sm">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-blue-700">
                  <span>New Quote</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              <button
                onClick={onAddCustomer}
                className="p-3 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-100 text-left transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center mb-2 shadow-sm">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                  <span>Add Customer</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              <button
                onClick={() => alert("Showing all saved quotes...")}
                className="p-3 rounded-xl bg-purple-50/70 hover:bg-purple-100/70 border border-purple-100 text-left transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center mb-2 shadow-sm">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-purple-700">
                  <span>View Quotes</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              <button
                onClick={onOpenAI}
                className="p-3 rounded-xl bg-blue-50/70 hover:bg-blue-100/70 border border-blue-100 text-left transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-2 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-blue-700">
                  <span>Ask AI Assistant</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              <button
                onClick={onComparePlans}
                className="p-3 rounded-xl bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-100 text-left transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center mb-2 shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-indigo-700">
                  <span>Compare Plans</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              <button
                onClick={onGeneratePDF}
                className="p-3 rounded-xl bg-rose-50/70 hover:bg-rose-100/70 border border-rose-100 text-left transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center mb-2 shadow-sm">
                  <FileDown className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-rose-700">
                  <span>Generate PDF</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          </div>

          {/* Recent Activity Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-base">Recent Activity</h3>
              <button
                onClick={() => alert("Viewing complete audit log...")}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {recentActivities.map((act) => (
                <div key={act.id} className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${act.dotColor || "bg-blue-500"} mt-1.5 shrink-0`}
                    ></span>
                    <span className="font-medium text-slate-800">{act.text}</span>
                  </div>
                  <span className="text-slate-400 shrink-0 text-[11px]">{act.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
