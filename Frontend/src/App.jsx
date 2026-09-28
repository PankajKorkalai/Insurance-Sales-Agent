import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./components/Dashboard";
import NewQuotePage from "./components/NewQuotePage";
import NewCustomer from "./components/NewCustomer";
import AIAssistantModal from "./components/AIAssistantModal";
import QuoteDetail from "./components/QuoteDetail";
import Analytics from "./components/Analytics";
import Settings from "./components/Settings";
import "./index.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [pitchQuote, setPitchQuote] = useState(null);
  const [viewQuote, setViewQuote] = useState(null);
  const [quoteCustomer, setQuoteCustomer] = useState(null);
  const [startWizard, setStartWizard] = useState(false);
  const [period, setPeriod] = useState("month");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const openAI = (quote) => {
    setPitchQuote(quote || null);
    setIsAIModalOpen(true);
  };

  const openNewQuote = () => {
    setQuoteCustomer(null);
    setStartWizard(true);
    setActiveTab("new-quote");
  };

  const quoteForCustomer = (customer) => {
    setQuoteCustomer(customer);
    setStartWizard(true);
    setActiveTab("new-quote");
  };

  const go = (tab) => {
    setStartWizard(false);
    setQuoteCustomer(null);
    setShowCustomerForm(false);
    setActiveTab(tab);
  };

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={go}
        onNewQuote={openNewQuote}
        onOpenAI={() => openAI()}
      />

      <main className="main-wrapper">
        <TopBar
          searchQuery={searchQuery}
          setSearchQuery={(q) => {
            setSearchQuery(q);
            setStartWizard(false);
            setActiveTab("new-quote");
          }}
        />

        <div className="content-body">
          {activeTab === "dashboard" && (
            <Dashboard
              key={`${period}-${refreshKey}`}
              period={period}
              onPeriodChange={setPeriod}
              onNewQuote={openNewQuote}
              onOpenAI={() => openAI()}
              onViewQuote={(q) => setViewQuote(q)}
              onAddCustomer={() => {
                setShowCustomerForm(true);
                setActiveTab("customers");
              }}
              onViewQuotes={() => {
                setStartWizard(false);
                setActiveTab("new-quote");
              }}
            />
          )}

          {activeTab === "new-quote" && (
            <NewQuotePage
              key={`${quoteCustomer?.customer_id || "new"}-${startWizard}`}
              onBackToDashboard={() => setActiveTab("dashboard")}
              onViewQuote={(q) => setViewQuote(q)}
              onAskAI={(q) => openAI(q)}
              startCustomer={quoteCustomer}
              startWizard={startWizard}
              initialSearch={searchQuery}
            />
          )}

          {activeTab === "customers" && (
            <NewCustomer
              showForm={showCustomerForm}
              onBackToDashboard={() => setActiveTab("dashboard")}
              onQuoteForCustomer={quoteForCustomer}
            />
          )}

          {activeTab === "analytics" && <Analytics />}
          {activeTab === "settings" && <Settings />}
        </div>
      </main>

      <AIAssistantModal
        isOpen={isAIModalOpen}
        quote={pitchQuote}
        onClose={() => setIsAIModalOpen(false)}
      />

      {viewQuote && (
        <QuoteDetail
          quote={viewQuote}
          onClose={() => setViewQuote(null)}
          onChanged={() => setRefreshKey((n) => n + 1)}
          onAskAI={(q) => {
            setViewQuote(null);
            openAI(q);
          }}
        />
      )}
    </div>
  );
}
