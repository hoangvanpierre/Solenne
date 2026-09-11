import { redirect } from "next/navigation";
import Link from "next/link";
import { User as UserIcon, Package, MapPin, LogOut, Sparkles, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile from database
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const fullName =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Member";

  return (
    <div className="py-24 lg:py-32">
      <Container>
        {/* Header greeting */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-10 border-b border-border">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs tracking-wider uppercase font-medium">
              <Sparkles className="w-3 h-3" />
              <span>Solenne Sanctuary Member</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-semibold text-foreground">
              Welcome, {fullName}
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          <form action={signOutAction}>
            <Button
              variant="outline"
              type="submit"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wider"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </Button>
          </form>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-10">
          {/* Card 1: Orders */}
          <div className="p-6 rounded-2xl border border-border/80 bg-card/50 space-y-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-foreground">
              <Package className="w-5 h-5" />
            </div>
            <h2 className="font-serif text-xl font-medium text-foreground">
              Order History
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Track your artisan candle deliveries and view past receipts.
            </p>
            <div className="pt-2 text-xs text-muted-foreground border-t border-border/50">
              No orders yet.
            </div>
            <Button asChild variant="outline" size="sm" className="w-full mt-2">
              <Link href="/products" className="inline-flex items-center justify-center gap-2">
                <span>Explore Collection</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>

          {/* Card 2: Saved Addresses */}
          <div className="p-6 rounded-2xl border border-border/80 bg-card/50 space-y-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-foreground">
              <MapPin className="w-5 h-5" />
            </div>
            <h2 className="font-serif text-xl font-medium text-foreground">
              Shipping Sanctuary
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Manage your saved shipping destinations for seamless expedited checkout.
            </p>
            <div className="pt-2 text-xs text-muted-foreground border-t border-border/50">
              Default address saved during checkout.
            </div>
          </div>

          {/* Card 3: Profile Preferences */}
          <div className="p-6 rounded-2xl border border-border/80 bg-card/50 space-y-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-foreground">
              <UserIcon className="w-5 h-5" />
            </div>
            <h2 className="font-serif text-xl font-medium text-foreground">
              Bespoke Profile
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your scent preferences, currency settings, and account credentials.
            </p>
            <div className="pt-2 text-xs text-muted-foreground border-t border-border/50">
              Member since {new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
