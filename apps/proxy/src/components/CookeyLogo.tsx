// ============================================
// COOKEY MARKS
// Two marks, one system — both drawn in currentColor so they survive
// any theme or accent swap without carrying a hue of their own.
//
// CookeyMonogram — the "custody C": a heavy C holding a small square
//   in its opening (the key, held but not handed over). This is the
//   official mark: documentation, the landing page, the favicon
//   (mirrored in src/app/icon.svg — change one, change both).
//
// CookeyMark — the parametric bracket slot: [x_] — square brackets
//   holding the deployment's own initial plus a cursor square. Every
//   self-hosted gateway renders its owner's letter, so each install
//   wears its own mark. Works with any glyph, Latin or not.
// ============================================

interface MarkProps {
  size?: number;
  className?: string;
}

const MONO_STACK =
  "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * First useful letter of a deployment name, lowercased — "Umer's
 * Gateway" → "u". Falls back to "c" (Cookey) when the name has no
 * letters at all. Unicode-aware, so non-Latin names keep their glyph.
 */
export function getBrandInitial(name?: string | null): string {
  const match = name?.match(/\p{L}/u);
  return match ? match[0].toLocaleLowerCase() : "c";
}

/** Official monogram: the custody C. */
export function CookeyMonogram({ size = 28, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-46 -46 92 92"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Cookey"
    >
      <path
        d="M 25.2 19.7 A 32 32 0 1 1 25.2 -19.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <rect x="29" y="-7" width="14" height="14" fill="currentColor" />
    </svg>
  );
}

/** Per-deployment mark: brackets holding the owner's initial. */
export function CookeyMark({
  initial = "c",
  size = 28,
  className,
}: MarkProps & { initial?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-44 -44 88 88"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={`Cookey — ${initial}`}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M -26 -30 H -38 V 30 H -26" />
        <path d="M 26 -30 H 38 V 30 H 26" />
      </g>
      <text
        x="-8"
        y="13"
        fill="currentColor"
        fontSize="40"
        textAnchor="middle"
        fontFamily={MONO_STACK}
      >
        {initial}
      </text>
      <rect x="8" y="3" width="10" height="10" fill="currentColor" />
    </svg>
  );
}
