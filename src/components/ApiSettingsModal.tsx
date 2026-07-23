import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, AlertCircle } from "lucide-react";

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groqApiKey: string;
  setGroqApiKey: (val: string) => void;
  deepgramApiKey: string;
  setDeepgramApiKey: (val: string) => void;
}

export function ApiSettingsModal({
  isOpen,
  onClose,
  groqApiKey,
  setGroqApiKey,
  deepgramApiKey,
  setDeepgramApiKey,
}: ApiSettingsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="glass-panel w-full max-w-lg rounded-3xl overflow-hidden flex flex-col relative"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                  <Settings className="w-4 h-4 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-100 font-display">API Settings</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 transition-colors bg-slate-800/50 rounded-full hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 bg-slate-950/50">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                  Groq API Key <span className="text-xs font-normal text-slate-500">(Required)</span>
                </label>
                <input
                  type="password"
                  value={groqApiKey}
                  onChange={(e) => {
                    setGroqApiKey(e.target.value);
                    localStorage.setItem("groqApiKey", e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-inner"
                  placeholder="gsk_..."
                />
                <p className="mt-2 text-xs text-slate-500">
                  Used for generating AI insights from the conversation.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                  Deepgram API Key <span className="text-xs font-normal text-slate-500">(Required)</span>
                </label>
                <input
                  type="password"
                  value={deepgramApiKey}
                  onChange={(e) => {
                    setDeepgramApiKey(e.target.value);
                    localStorage.setItem("deepgramApiKey", e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-inner"
                  placeholder="Live transcription key..."
                />
                <p className="mt-2 text-xs text-slate-500">
                  Used for real-time speech-to-text transcription.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300/80 text-xs leading-relaxed flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-indigo-400" />
                <p>
                  Security Note: Your keys are never sent to our servers. They are stored locally in your browser's{" "}
                  <code className="bg-slate-900 px-1 rounded text-indigo-400">localStorage</code> and transmitted securely
                  directly to the respective API providers.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
