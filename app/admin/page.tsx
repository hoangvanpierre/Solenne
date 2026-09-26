import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Administration",
};

// Minimal Admin Hub. The layout above is the server-side authorization
// boundary (requireActiveActor + the management-permission union), so this
// page is purely presentational: no data queries, no links to routes that do
// not exist yet, no placeholder functionality. Management modules will be
// added as /admin/* subroutes, each guarding itself with requirePermission.
export default async function AdminPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  return (
    <div className="py-8 lg:py-12">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs tracking-wider uppercase font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{isVi ? "Solenne Quản trị" : "Solenne Administration"}</span>
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-semibold text-foreground">
          {isVi ? "Trung tâm quản trị" : "Admin Hub"}
        </h1>
        <p className="text-lg text-muted-foreground">
          {isVi
            ? "Khu vực quản lý nội bộ của Solenne."
            : "The internal management area for Solenne."}
        </p>
      </header>

      <div className="mt-12 rounded-2xl border border-border p-10 text-center">
        <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">
          {isVi
            ? "Chưa có mô-đun quản trị nào được triển khai. Các công cụ quản lý sẽ xuất hiện tại đây khi từng mô-đun được hoàn thiện."
            : "No management modules are available yet. Administration tools will appear here as each module is implemented."}
        </p>
      </div>
    </div>
  );
}
