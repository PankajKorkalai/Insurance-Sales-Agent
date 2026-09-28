import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./components/Dashboard";
import NewQuotePage from "./components/NewQuotePage";
import NewCustomer from "./components/NewCustomer";
import AIAssistantModal from "./components/AIAssistantModal";
import {
  INITIAL_QUOTES,
  TOP_VEHICLE_MODELS,
  QUOTES_ACTIVITY_DATA,
  RECENT_ACTIVITIES,
} from "./data/mockData";
import "./index.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals state
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  // Data state
  const [quotes, setQuotes] = useState(INITIAL_QUOTES);

  const handleSaveQuote = (newQuote) => {
    setQuotes([newQuote, ...quotes]);
    setActiveTab("dashboard");
  };

  const handleOpenNewQuote = () => {
    setActiveTab("new-quote");
  };

  const handleOpenNewCustomer = () => {
    setActiveTab("new-customer");
  };

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNewQuote={handleOpenNewQuote}
        onOpenAI={() => setIsAIModalOpen(true)}
      />

      <main className="main-wrapper">
        <TopBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          notificationsCount={1}
        />

        <div className="content-body">
          {activeTab === "dashboard" && (
            <Dashboard
              quotesList={quotes}
              topVehicles={TOP_VEHICLE_MODELS}
              quotesActivity={QUOTES_ACTIVITY_DATA}
              recentActivities={RECENT_ACTIVITIES}
              onNewQuote={handleOpenNewQuote}
              onOpenAI={() => setIsAIModalOpen(true)}
              onViewQuote={(quote) => alert(`Viewing quote: ${quote.id}`)}
              onEditQuote={(quote) => alert(`Editing quote: ${quote.id}`)}
              onAddCustomer={handleOpenNewCustomer}
              onComparePlans={() => alert("Compare Plans modal coming soon")}
              onGeneratePDF={() => alert("Generating PDF...")}
            />
          )}

          {activeTab === "new-quote" && (
            <NewQuotePage
              onBackToDashboard={() => setActiveTab("dashboard")}
              onSaveQuote={handleSaveQuote}
            />
          )}

          {(activeTab === "new-customer" || activeTab === "customers") && (
            <NewCustomer
              onBackToDashboard={() => setActiveTab("dashboard")}
              onSaveCustomer={() => setActiveTab("dashboard")}
            />
          )}

          {activeTab !== "dashboard" && activeTab !== "new-quote" && activeTab !== "new-customer" && activeTab !== "customers" && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <div className="text-4xl mb-4">🚧</div>
              <h2 className="text-xl font-bold text-slate-800">{activeTab} section under construction</h2>
              <p className="mt-2 text-sm">Select Dashboard to view the main UI.</p>
            </div>
          )}
        </div>
      </main>

      <AIAssistantModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
      />
    </div>
  );
}
