'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, Moon, Search, Sun, Upload, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/stores/uiStore';

export function TopBar() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Search"
        onClick={() => useUiStore.getState().setCommandPaletteOpen(true)}
      >
        <Search className="h-5 w-5" />
      </Button>

      <button
        type="button"
        onClick={() => useUiStore.getState().setCommandPaletteOpen(true)}
        className="hidden h-9 w-full max-w-sm items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 md:flex dark:border-slate-700 dark:bg-slate-900"
        aria-label="Open command palette"
      >
        <span>Search campaigns, customers…</span>
        <kbd className="rounded border border-slate-200 px-1.5 text-xs dark:border-slate-600">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
          <Link href="/import">
            <Upload className="h-4 w-4" />
            Import
          </Link>
        </Button>

        {mounted ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        ) : null}

        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="User menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <User className="h-4 w-4" />
          </Button>
          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-2 w-40 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
