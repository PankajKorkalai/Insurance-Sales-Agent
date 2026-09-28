import React from "react";
import {
  LayoutDashboard,
  FilePlus,
  Users,
  Bot,
  BarChart3,
  Settings,
  Sparkles,
} from "lucide-react";

export default function Sidebar({ activeTab, setActiveTab, onNewQuote, onOpenAI }) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "new-quote", label: "New Quote", icon: FilePlus, action: onNewQuote },
    { id: "customers", label: "Customers", icon: Users },
    { id: "ai-assistant", label: "AI Assistant", icon: Bot, action: onOpenAI },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside style={{ width: "240px" }} className="bg-white border-r border-slate-200 flex flex-col justify-between p-5 min-h-screen shrink-0">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 mb-8 cursor-pointer" onClick={() => setActiveTab("dashboard")}>
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles className="w-6 h-6 fill-white stroke-blue-600" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight tracking-tight">InsureAI</h1>
            <p className="text-xs text-blue-600 font-medium">Your Insurance Copilot</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.action) {
                    item.action();
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                  isActive
                    ? "bg-blue-50 text-blue-600 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Profile & Footer */}
      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-semibold text-sm flex items-center justify-center shadow-sm">
            AG
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 truncate">Agent</h4>
            <p className="text-xs text-slate-500 truncate">Insurance Agent</p>
          </div>
        </div>

        <p className="px-3 py-2 text-xs text-slate-400">Demo agent workspace · no login</p>
      </div>
    </aside>
  );
}
