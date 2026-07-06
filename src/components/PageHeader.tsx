"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Sticky glass header pill: back chevron + a lowercase title.
 * Shared by /conversations and /settings.
 */
export function PageHeader({ title, backHref }: { title: string; backHref?: string }) {
  const router = useRouter();

  function goBack() {
    if (backHref) router.push(backHref);
    else router.back();
  }

  return (
    <header className="sticky top-0 z-40 px-container-padding pt-container-padding">
      <div className="glass-panel flex h-14 items-center gap-3 rounded-full px-4">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-primary-container transition-colors hover:bg-white/5"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-headline-lg text-[22px] font-semibold leading-none tracking-tight text-on-surface">
          {title}
        </h1>
      </div>
    </header>
  );
}
