"use client";

import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form onSubmit={submit} className="relative min-w-0">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search books, authors…"
        aria-label="Search"
        className="w-full max-w-36 rounded-full bg-surface-2 py-1.5 pr-3 pl-8 text-sm placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-read sm:w-52 sm:max-w-none sm:focus:w-60"
      />
    </form>
  );
}

export function UserMenu({ username, name }: { username: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const links = [
    [`/${username}`, "Profile"],
    [`/${username}/books`, "Books"],
    [`/${username}/diary`, "Diary"],
    [`/${username}/reviews`, "Reviews"],
    [`/${username}/reading-list`, "Reading list"],
    [`/${username}/following`, "Network"],
    ["/settings", "Settings"],
  ] as const;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold"
        aria-expanded={open}
      >
        <Avatar name={name} size={28} />
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-md bg-surface-2 py-1 text-sm shadow-xl">
          {links.map(([href, label]) => (
            <Link
              key={href}
              // typedRoutes can't know usernames ahead of time
              href={href as never}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 hover:bg-surface"
            >
              {label}
            </Link>
          ))}
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-muted hover:bg-surface"
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Initial-letter avatar until profile photos exist. */
export function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold text-muted ring-1 ring-border"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
