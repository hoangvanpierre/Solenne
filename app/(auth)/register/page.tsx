"use client";

import { useActionState, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Mail,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAction, type ActionState } from "@/app/actions/auth";
import { registerSchema } from "@/lib/validations/auth";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { useAppLocale } from "@/hooks/use-locale";

const initialState: ActionState = {};

function RegisterForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/account";
  const locale = useAppLocale();
  const isVi = locale === "vi";

  const [state, formAction, isPending] = useActionState(
    registerAction,
    initialState
  );

  // Form field state for real-time validation and strength calculation
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Real-time client-side field validation using Zod
  const validateField = (
    field: string,
    values: {
      fullName: string;
      email: string;
      password: string;
      confirmPassword: string;
    }
  ) => {
    const result = registerSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const errorMsg = fieldErrors[field as keyof typeof fieldErrors]?.[0];
      return errorMsg || "";
    }
    return "";
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errorMsg = validateField(field, {
      fullName,
      email,
      password,
      confirmPassword,
    });
    setClientErrors((prev) => ({ ...prev, [field]: errorMsg }));
  };

  const handleChange = (
    field: "fullName" | "email" | "password" | "confirmPassword",
    value: string
  ) => {
    const updatedValues = {
      fullName,
      email,
      password,
      confirmPassword,
      [field]: value,
    };

    if (field === "fullName") setFullName(value);
    if (field === "email") setEmail(value);
    if (field === "password") setPassword(value);
    if (field === "confirmPassword") setConfirmPassword(value);

    // If already touched, provide live error clearing/feedback
    if (touched[field]) {
      const errorMsg = validateField(field, updatedValues);
      setClientErrors((prev) => ({ ...prev, [field]: errorMsg }));
    }

    // When typing password, re-check confirmPassword if it was touched
    if (field === "password" && touched.confirmPassword) {
      const confirmError = validateField("confirmPassword", updatedValues);
      setClientErrors((prev) => ({ ...prev, confirmPassword: confirmError }));
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const values = { fullName, email, password, confirmPassword };
    const result = registerSchema.safeParse(values);

    if (!result.success) {
      e.preventDefault();
      const flattened = result.error.flatten().fieldErrors;
      const newErrors: Record<string, string> = {};
      for (const [key, messages] of Object.entries(flattened)) {
        if (messages && messages[0]) {
          newErrors[key] = messages[0];
        }
      }
      setClientErrors(newErrors);
      setTouched({
        fullName: true,
        email: true,
        password: true,
        confirmPassword: true,
      });
      return;
    }

    // Clear client errors before allowing server action to execute
    setClientErrors({});
  };

  const getFieldError = (field: string) => {
    return clientErrors[field] || state.fieldErrors?.[field]?.[0];
  };

  // Success view when email verification is dispatched
  if (state.success) {
    return (
      <div className="space-y-6 text-left animate-in fade-in duration-400">
        <div className="w-14 h-14 rounded-full bg-sage/15 text-sage border border-sage/30 flex items-center justify-center shadow-lg shadow-sage/10">
          <Mail className="w-7 h-7" />
        </div>
        <div className="space-y-2.5">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
            {isVi ? "Xác Thực Quyền Truy Cập" : "Verify Your Sanctuary Access"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {state.message}
          </p>
          <div className="p-3.5 rounded-xl bg-background border border-border/80 text-xs text-foreground/90 font-mono">
            {isVi ? "Người nhận:" : "Recipient:"}{" "}
            <span className="font-semibold text-amber">{state.email || email}</span>
          </div>
          <p className="text-xs text-muted-foreground/80 pt-1">
            {isVi
              ? "Chưa nhận được thư? Quý khách vui lòng kiểm tra hộp thư rác (spam) hoặc đợi trong giây lát."
              : "Did not receive the email? Please check your spam folder or allow a few minutes for delivery."}
          </p>
        </div>
        <Button asChild className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 transition-all group">
          <Link href="/login" className="inline-flex items-center justify-center gap-2">
            <span>{isVi ? "Tiến hành đăng nhập" : "Proceed to Sign In"}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2 text-left">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          {isVi ? "Khởi Tạo Tài Khoản" : "Create an Account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isVi
            ? "Gia nhập gia đình Solenne để lưu giữ nốt hương bản sắc và theo dõi các tác phẩm yêu thích."
            : "Join Solenne to curate bespoke fragrance collections and track your orders."}
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
      <form action={formAction} onSubmit={handleSubmit} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />

        {/* Full Name */}
        <div className="space-y-1.5">
          <label
            htmlFor="fullName"
            className="text-xs font-medium uppercase tracking-wider text-foreground/80"
          >
            {isVi ? "Họ và tên" : "Full Name"}
          </label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder={isVi ? "Quý danh của bạn" : "Elena Vance"}
            value={fullName}
            onChange={(e) => handleChange("fullName", e.target.value)}
            onBlur={() => handleBlur("fullName")}
            required
            disabled={isPending}
            className="h-12 bg-background border-border/70 focus:border-amber focus:ring-amber/20"
          />
          {getFieldError("fullName") && (
            <p className="text-xs text-destructive mt-1 animate-in fade-in duration-150">
              {getFieldError("fullName")}
            </p>
          )}
        </div>

        {/* Email */}
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
            value={email}
            onChange={(e) => handleChange("email", e.target.value)}
            onBlur={() => handleBlur("email")}
            required
            disabled={isPending}
            className="h-12 bg-background border-border/70 focus:border-amber focus:ring-amber/20"
          />
          {getFieldError("email") && (
            <p className="text-xs text-destructive mt-1 animate-in fade-in duration-150">
              {getFieldError("email")}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-xs font-medium uppercase tracking-wider text-foreground/80"
          >
            {isVi ? "Mật khẩu" : "Password"}
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder={isVi ? "Từ 8–128 ký tự" : "8–128 characters"}
              value={password}
              onChange={(e) => handleChange("password", e.target.value)}
              onBlur={() => handleBlur("password")}
              required
              disabled={isPending}
              className="h-12 pr-11 bg-background border-border/70 focus:border-amber focus:ring-amber/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label={
                showPassword
                  ? isVi
                    ? "Ẩn mật khẩu"
                    : "Hide password"
                  : isVi
                  ? "Hiện mật khẩu"
                  : "Show password"
              }
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Password Strength Indicator */}
          <PasswordStrengthMeter password={password} />

          {getFieldError("password") && (
            <p className="text-xs text-destructive mt-1 animate-in fade-in duration-150">
              {getFieldError("password")}
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label
            htmlFor="confirmPassword"
            className="text-xs font-medium uppercase tracking-wider text-foreground/80"
          >
            {isVi ? "Xác nhận mật khẩu" : "Confirm Password"}
          </label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder={isVi ? "Nhập lại mật khẩu của bạn" : "Repeat your password"}
              value={confirmPassword}
              onChange={(e) => handleChange("confirmPassword", e.target.value)}
              onBlur={() => handleBlur("confirmPassword")}
              required
              disabled={isPending}
              className="h-12 pr-11 bg-background border-border/70 focus:border-amber focus:ring-amber/20"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label={
                showConfirmPassword
                  ? isVi
                    ? "Ẩn mật khẩu"
                    : "Hide password"
                  : isVi
                  ? "Hiện mật khẩu"
                  : "Show password"
              }
            >
              {showConfirmPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          {getFieldError("confirmPassword") && (
            <p className="text-xs text-destructive mt-1 animate-in fade-in duration-150">
              {getFieldError("confirmPassword")}
            </p>
          )}
        </div>

        {/* Terms notice */}
        <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
          {isVi
            ? "Khi tạo tài khoản, quý khách đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của Nhà hương. Chúng tôi luôn trân trọng sự tĩnh tại của bạn."
            : "By creating an account, you agree to our Terms of Service and Privacy Policy. We respect your sanctuary and will never spam."}
        </p>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={isPending}
          className="w-full h-12 text-sm tracking-wider uppercase font-medium bg-foreground text-background hover:bg-foreground/90 transition-all mt-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isVi ? "Đang khởi tạo tài khoản..." : "Creating Account..."}</span>
            </span>
          ) : (
            isVi ? "Tạo Tài Khoản" : "Create Account"
          )}
        </Button>
      </form>

      {/* Switch to Login */}
      <div className="pt-4 text-center text-sm text-muted-foreground border-t border-border/50">
        {isVi ? "Đã có tài khoản? " : "Already have an account? "}
        <Link
          href={`/login${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-foreground hover:text-amber underline-offset-4 hover:underline transition-colors"
        >
          {isVi ? "Đăng nhập" : "Sign In"}
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="h-96 flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}

