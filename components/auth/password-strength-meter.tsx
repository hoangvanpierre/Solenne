"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAppLocale } from "@/hooks/use-locale";

export interface PasswordStrength {
  score: number; // 0 to 4
  label: string;
  colorClass: string;
  hint: string;
}

export function calculatePasswordStrength(password: string, locale = "en"): PasswordStrength {
  const isVi = locale === "vi";

  if (!password) {
    return {
      score: 0,
      label: "",
      colorClass: "bg-muted/40",
      hint: isVi ? "Khuyến nghị tối thiểu 8 ký tự" : "At least 8 characters recommended",
    };
  }

  if (password.length < 8) {
    return {
      score: 1,
      label: isVi ? "Quá ngắn" : "Too short",
      colorClass: "bg-destructive",
      hint: isVi
        ? `Cần thêm ${8 - password.length} ký tự nữa`
        : `${8 - password.length} more characters needed`,
    };
  }

  let score = 1;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const varietyCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(
    Boolean
  ).length;

  // Length bonuses
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;

  // Variety bonus
  if (varietyCount >= 3) score += 1;

  // Repetition penalty
  const isRepetitive = /(.)\1{2,}/.test(password);
  if (isRepetitive && score > 1) {
    score -= 1;
  }

  // Normalise to 1..4
  const normalizedScore = Math.min(Math.max(score, 1), 4);

  const labelsEn = ["", "Weak", "Fair", "Good", "Strong"];
  const labelsVi = ["", "Yếu", "Trung bình", "Tốt", "Rất an toàn"];
  const colors = [
    "bg-muted/40",
    "bg-destructive",
    "bg-amber/70",
    "bg-amber",
    "bg-sage",
  ];
  const hintsEn = [
    "At least 8 characters recommended",
    "Add more characters or variety",
    "Fair strength — consider a passphrase",
    "Good password",
    "Strong luxury-grade password",
  ];
  const hintsVi = [
    "Khuyến nghị tối thiểu 8 ký tự",
    "Thêm chữ hoa, chữ số hoặc ký tự đặc biệt",
    "Độ an toàn vừa phải",
    "Mật khẩu tốt",
    "Mật khẩu bảo mật tuyệt hảo",
  ];

  return {
    score: normalizedScore,
    label: isVi ? labelsVi[normalizedScore] : labelsEn[normalizedScore],
    colorClass: colors[normalizedScore],
    hint: isVi ? hintsVi[normalizedScore] : hintsEn[normalizedScore],
  };
}

interface PasswordStrengthMeterProps {
  password?: string;
  className?: string;
}

export function PasswordStrengthMeter({
  password = "",
  className,
}: PasswordStrengthMeterProps) {
  const locale = useAppLocale();
  const strength = useMemo(
    () => calculatePasswordStrength(password, locale),
    [password, locale]
  );

  if (!password) {
    return null;
  }

  return (
    <div className={cn("space-y-1.5 pt-1", className)} aria-live="polite">
      {/* 4 Segmented Progress Bars */}
      <div className="grid grid-cols-4 gap-1.5 h-1">
        {[1, 2, 3, 4].map((step) => {
          const isActive = strength.score >= step;
          return (
            <div
              key={step}
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isActive ? strength.colorClass : "bg-border/60"
              )}
            />
          );
        })}
      </div>

      {/* Label and Hint */}
      <div className="flex items-center justify-between text-[11px] leading-none pt-0.5">
        <span
          className={cn(
            "font-medium transition-colors duration-200",
            strength.score === 1 && "text-destructive",
            strength.score === 2 && "text-amber/90",
            strength.score === 3 && "text-amber",
            strength.score === 4 && "text-sage"
          )}
        >
          {strength.label}
        </span>
        <span className="text-muted-foreground/80">{strength.hint}</span>
      </div>
    </div>
  );
}
