'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Megaphone, Search, Sparkles, Upload, Users, PieChart } from 'lucide-react';
import { useUiStore } from '@/lib/stores/uiStore';
import { RFM_SEGMENTS } from '@/lib/constants/segments';
import type { Campaign } from '@/lib/types/campaign';
import type { Customer } from '@/lib/types/customer';
import type { PaginatedResponse } from '@/lib/types/api';

type Item = { id: string; label: string; sub?: string; href: string; icon: typeof Search };

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const items = useMemo(() => {
    const list: Item[] = [
      { id: 'new', label: 'New Campaign', sub: 'AI wizard', href: '/campaigns/new', icon: Sparkles },
      { id: 'import', label: 'Upload CSV', href: '/import', icon: Upload },
    ];

    const campaignQueries = qc.getQueriesData<PaginatedResponse<Campaign>>({ queryKey: ['campaigns', 'list'] });
    for (const [, data] of campaignQueries) {
      data?.data?.forEach((c) =>
        list.push({ id: `campaign-${c._id}`, label: c.name, sub: `Campaign · ${c.status}`, href: `/campaigns/${c._id}`, icon: Megaphone }),
      );
    }

    const customerQueries = qc.getQueriesData<PaginatedResponse<Customer>>({ queryKey: ['customers', 'list'] });
    for (const [, data] of customerQueries) {
      data?.data?.forEach((c) => {
        const term = encodeURIComponent(c.phone || c.name);
        list.push({ id: `customer-${c._id}`, label: c.name, sub: `Customer · ${c.phone}`, href: `/customers?search=${term}`, icon: Users });
      });
    }

    RFM_SEGMENTS.forEach((s) =>
      list.push({ id: `segment-${s.value}`, label: s.label, sub: 'Segment', href: `/segments/${s.value}`, icon: PieChart }),
    );

    const term = q.trim().toLowerCase();
    if (!term) return list.slice(0, 12);
    return list.filter((i) => i.label.toLowerCase().includes(term) || i.sub?.toLowerCase().includes(term)).slice(0, 12);
  }, [qc, q]);

  useEffect(() => setActive(0), [q, open]);

  function go(href: string) {
    setOpen(false);
    setQ('');
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      go(items[active].href);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/50"
            aria-label="Close command palette"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            className="fixed left-1/2 top-[15%] z-50 w-[min(100%-2rem,32rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-800">
              <Search className="h-4 w-4 text-slate-400" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search campaigns, customers, segments…"
                className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100"
                aria-label="Search"
                aria-controls="command-palette-list"
                aria-activedescendant={items[active] ? `command-item-${active}` : undefined}
              />
              <kbd className="hidden rounded border px-1.5 text-xs text-slate-400 sm:inline">Esc</kbd>
            </div>
            <ul id="command-palette-list" className="max-h-80 overflow-y-auto py-2" role="listbox">
              {items.map((item, i) => {
                const Icon = item.icon;
                const selected = i === active;
                return (
                  <li key={item.id} id={`command-item-${i}`} role="presentation">
                    <button
                      type="button"
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${selected ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/30'}`}
                      onClick={() => go(item.href)}
                      onMouseEnter={() => setActive(i)}
                      role="option"
                      aria-selected={selected}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{item.label}</p>
                        {item.sub ? <p className="text-xs text-slate-500 dark:text-slate-400">{item.sub}</p> : null}
                      </div>
                    </button>
                  </li>
                );
              })}
              {!items.length ? <p className="px-4 py-6 text-center text-sm text-slate-500" role="status">No results</p> : null}
            </ul>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
