import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/container";
import { ProfileForm } from "@/components/account";

export const metadata: Metadata = {
  title: "Manage Profile — Solenne",
  description: "Update your Solenne account details.",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .single();

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-2xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 text-sm text-muted-foreground"
        >
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Account
          </Link>
        </nav>

        <div className="mb-10">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            Manage Profile
          </h1>
          <p className="text-lg text-muted-foreground">
            The details we use to greet you and reach you.
          </p>
        </div>

        <div className="mb-8 border-t border-border pt-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Email
          </p>
          <p className="mt-2 text-base text-foreground">{user.email}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your email is your sign-in and cannot be changed here.
          </p>
        </div>

        <ProfileForm
          defaultName={profile?.full_name ?? ""}
          defaultPhone={profile?.phone ?? ""}
        />
      </Container>
    </div>
  );
}
