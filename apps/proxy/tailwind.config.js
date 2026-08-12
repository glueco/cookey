/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand accent. Reserved for primary actions, active nav, focus
        // rings and selection — never for status, so it can't be
        // confused with allowed/denied signals.
        //
        // Values live in ONE place: the brand palette block at the top
        // of src/app/globals.css. Nothing here needs editing to
        // re-brand the app — that's the whole point of the indirection.
        primary: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
          // Theme-aware aliases: these already account for light vs
          // dark, so `bg-primary-accent` needs no `dark:` twin.
          accent: "rgb(var(--primary) / <alpha-value>)",
          "accent-hover": "rgb(var(--primary-hover) / <alpha-value>)",
          "accent-soft": "rgb(var(--primary-soft) / <alpha-value>)",
          on: "rgb(var(--on-primary) / <alpha-value>)",
        },
        // Neutrals: warm paper-and-ink, anchored to the logo sheets
        // (#FAF9F5 paper, #21201C ink chip, #D9D7CE hairline). Pages use
        // `slate-*` throughout, so the whole app re-tones from this one
        // block — do NOT paste Tailwind's stock slate here.
        slate: {
          50: "#faf9f5",
          100: "#f3f1ea",
          200: "#e6e3d9",
          300: "#d2cfc2",
          400: "#a3a093",
          500: "#767267",
          600: "#58554c",
          700: "#44423b",
          800: "#2b2a25",
          900: "#21201c",
          950: "#161512",
        },
      },
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SF Mono",
          "Menlo",
          "Fira Code",
          "monospace",
        ],
      },
      // Layered, low-opacity shadows. Premium surfaces read as "lifted
      // paper", not "drop shadow" — hence two stacked layers with a
      // hairline top ring rather than one big blur.
      boxShadow: {
        xs: "0 1px 2px 0 rgb(24 22 16 / 0.04)",
        sm: "0 1px 2px 0 rgb(24 22 16 / 0.05), 0 1px 1px -1px rgb(24 22 16 / 0.04)",
        md: "0 2px 4px -1px rgb(24 22 16 / 0.06), 0 4px 12px -2px rgb(24 22 16 / 0.08)",
        lg: "0 4px 8px -2px rgb(24 22 16 / 0.06), 0 12px 28px -4px rgb(24 22 16 / 0.10)",
        xl: "0 8px 16px -4px rgb(24 22 16 / 0.08), 0 24px 48px -8px rgb(24 22 16 / 0.14)",
        ring: "0 0 0 1px rgb(24 22 16 / 0.06)",
        focus: "0 0 0 3px rgb(var(--primary) / 0.28)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        shimmer:
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "fade-in-up": "fadeInUp 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in-down": "fadeInDown 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.16s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
        shimmer: "shimmer 1.8s infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      transitionTimingFunction: {
        // "Out-expo"-ish: fast start, long settle. The single easing
        // that makes an interface feel expensive rather than springy.
        premium: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
