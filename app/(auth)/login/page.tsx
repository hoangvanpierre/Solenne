"use client";

import { useActionState, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/account";
  const errorParam = searchParams.get("error");

  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2 text-left">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          Welcome Back
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and password to access your sanctuary.
        </p>
      </div>

      {/* Global Error Notice */}
      {(state.error || errorParam) && (
        <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            {state.error ||
              (errorParam === "auth_callback_failed"
                ? "Sign-in link has expired or was invalid. Please log in directly."
                : "An error occurred. Please try again.")}
          </span>
        </div>
      )}

      {/* Form */}
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={next} />

        {/* Email Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-xs font-medium uppercase tracking-wider text-foreground/80"
          >
            Email Address
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="elena@example.com"
            required
            disabled={isPending}
            className="h-12 bg-background border-border/70 focus:border-amber focus:ring-amber/20"
          />
          {state.fieldErrors?.email && (
            <p className="text-xs text-destructive mt-1">
              {state.fieldErrors.email[0]}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-xs font-medium uppercase tracking-wider text-foreground/80"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-amber transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              disabled={isPending}
              className="h-12 pr-11 bg-background border-border/70 focus:border-amber focus:ring-amber/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          {state.fieldErrors?.password && (
            <p className="text-xs text-destructive mt-1">
              {state.fieldErrors.password[0]}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={isPending}
          className="w-full h-12 text-sm tracking-wider uppercase font-medium bg-foreground text-background hover:bg-foreground/90 transition-all"
        >
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing in...</span>
            </span>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>

      {/* Switch to Register */}
      <div className="pt-4 text-center text-sm text-muted-foreground border-t border-border/50">
        Don&apos;t have an account yet?{" "}
        <Link
          href={`/register${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-foreground hover:text-amber underline-offset-4 hover:underline transition-colors"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96 flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
