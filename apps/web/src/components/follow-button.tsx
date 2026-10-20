"use client";

import { useMutation } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc";

/** Follow / Following toggle. Signed-out visitors get a link to sign in instead. */
export function FollowButton({
  username,
  following: initial,
  signedIn,
  small,
}: {
  username: string;
  following: boolean;
  signedIn: boolean;
  small?: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [hover, setHover] = useState(false);
  useEffect(() => setFollowing(initial), [initial]);

  const onSettled = () => router.refresh();
  const onError = () => setFollowing(initial);
  const follow = useMutation(trpc.social.follow.mutationOptions({ onSettled, onError }));
  const unfollow = useMutation(trpc.social.unfollow.mutationOptions({ onSettled, onError }));

  const size = small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  if (!signedIn) {
    return (
      <Link href="/sign-in" className={`rounded bg-read font-semibold text-bg ${size}`}>
        Follow
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={following}
      disabled={follow.isPending || unfollow.isPending}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        setFollowing(!following);
        if (following) unfollow.mutate({ username });
        else follow.mutate({ username });
      }}
      className={`rounded font-semibold whitespace-nowrap ${size} ${
        following
          ? "bg-surface-2 text-muted hover:text-like"
          : "bg-read text-bg hover:brightness-110"
      }`}
    >
      {following ? (hover ? "Unfollow" : "Following") : "Follow"}
    </button>
  );
}

/** "…" menu on someone else's profile with Block / Unblock. */
export function ProfileMenu({ username, blocking }: { username: string; blocking: boolean }) {
  const trpc = useTRPC();
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

  const onSuccess = () => {
    setOpen(false);
    router.refresh();
  };
  const block = useMutation(trpc.social.block.mutationOptions({ onSuccess }));
  const unblock = useMutation(trpc.social.unblock.mutationOptions({ onSuccess }));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="More options"
        aria-expanded={open}
        className="rounded bg-surface-2 p-1.5 text-muted hover:text-text"
      >
        <Ellipsis className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-md bg-surface-2 py-1 text-sm shadow-xl">
          <button
            type="button"
            className="block w-full px-4 py-2 text-left hover:bg-surface"
            onClick={() => {
              if (blocking) unblock.mutate({ username });
              else if (
                confirm(
                  `Block @${username}? You'll stop following each other and they won't be able to follow you.`,
                )
              )
                block.mutate({ username });
            }}
          >
            {blocking ? "Unblock" : "Block"} @{username}
          </button>
        </div>
      )}
    </div>
  );
}
