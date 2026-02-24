import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { MessageCircle, X, Send, Sparkles, User, Bot } from 'lucide-react';
import { useLanguage } from '@/shared/i18n/LanguageContext';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const AIAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMsg = inputValue;
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const systemPrompt = `
        You are 'Flowlyfix AI', a helpful assistant for the Flowlyfix Field Service Management platform.
        Your goal is to help users understand how to use the application.
        
        Platform Structure:
        1. Dashboard: Overview of active jobs, KPIs, and technician status.
        2. Dispatch: A Kanban board to assign jobs to technicians by drag-and-drop.
        3. Workshop: Manage in-house repairs, check in machines, log time and parts.
        4. Customers: Manage customer registry and synchronize customer data.
        5. Resources: Manage Assets (Machines) and Technicians.
        6. Settings: Configure language, integrations, and organization details.
        7. Field App: A mobile view for technicians to see their assigned jobs ("My Day"), travel, start jobs, and sign off.

        Key Features:
        - Financial Integration: Synchronizes customer data and supports invoice draft workflows.
        - Real-time updates: Status changes reflect immediately.
        - AI Reporting: Technicians can use voice to generate work logs.
        
        Current Language: ${language === 'sv' ? 'Swedish' : 'English'}.
        Please answer concisely and helpfully in the current language.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userMsg,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      if (response.text) {
        setMessages(prev => [...prev, { role: 'model', text: response.text }]);
      }
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: language === 'sv' ? 'Jag kunde inte nå servern just nu. Försök igen senare.' : 'I could not reach the server right now. Please try again later.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans">
      {isOpen && (
        <div className="mb-4 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300">
          {/* Header */}
          <div className="bg-[#0a192f] p-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-tr from-emerald-400 to-blue-500 p-1.5 rounded-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Flowlyfix AI</h3>
                <p className="text-[10px] text-blue-200">{language === 'sv' ? 'Systemexpert' : 'System Expert'}</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="h-80 overflow-y-auto p-4 bg-slate-50 space-y-3 custom-scrollbar">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-sm mt-10 px-4">
                <p>{language === 'sv' ? 'Hej! Jag kan hjälpa dig med frågor om Flowlyfix.' : 'Hi! I can help you with questions about Flowlyfix.'}</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-docuraft-navy text-white'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`p-3 rounded-2xl text-sm max-w-[80%] ${msg.role === 'user' ? 'bg-white border border-gray-200 text-slate-800 rounded-tr-none' : 'bg-blue-50 text-slate-800 border border-blue-100 rounded-tl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-docuraft-navy text-white flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-blue-50 p-3 rounded-2xl rounded-tl-none border border-blue-100">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-100"></span>
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-200"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-white border-t border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={language === 'sv' ? 'Fråga om plattformen...' : 'Ask about the platform...'}
                className="flex-1 bg-transparent text-sm text-slate-800 focus:outline-none placeholder-slate-400"
              />
              <button 
                onClick={handleSend} 
                disabled={isLoading || !inputValue.trim()}
                className="p-1.5 bg-docuraft-navy text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isOpen ? 'bg-slate-700 rotate-90' : 'bg-gradient-to-r from-[#0a192f] to-[#1e3a8a]'}`}
      >
        {isOpen ? (
            <X className="w-6 h-6 text-white" />
        ) : (
            <MessageCircle className="w-7 h-7 text-white" />
        )}
      </button>
    </div>
  );
};
