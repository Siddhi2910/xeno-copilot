'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function AiReportPanel({ report }: { report: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium text-slate-900 dark:text-slate-100"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        AI Post-Campaign Analysis
      </button>
      {open ? (
        <div className="border-t border-slate-200 px-4 py-4 text-sm whitespace-pre-wrap text-slate-700 dark:border-slate-800 dark:text-slate-300">
          {report}
        </div>
      ) : null}
    </div>
  );
}
