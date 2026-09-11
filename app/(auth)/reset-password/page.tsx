"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordAction, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialState
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2 text-left">
        <div className="w-10 h-10 rounded-full bg-amber/10 text-amber flex items-center justify-center mb-4">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          Set New Password
        </h1>
        <p className="text-sm text-muted-foreground">
          Please choose a strong password to protect your Solenne sanctuary.
        </p>
      </div>

      {/* Global Error Notice */}
      {state.error && (
        <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Form */}
      <form action={formAction} className="space-y-5">
        {/* New Password */}
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-xs font-medium uppercase tracking-wider text-foreground/80"
          >
            New Password
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 6 characters"
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

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label
            htmlFor="confirmPassword"
            className="text-xs font-medium uppercase tracking-wider text-foreground/80"
          >
            Confirm New Password
          </label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat your new password"
              required
              disabled={isPending}
              className="h-12 pr-11 bg-background border-border/70 focus:border-amber focus:ring-amber/20"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          {state.fieldErrors?.confirmPassword && (
            <p className="text-xs text-destructive mt-1">
              {state.fieldErrors.confirmPassword[0]}
            </p>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={isPending}
          className="w-full h-12 text-sm tracking-wider uppercase font-medium bg-foreground text-background hover:bg-foreground/90 transition-all"
        >
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Updating Password...</span>
            </span>
          ) : (
            "Save & Sign In"
          )}
        </Button>
      </form>
    </div>
  );
}
