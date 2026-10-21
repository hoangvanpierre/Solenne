import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Horizontal distribution chart for the management overview.
//
// SERVER-SAFE and dependency-free: pure HTML/CSS bars, no client state and no
// charting library. The only motion is a CSS `transform: scaleX()` reveal that
// grows each bar to the length already calculated on the server — it conveys no
// data of its own (every number is in the text list), so nothing is lost when
// it is skipped, and `prefers-reduced-motion` disables it outright.
//
// ACCESSIBILITY:
//   - The values live in a real <ul> as text (label · count · percent), so the
//     numbers never depend on the colour or length of a bar.
//   - Bars are aria-hidden decoration; the list is the accessible source.
//   - Colour is never the only signal: every segment is named in text, and
//     tone only tints the bar.
//
// DATA INTEGRITY:
//   - Nothing is clamped. If a segment is negative, non-integer, or larger than
//     the total, the chart renders `invalidMessage` instead of a plausible but
//     wrong picture.
//   - Percentages use the largest-remainder method so integer percentages add
//     up to 100 for a complete distribution (naive rounding can show 99%).
// ---------------------------------------------------------------------------

export type AdminBarTone = "positive" | "attention" | "danger" | "neutral";

// Brand tints used at bar scale only. Each reaches >= 3:1 against both the
// white (light) and #141210 (dark) card surfaces, which is the non-text
// contrast bar for graphical objects. None of these is used as small text —
// amber/sage fail AA as text, so labels stay foreground/muted-foreground.
const TONE_CLASS: Record<AdminBarTone, string> = {
  positive: "bg-sage-dark",
  attention: "bg-amber-dark",
  danger: "bg-destructive",
  neutral: "bg-foreground/55",
};

export interface AdminBarSegment {
  /** Stable key — also used for the list item key. */
  id: string;
  label: string;
  value: number;
  tone?: AdminBarTone;
}

export interface AdminBarChartProps {
  /** Accessible name for the figure (the card heading is outside this component). */
  label: string;
  segments: AdminBarSegment[];
  /** Denominator for the percentages. Must be >= every value and >= their sum. */
  total: number;
  /** Human sentence stating what the total counts, e.g. "18 variants tracked". */
  totalLabel: string;
  /** Shown when the distribution is legitimately empty (total === 0). */
  emptyMessage: string;
  /** Shown when the numbers are internally inconsistent. */
  invalidMessage: string;
  locale?: string;
  /** Optional explanatory footnote. */
  note?: string;
  /**
   * Wide cards can lay the bars out in two columns so a four-row distribution
   * does not stretch into very long bars. Stacks below the sm breakpoint.
   */
  columns?: 1 | 2;
}

/**
 * True when the segments describe a coherent distribution: every value is a
 * non-negative integer, none exceeds the total, and they do not add up to more
 * than the total. Deliberately returns false rather than repairing values.
 */
export function isAdminBarDistributionValid(
  segments: readonly AdminBarSegment[],
  total: number
): boolean {
  if (!Number.isFinite(total) || total < 0 || !Number.isInteger(total)) {
    return false;
  }

  let sum = 0;

  for (const segment of segments) {
    if (!Number.isInteger(segment.value) || segment.value < 0) return false;
    if (segment.value > total) return false;
    sum += segment.value;
  }

  return sum <= total;
}

/**
 * Integer percentages that add up to the exact share of `total` (100 when the
 * segments are exhaustive). Largest-remainder allocation avoids the "33 + 33 +
 * 33 = 99" artefact of rounding each share independently.
 */
function distributePercentages(
  values: readonly number[],
  total: number
): number[] {
  if (total <= 0) return values.map(() => 0);

  const exact = values.map((value) => (value / total) * 100);
  const result = exact.map((value) => Math.floor(value));

  // Target the rounded sum (100 for a complete distribution) so a partial
  // distribution is not silently inflated to 100%.
  const target = Math.round(exact.reduce((sum, value) => sum + value, 0));
  let remaining = target - result.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (const entry of byRemainder) {
    if (remaining <= 0) break;
    result[entry.index] += 1;
    remaining -= 1;
  }

  return result;
}

export function AdminBarChart({
  label,
  segments,
  total,
  totalLabel,
  emptyMessage,
  invalidMessage,
  locale = "en",
  note,
  columns = 1,
}: AdminBarChartProps) {
  const format = (value: number) =>
    new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(value);

  // Inconsistent data is reported, never smoothed over.
  if (!isAdminBarDistributionValid(segments, total)) {
    return (
      <div
        role="status"
        className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5"
      >
        <p className="text-sm leading-relaxed text-foreground">
          {invalidMessage}
        </p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  const percentages = distributePercentages(
    segments.map((segment) => segment.value),
    total
  );

  return (
    <figure className="space-y-3">
      <figcaption className="sr-only">{label}</figcaption>

      <ul
        className={cn(
          "space-y-3",
          columns === 2 &&
            "sm:grid sm:grid-cols-2 sm:gap-x-10 sm:gap-y-4 sm:space-y-0"
        )}
      >
        {segments.map((segment, index) => {
          const percentage = percentages[index];

          return (
            <li key={segment.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-foreground">
                  {segment.label}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  <span className="text-foreground">{format(segment.value)}</span>
                  {" · "}
                  {percentage}%
                </span>
              </div>

              <div
                aria-hidden="true"
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "admin-bar-fill h-full rounded-full",
                    TONE_CLASS[segment.tone ?? "neutral"]
                  )}
                  style={{
                    width: `${percentage}%`,
                    // 50ms between consecutive bars. Inline, so the server
                    // render and the client hydration agree exactly.
                    animationDelay: `${index * 50}ms`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted-foreground">{totalLabel}</p>

      {note ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
      ) : null}
    </figure>
  );
}
