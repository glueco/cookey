// ============================================
// COOKEY LOGO
// A golden cookie whose "chips" are four-point sparkles.
// Pure inline SVG — no assets, themes automatically via currentColor
// accents where needed. Use `size` for pixel dimensions.
// ============================================

interface CookeyLogoProps {
  size?: number;
  className?: string;
}

/** Four-point sparkle (Gemini-style star) centered at (cx, cy). */
function Sparkle({
  cx,
  cy,
  r,
  fill,
  opacity = 1,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity?: number;
}) {
  // Concave diamond: tips at N/E/S/W, pinched waist via quadratic curves.
  const d = [
    `M ${cx} ${cy - r}`,
    `Q ${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy}`,
    `Q ${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r}`,
    `Q ${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy}`,
    `Q ${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r}`,
    "Z",
  ].join(" ");
  return <path d={d} fill={fill} opacity={opacity} />;
}

export function CookeyLogo({ size = 28, className }: CookeyLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Cookey"
    >
      <defs>
        <radialGradient id="cookey-base" cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#F5C97B" />
          <stop offset="55%" stopColor="#E8A954" />
          <stop offset="100%" stopColor="#C97F35" />
        </radialGradient>
        <radialGradient id="cookey-rim" cx="50%" cy="50%" r="50%">
          <stop offset="82%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#8A5220" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id="cookey-spark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFDF6" />
          <stop offset="100%" stopColor="#FFE9BE" />
        </linearGradient>
      </defs>

      {/* Cookie body — softly irregular edge */}
      <path
        d="M32 3.5
           c4.4 0 6.3 2.6 10.2 3.5 3.9.9 7.5-.4 10.3 2.4 2.8 2.8 1.5 6.4 2.4 10.3.9 3.9 3.6 5.8 3.6 10.3 0 4.4-2.7 6.4-3.6 10.3-.9 3.9.4 7.5-2.4 10.3-2.8 2.8-6.4 1.5-10.3 2.4-3.9.9-5.8 3.5-10.2 3.5-4.4 0-6.3-2.6-10.2-3.5-3.9-.9-7.5.4-10.3-2.4-2.8-2.8-1.5-6.4-2.4-10.3C8.2 36.4 5.5 34.4 5.5 30c0-4.5 2.7-6.4 3.6-10.3.9-3.9-.4-7.5 2.4-10.3 2.8-2.8 6.4-1.5 10.3-2.4C25.7 6.1 27.6 3.5 32 3.5Z"
        fill="url(#cookey-base)"
      />
      <path
        d="M32 3.5
           c4.4 0 6.3 2.6 10.2 3.5 3.9.9 7.5-.4 10.3 2.4 2.8 2.8 1.5 6.4 2.4 10.3.9 3.9 3.6 5.8 3.6 10.3 0 4.4-2.7 6.4-3.6 10.3-.9 3.9.4 7.5-2.4 10.3-2.8 2.8-6.4 1.5-10.3 2.4-3.9.9-5.8 3.5-10.2 3.5-4.4 0-6.3-2.6-10.2-3.5-3.9-.9-7.5.4-10.3-2.4-2.8-2.8-1.5-6.4-2.4-10.3C8.2 36.4 5.5 34.4 5.5 30c0-4.5 2.7-6.4 3.6-10.3.9-3.9-.4-7.5 2.4-10.3 2.8-2.8 6.4-1.5 10.3-2.4C25.7 6.1 27.6 3.5 32 3.5Z"
        fill="url(#cookey-rim)"
      />

      {/* Sparkle chips */}
      <Sparkle cx={24} cy={22} r={7.5} fill="url(#cookey-spark)" />
      <Sparkle cx={42} cy={30} r={5.5} fill="url(#cookey-spark)" opacity={0.95} />
      <Sparkle cx={28} cy={42} r={4.5} fill="url(#cookey-spark)" opacity={0.9} />
      <Sparkle cx={40} cy={15.5} r={3} fill="url(#cookey-spark)" opacity={0.85} />
      <Sparkle cx={16} cy={34} r={2.6} fill="url(#cookey-spark)" opacity={0.8} />
    </svg>
  );
}
