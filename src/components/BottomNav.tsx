"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrainCircuit, MessagesSquare, SlidersHorizontal, CircleUser } from "lucide-react";

/**
 * Floating pill bottom navigation shown on /conversations and /settings.
 * Deliberately NOT rendered on the main chat screen, which stays clean.
 *
 * Four destinations: mind (chat), conversations, settings, identity.
 * "identity" routes to settings for now, per spec.
 */
type Item = {
  label: string;
  href: string;
  icon: typeof BrainCircuit;
  // Which pathname(s) mark this tab active.
  match: (path: string) => boolean;
};

const ITEMS: Item[] = [
  { label: "mind", href: "/", icon: BrainCircuit, match: (p) => p === "/" },
  {
    label: "conversations",
    href: "/conversations",
    icon: MessagesSquare,
    match: (p) => p.startsWith("/conversations"),
  },
  {
    label: "settings",
    href: "/settings",
    icon: SlidersHorizontal,
    match: (p) => p === "/settings",
  },
  // Identity — routes to settings for now.
  { label: "identity", href: "/settings", icon: CircleUser, match: () => false },
];

export function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-5 mb-8 flex items-center justify-around rounded-full glass-panel px-container-padding py-3">
      {ITEMS.map((item, i) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={`${item.href}-${i}`}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={
              "flex items-center justify-center rounded-full p-3 transition-transform duration-200 active:scale-90 " +
              (active
                ? "bg-primary-container/20 text-primary-container"
                : "text-on-surface-variant/60 hover:text-primary-container")
            }
          >
            <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
          </Link>
        );
      })}
    </nav>
  );
}
