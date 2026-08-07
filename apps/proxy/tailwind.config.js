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
        // Brand accent: caramel amber (the cookie). Used for primary
        // actions, active nav, focus states.
        primary: {
          50: "#fdf8ef",
          100: "#faeed9",
          200: "#f4dab2",
          300: "#edc181",
          400: "#e5a44e",
          500: "#df8d2b",
          600: "#d17420",
          700: "#ad5a1d",
          800: "#8b481e",
          900: "#713c1c",
          950: "#3d1d0c",
        },
        // Warm neutrals: pages use `slate-*` throughout, so the whole
        // app shifts to this warmer scale from one place. Do not use
        // Tailwind's cool slate values here.
        slate: {
          50: "#fafaf9",
          100: "#f4f4f2",
          200: "#e6e5e1",
          300: "#d4d3cd",
          400: "#a3a29b",
          500: "#75746d",
          600: "#57564f",
          700: "#44433d",
          800: "#2b2a27",
          900: "#1c1b19",
          950: "#121110",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgb(59 130 246 / 0.3)",
        "glow-md": "0 0 20px rgb(59 130 246 / 0.4)",
        "glow-lg": "0 0 30px rgb(59 130 246 / 0.5)",
        "inner-glow": "inset 0 2px 4px 0 rgb(255 255 255 / 0.05)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        shimmer:
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "fade-in-up": "fadeInUp 0.3s ease-out",
        "fade-in-down": "fadeInDown 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "spin-slow": "spin 3s linear infinite",
        "bounce-subtle": "bounceSubtle 2s ease-in-out infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        bounceSubtle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 5px rgb(59 130 246 / 0.3)" },
          "50%": { boxShadow: "0 0 20px rgb(59 130 246 / 0.5)" },
        },
      },
      transitionTimingFunction: {
        "bounce-in": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
