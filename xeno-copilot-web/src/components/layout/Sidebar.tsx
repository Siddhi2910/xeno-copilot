'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  ShoppingBag,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/lib/stores/uiStore';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/segments', label: 'Segments', icon: PieChart },
  { href: '/import', label: 'Import', icon: Upload },
] as const;

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
              collapsed && 'justify-center px-2',
            )}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed ? <span>{label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, mobileNavOpen, toggleSidebar, setMobileNavOpen } = useUiStore();

  return (
    <>
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-slate-900 transition-transform duration-200 lg:static lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCollapsed && 'lg:w-16',
          !sidebarCollapsed && 'lg:w-60',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
          {!sidebarCollapsed ? (
            <Link href="/dashboard" className="text-sm font-semibold text-white">
              Xeno Copilot
            </Link>
          ) : (
            <span className="mx-auto text-xs font-bold text-indigo-400">X</span>
          )}
          <button
            type="button"
            className="rounded-md p-1 text-slate-400 hover:text-white lg:hidden"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <NavLinks collapsed={sidebarCollapsed} onNavigate={() => setMobileNavOpen(false)} />

        <div className="hidden border-t border-slate-800 p-2 lg:block">
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
