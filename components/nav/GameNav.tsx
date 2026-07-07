"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "🏛️" },
  { href: "/policies", label: "Store", icon: "📜" },
  { href: "/queue", label: "Active", icon: "⏳" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/stats", label: "Stats", icon: "📈" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
] as const;

export function GameNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-black/95 backdrop-blur flex z-10">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs ${
                active ? "text-amber-500" : "text-zinc-500"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: side nav */}
      <nav className="hidden sm:flex flex-col gap-1 w-48 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm ${
                active
                  ? "bg-amber-500/10 text-amber-500"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
