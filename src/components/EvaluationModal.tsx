import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Download } from "lucide-react";

interface EvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  manualRating: number;
  setManualRating: (rating: number) => void;
  exportToMarkdown: () => void;
}

export function EvaluationModal({
  isOpen,
  onClose,
  manualRating,
  setManualRating,
  exportToMarkdown,
}: EvaluationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-panel w-full max-w-3xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-900/30">
              <h2 className="text-xl font-bold text-slate-100 font-display">
                Post-Interview Evaluation
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 rounded-full hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Manual Rating */}
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 shadow-inner">
                <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
                  Your Rating
                </h3>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setManualRating(star)}
                      className="transition-transform hover:scale-110 focus:outline-none cursor-pointer"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          manualRating >= star
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-600 hover:text-slate-500"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-4 text-sm font-medium text-slate-400">
                    {manualRating > 0 ? `${manualRating} out of 5 stars` : "Select a rating"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <p className="text-xs text-slate-500">All data is processed securely.</p>
              <button
                onClick={exportToMarkdown}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-white text-slate-900 font-semibold rounded-xl transition-colors shadow-lg shadow-white/5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Save & Export Chat
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
