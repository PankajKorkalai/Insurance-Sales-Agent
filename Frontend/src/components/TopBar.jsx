import React from "react";
import { Search, Bell } from "lucide-react";

export default function TopBar({ searchQuery, setSearchQuery, notificationsCount = 3 }) {
  return (
    <header className="h-16 px-8 border-b border-slate-200/80 bg-white/70 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-6">
      {/* Search Input */}
      <div className="flex-1 max-w-2xl relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search customer, vehicle, quote..."
          className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-sm text-slate-800 placeholder-slate-400 pl-10 pr-4 py-2 rounded-xl border border-slate-200/60 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
        />
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button
          onClick={() => alert("You have 3 new notifications: 1. Rahul Sharma opened quote. 2. Price rate card updated. 3. New lead assigned.")}
          className="relative w-9 h-9 rounded-xl bg-slate-100/80 hover:bg-slate-200/60 text-slate-600 flex items-center justify-center transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {notificationsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
          )}
        </button>

        {/* Profile Badge */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shadow-sm">
            PK
          </div>
          <div className="hidden sm:block text-left">
            <h4 className="text-xs font-bold text-slate-800 leading-tight">Pankaj</h4>
            <p className="text-[11px] text-slate-400 font-medium">Insurance Agent</p>
          </div>
        </div>
      </div>
    </header>
  );
}
