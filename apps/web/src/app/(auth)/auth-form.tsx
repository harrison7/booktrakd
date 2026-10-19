"use client";

import { username as usernameSchema } from "@booktrakd/validators";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

const input =
  "w-full rounded bg-surface-2 px-3 py-2 placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-read";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) ?? "").trim();

    if (mode === "sign-up") {
      const parsed = usernameSchema.safeParse(get("username"));
      if (!parsed.success) {
        setError(`Username: ${parsed.error.issues[0]?.message}`);
        return;
      }
    }

    setPending(true);
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            name: get("name") || get("username"),
            username: get("username"),
            email: get("email"),
            password: get("password"),
          })
        : get("login").includes("@")
          ? await authClient.signIn.email({ email: get("login"), password: get("password") })
          : await authClient.signIn.username({ username: get("login"), password: get("password") });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    router.push(next as never);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-center font-serif text-3xl">
        {mode === "sign-up" ? "Join booktrakd" : "Sign in"}
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "sign-up" ? (
          <>
            <input
              name="username"
              placeholder="Username"
              autoComplete="username"
              required
              className={input}
            />
            <input name="name" placeholder="Display name (optional)" className={input} />
            <input
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              className={input}
            />
            <input
              name="password"
              type="password"
              placeholder="Password (8+ characters)"
              autoComplete="new-password"
              minLength={8}
              required
              className={input}
            />
          </>
        ) : (
          <>
            <input
              name="login"
              placeholder="Username or email"
              autoComplete="username"
              required
              className={input}
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              required
              className={input}
            />
          </>
        )}
        {error && <p className="text-sm text-like">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-read py-2 font-semibold text-bg hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {mode === "sign-up" ? (
          <>
            Already a member?{" "}
            <Link href="/sign-in" className="text-text underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/sign-up" className="text-text underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
