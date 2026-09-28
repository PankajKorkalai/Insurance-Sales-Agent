import React, { useEffect, useState } from "react";
import { X, Bot, Send, Sparkles, User, RefreshCw } from "lucide-react";
import { api } from "../api";

const SAMPLE_PROMPTS = [
  "How does Zero Depreciation cover differ across HDFC ERGO, ICICI Lombard and Bajaj Allianz?",
  "Explain IDV age depreciation to a hesitant client",
  "Why recommend Engine Protect for Mumbai vehicles?",
  "Generate a competitive pitch against ICICI Lombard using this quote",
];

export default function AIAssistantModal({ isOpen, onClose, quote }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [status, setStatus] = useState(null);
  const [useQuote, setUseQuote] = useState(true);

  useEffect(() => {
    if (!isOpen) return undefined;
    api.assistantStatus().then(setStatus).catch(() => setStatus({ available: false, detail: "Copilot unavailable" }));
    const intro = quote
      ? `Hello. I have quote ${quote.display_id} for ${quote.customer?.name} (${quote.vehicle ? `${quote.vehicle.make} ${quote.vehicle.model}` : "their vehicle"}). Ask me to compare coverage with HDFC ERGO, ICICI Lombard or Bajaj Allianz — I'll cite the policy sections.`
      : "Hello. I answer from the three insurer policy wordings in the knowledge base (HDFC ERGO, ICICI Lombard, Bajaj Allianz). Attach a saved quote to get a pitch that uses that quote's exact figures.";
    setMessages([{ sender: "ai", text: intro, sources: [] }]);
    setUseQuote(!!quote);
    return undefined;
  }, [isOpen, quote]);

  if (!isOpen) return null;

  const handleSend = async (textToSend) => {
    const query = (textToSend || inputText).trim();
    if (!query || isTyping) return;
    const next = [...messages, { sender: "user", text: query }];
    setMessages(next);
    setInputText("");
    setIsTyping(true);
    try {
      const result = await api.askAssistant({
        question: query,
        quote_id: useQuote && quote ? quote.quote_id : null,
        n_results: 6,
      });
      setMessages([
        ...next,
        {
          sender: "ai",
          text: result.answer,
          sources: result.sources || [],
          mode: result.mode,
        },
      ]);
    } catch (err) {
      setMessages([...next, { sender: "ai", text: `Could not answer: ${err.message}`, sources: [] }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[80vh] modal-card">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                InsureAI Agent Copilot <Sparkles className="w-4 h-4 text-amber-300" />
              </h3>
              <p className="text-xs text-blue-100 font-medium">
                {status?.available
                  ? `${status.chunks} policy sections · ${status.companies.join(", ")}`
                  : status?.detail || "Connecting to policy knowledge base…"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {quote && (
          <label className="px-6 py-2 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-800 font-medium flex items-center gap-2">
            <input type="checkbox" checked={useQuote} onChange={(e) => setUseQuote(e.target.checked)} />
            Ground answers in {quote.display_id} (exact premium figures, no invented competitor prices)
          </label>
        )}

        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${msg.sender === "user" ? "bg-slate-800 text-white" : "bg-blue-600 text-white"}`}>
                {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`p-4 rounded-2xl max-w-[80%] text-xs leading-relaxed ${
                msg.sender === "user"
                  ? "bg-blue-600 text-white rounded-tr-none"
                  : "bg-white text-slate-800 border border-slate-200 rounded-tl-none"
              }`}>
                {msg.text.split("\n").map((line, i) => (
                  <p key={i} className={i > 0 ? "mt-1.5" : ""}>{line}</p>
                ))}
                {msg.sources?.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-100 space-y-1">
                    <p className="font-bold text-[10px] uppercase tracking-wide text-slate-400">Sources</p>
                    {msg.sources.map((s) => (
                      <p key={s.chunk_id} className="text-[11px] text-slate-500">
                        {s.company} · Section {s.section_number || "unnumbered"}
                        {s.section_title ? ` · ${s.section_title}` : ""} ({s.source_type})
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium italic">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
              Searching policy wordings…
            </div>
          )}
        </div>

        <div className="px-6 py-2 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto">
          {SAMPLE_PROMPTS.map((p) => (
            <button key={p} onClick={() => handleSend(p)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-[11px] font-medium whitespace-nowrap">
              {p}
            </button>
          ))}
        </div>

        <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about coverage, exclusions, NCB, or a competitor comparison…"
            className="flex-1 bg-slate-100 text-xs text-slate-800 p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
          <button onClick={() => handleSend()} className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
