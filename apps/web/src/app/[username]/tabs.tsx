"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["", "Profile"],
  ["/books", "Books"],
  ["/diary", "Diary"],
  ["/reviews", "Reviews"],
  ["/reading-list", "Reading list"],
] as const;

export function ProfileTabs({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-border text-sm">
      {TABS.map(([suffix, label]) => {
        const href = base + suffix;
        const active = path === href;
        return (
          <Link
            key={label}
            href={href as never}
            className={`border-b-2 px-3 py-2 whitespace-nowrap ${
              active ? "border-read text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
