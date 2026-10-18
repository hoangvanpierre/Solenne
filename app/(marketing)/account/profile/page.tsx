import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/container";
import { ProfileForm } from "@/components/account";

export const metadata: Metadata = {
  title: "Manage Profile — Solenne",
  description: "Update your Solenne account details.",
};

export default async function ProfilePage() {
  const locale = await getLocale();
  const isVi = locale === "vi";
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
    <div className="py-24 lg:py-32 account-page">
      <Container className="max-w-2xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 text-[13px] text-muted-foreground font-normal"
        >
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isVi ? "Quay lại không gian cá nhân" : "Back to Account"}
          </Link>
        </nav>

        <div className="mb-10">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {isVi ? "Hồ Sơ Bản Sắc" : "Manage Profile"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed font-normal">
            {isVi
              ? "Thông tin để Nhà hương trân trọng đón tiếp và liên hệ với quý khách."
              : "The details we use to greet you and reach you."}
          </p>
        </div>

        <div className="mb-8 border-t border-border pt-8">
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-normal">
            {isVi ? "Thư điện tử" : "Email"}
          </p>
          <p className="mt-1.5 text-[14px] sm:text-[14.5px] text-foreground font-normal">{user.email}</p>
          <p className="mt-1 text-[12.5px] sm:text-[13px] text-muted-foreground font-normal">
            {isVi
              ? "Địa chỉ email dùng để đăng nhập và không thể thay đổi tại đây."
              : "Your email is your sign-in and cannot be changed here."}
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
