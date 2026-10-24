import styles from "./collections.module.css";

const PETAL_ANGLES = [0, 72, 144, 216, 288];

export interface ScentMotifProps {
  id: "floral" | "woody" | "fresh" | "warm";
}

/**
 * Per-family line motif painted behind a collection card's copy.
 *
 * Purely decorative: `currentColor` comes from the card's own family tint, the
 * wrapper owns the low opacity and hover brightening (collections.module.css),
 * and the whole thing is hidden from assistive technology by its parent.
 */
export function ScentMotif({ id }: ScentMotifProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.15}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={styles.motifSvg}
    >
      {id === "floral" && (
        <>
          <g transform="translate(100 94)">
            {PETAL_ANGLES.map((angle) => (
              <ellipse
                key={angle}
                rx={16}
                ry={29}
                cy={-36}
                transform={`rotate(${angle})`}
              />
            ))}
            <circle r={8} />
          </g>
          <path d="M100 132c0 20 7 32 18 42" />
          <path d="M104 152c-11-3-20 1-26 10" />
          <path d="M100 166c9-5 17-4 23 2" />
        </>
      )}

      {id === "woody" && (
        <>
          <path d="M34 200C26 158 44 132 38 98S52 44 44 10" />
          <path d="M58 200C50 160 68 134 62 100S76 46 68 12" />
          <path d="M82 200C74 160 92 134 86 100S100 46 92 12" />
          <path d="M106 200C98 160 116 134 110 100S124 46 116 12" />
          <path d="M130 200C122 160 140 134 134 100S148 46 140 12" />
          <path d="M154 200C146 160 164 134 158 100S172 46 164 12" />
          <path d="M178 200C170 160 188 134 182 100S196 46 188 12" />
        </>
      )}

      {id === "fresh" && (
        <>
          <path d="M-10 120c22-14 44-14 66 0s44 14 66 0 44-14 66 0 44 14 66 0" />
          <path d="M-10 144c22-14 44-14 66 0s44 14 66 0 44-14 66 0 44 14 66 0" />
          <path d="M-10 168c22-14 44-14 66 0s44 14 66 0 44-14 66 0 44 14 66 0" />
          <path d="M128 38c0 0 16 19 16 29a16 16 0 0 1-32 0c0-10 16-29 16-29z" />
          <path d="M82 66c0 0 9 11 9 17a9 9 0 0 1-18 0c0-6 9-17 9-17z" />
        </>
      )}

      {id === "warm" && (
        <>
          <path d="M100 28c21 27 37 44 37 69a37 37 0 0 1-74 0c0-15 8-28 19-39 2 11 7 18 12 22-2-19 2-34 6-52z" />
          <path d="M100 94c9 12 16 20 16 30a16 16 0 0 1-32 0c0-9 7-18 16-30z" />
          <circle cx="100" cy="118" r="62" opacity="0.45" />
        </>
      )}
    </svg>
  );
}
