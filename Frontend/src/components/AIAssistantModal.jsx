import React, { useState } from "react";
import { X, Bot, Send, Sparkles, User, RefreshCw } from "lucide-react";

export default function AIAssistantModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const [messages, setMessages] = useState([
    {
      sender: "ai",
      text: "Hello Pankaj! I'm your InsureAI Copilot. How can I help you close more motor insurance quotes today?",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const samplePrompts = [
    "How to pitch Zero-Dep add-on for a 2-year old Creta?",
    "Explain IDV age depreciation to a hesitant client",
    "Why recommend Engine Protect for Mumbai vehicles?",
    "Generate a competitive objection pitch against ICICI Lombard",
  ];

  const handleSend = (textToSend) => {
    const query = textToSend || inputText;
    if (!query.trim()) return;

    const newMessages = [...messages, { sender: "user", text: query }];
    setMessages(newMessages);
    setInputText("");
    setIsTyping(true);

    // Simulate AI Copilot Response
    setTimeout(() => {
      let aiReply = "Here is an AI-generated insight tailored for your agent workflow:";
      const qLower = query.toLowerCase();

      if (qLower.includes("zero-dep") || qLower.includes("zero dep")) {
        aiReply =
          "💡 **Agent Pitch for Zero Depreciation:**\n'Mr. Customer, without Zero Dep, plastic and rubber bumper claims incur up to 50% out-of-pocket deduction! For just ₹3,200/year (₹8/day), our Zero-Dep cover guarantees 100% cashless claim reimbursement.'";
      } else if (qLower.includes("idv") || qLower.includes("depreciation")) {
        aiReply =
          "📊 **Explaining IDV to Client:**\n'IDV (Insured Declared Value) is the maximum sum insured for your vehicle under IRDAI guidelines. For a 2-year-old vehicle, a 20% standard depreciation is applied to the ex-showroom price, ensuring accurate claim payout without overcharging your premium.'";
      } else if (qLower.includes("mumbai") || qLower.includes("engine protect")) {
        aiReply =
          "🌧️ **Monsoon & Flood Risk Pitch:**\n'Mumbai experiences heavy waterlogging during monsoons. Standard motor policies classify water entering the engine as consequential damage and reject claims. Engine Protect covers engine hydro-locking repairs saving up to ₹2.5 Lakhs in overhaul costs!'";
      } else if (qLower.includes("icici") || qLower.includes("objection")) {
        aiReply =
          "🥊 **Handling Competitor Objection:**\n'Highlight our 24x7 Instant Spot Claims feature, 4,500+ Cashless Network Garages across India, and zero-paperwork digital link approval!'";
      } else {
        aiReply =
          `✨ **AI Insurance Insight for "${query}":**\nFor this customer scenario, emphasize total peace of mind with our Standard Plan (Zero Dep + RSA), and offer an NCB retention guarantee!`;
      }

      setMessages([...newMessages, { sender: "ai", text: aiReply }]);
      setIsTyping(false);
    }, 800);
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[80vh] modal-card">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-bold backdrop-blur-md">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                InsureAI Agent Copilot <Sparkles className="w-4 h-4 text-amber-300" />
              </h3>
              <p className="text-xs text-blue-100 font-medium">Real-time insurance advice & pitch assistant</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                  msg.sender === "user"
                    ? "bg-slate-800 text-white"
                    : "bg-blue-600 text-white shadow-sm"
                }`}
              >
                {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`p-4 rounded-2xl max-w-[80%] text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-blue-600 text-white rounded-tr-none shadow-sm"
                    : "bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-sm"
                }`}
              >
                {msg.text.split("\n").map((line, i) => (
                  <p key={i} className={i > 0 ? "mt-1.5" : ""}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium italic">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
              InsureAI is thinking...
            </div>
          )}
        </div>

        {/* Quick Prompts */}
        <div className="px-6 py-2 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto">
          {samplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => handleSend(p)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-[11px] font-medium whitespace-nowrap transition-colors"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Footer Input */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask AI anything about motor quotes, rules, or pitching..."
            className="flex-1 bg-slate-100 text-xs text-slate-800 p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
          <button
            onClick={() => handleSend()}
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
