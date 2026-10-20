import Link from "next/link";
import { serverApi } from "@/server/api";
import { SearchBox, UserMenu } from "./header-client";
import { LogLauncher } from "./log-launcher";

export async function Header() {
  const me = await (await serverApi()).users.me();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-4">
        <Link href="/" className="font-serif text-xl font-semibold tracking-tight">
          book<span className="text-read">trakd</span>
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-semibold uppercase tracking-wider text-muted sm:flex">
          <Link href="/" className="hover:text-text">
            Books
          </Link>
          {me?.username && (
            <Link href="/activity" className="hover:text-text">
              Activity
            </Link>
          )}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <SearchBox />
          {me?.username ? (
            <>
              <UserMenu username={me.username} name={me.name} />
              <LogLauncher />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-sm font-semibold whitespace-nowrap text-muted hover:text-text"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="hidden rounded bg-read px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-bg hover:brightness-110 sm:inline-block"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
