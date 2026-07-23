import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  onSaveAndReset: () => void;
}

export function NewSessionModal({
  isOpen,
  onClose,
  onReset,
  onSaveAndReset,
}: NewSessionModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-md rounded-xl overflow-hidden flex flex-col relative border border-white/10 bg-[#0f0f0f]"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/30">
              <h2 className="text-xl font-bold text-slate-100">Start New Session</h2>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 text-slate-300 text-sm">
              <p>
                Are you sure you want to start a new session? This will clear the current transcript,
                agenda, and context.
              </p>
              <p className="mt-2 text-indigo-300 font-medium">
                Would you like to save the current chat before resetting?
              </p>
            </div>
            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={onReset}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Discard & Reset
              </button>
              <button
                onClick={onSaveAndReset}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Save & Reset
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
