"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppLocale } from "@/hooks/use-locale";
import { forgotPasswordAction, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

export default function ForgotPasswordPage() {
  const locale = useAppLocale();
  const isVi = locale === "vi";

  const [state, formAction, isPending] = useActionState(
    forgotPasswordAction,
    initialState
  );

  if (state.success) {
    return (
      <div className="space-y-6 text-left animate-in fade-in duration-300">
        <div className="w-12 h-12 rounded-full bg-amber/20 text-amber flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-semibold text-foreground">
            {isVi ? "Đã Gửi Liên Kết Khôi Phục" : "Reset Link Sent"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {state.message}
          </p>
        </div>
        <Button asChild className="w-full h-12 bg-foreground text-background cursor-pointer">
          <Link href="/login">
            {isVi ? "Quay lại Đăng nhập" : "Return to Sign In"}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Icon & Header */}
      <div className="space-y-2 text-left">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-4 text-foreground/80">
          <KeyRound className="w-5 h-5" />
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          {isVi ? "Khôi Phục Mật Khẩu" : "Recover Password"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isVi
            ? "Nhập địa chỉ email đã đăng ký, Nhà hương sẽ gửi đường dẫn an toàn để quý khách thiết lập lại mật khẩu."
            : "Enter your registered email address and we will send you a secure link to reset your password."}
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

        {/* Email Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-xs font-medium uppercase tracking-wider text-foreground/80"
          >
            {isVi ? "Địa chỉ email" : "Email Address"}
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

        {/* Submit */}
        <Button
          type="submit"
          disabled={isPending}
          className="w-full h-12 text-sm tracking-wider uppercase font-medium bg-foreground text-background hover:bg-foreground/90 transition-all cursor-pointer"
        >
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isVi ? "Đang gửi liên kết..." : "Sending link..."}</span>
            </span>
          ) : (
            isVi ? "Gửi Liên Kết Khôi Phục" : "Send Reset Link"
          )}
        </Button>
      </form>

      {/* Back to login */}
      <div className="pt-4 text-center border-t border-border/50">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
          <span>{isVi ? "Quay lại Đăng nhập" : "Back to Sign In"}</span>
        </Link>
      </div>
    </div>
  );
}
