import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApi } from "@/server/api";
import { FavoritesForm, GoalForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const api = await serverApi();
  const me = await api.users.me();
  if (!me?.username) redirect("/sign-in?next=/settings");
  const profile = await api.users.profile({ username: me.username });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-10">
      <h1 className="font-serif text-3xl">Settings</h1>
      <Section title="Profile">
        <ProfileForm
          initial={{
            name: profile.displayName,
            bio: profile.bio ?? "",
            location: profile.location ?? "",
            website: profile.website ?? "",
          }}
        />
      </Section>
      <Section title="Favorite books">
        <FavoritesForm initial={profile.favorites} />
      </Section>
      <Section title={`${new Date().getFullYear()} reading goal`}>
        <GoalForm initial={profile.goal?.target ?? null} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}
