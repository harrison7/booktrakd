"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/lib/trpc";

export function DeleteEntry({ id, username }: { id: number; username: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const remove = useMutation(
    trpc.entries.delete.mutationOptions({
      onSuccess: () => {
        router.push(`/${username}/diary` as never);
        router.refresh();
      },
    }),
  );
  return (
    <button
      type="button"
      disabled={remove.isPending}
      onClick={() => {
        if (confirm("Delete this diary entry? This can't be undone.")) remove.mutate({ id });
      }}
      className="mt-10 text-xs text-muted hover:text-like"
    >
      Delete entry
    </button>
  );
}
