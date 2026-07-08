"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ShoppingCart,
  Hourglass,
  BarChart3,
  LineChart,
  Settings,
  type LucideIcon,
} from "lucide-react";

const NAV_ITEMS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/policies", label: "Store", Icon: ShoppingCart },
  { href: "/queue", label: "Active", Icon: Hourglass },
  { href: "/leaderboard", label: "Rankings", Icon: BarChart3 },
  { href: "/stats", label: "Stats", Icon: LineChart },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function GameNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 border-t border-zinc-200 dark:border-white/5 bg-white dark:bg-zinc-900 flex z-10">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs ${
                active ? "text-brand-500" : "text-zinc-500"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: side nav */}
      <nav className="hidden sm:flex flex-col gap-1 w-48 shrink-0 border-r border-zinc-200 dark:border-white/5 p-4">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                active
                  ? "bg-brand-500/10 text-brand-500"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
