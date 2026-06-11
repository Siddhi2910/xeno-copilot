'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

export function AiReportViewer({ report }: { report: string }) {
  const [open, setOpen] = useState(true);
  const sections = report.split(/\n\n+/).filter(Boolean);

  return (
    <div className="rounded-lg border border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white dark:border-indigo-900 dark:from-indigo-950/30 dark:to-slate-900">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium text-slate-900 dark:text-slate-100"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden />
        AI Post-Campaign Analysis
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-indigo-100 dark:border-indigo-900"
          >
            <div className="space-y-4 px-4 py-4">
              {sections.map((section, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="text-sm leading-relaxed text-slate-700 dark:text-slate-300"
                >
                  {section}
                </motion.p>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
