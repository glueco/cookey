// ============================================
// DEMO APP MARK
// The Cookey parametric bracket mark — [d▪] for "demo" — drawn in
// currentColor so it re-tones with the page. Geometry mirrors the
// gateway's CookeyMark (apps/proxy/src/components/CookeyLogo.tsx);
// this app is a standalone example, so it carries its own copy.
// ============================================

export function DemoMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-44 -44 88 88"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Cookey demo app"
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
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        d
      </text>
      <rect x="8" y="3" width="10" height="10" fill="currentColor" />
    </svg>
  );
}
