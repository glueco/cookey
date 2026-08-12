/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ink accent — mirrors the gateway's default brand ramp
        // (apps/proxy/src/app/globals.css, "ink"). This app is a plain
        // static consumer, so the values are inlined rather than
        // var-driven; keep them in step if you re-brand the gateway.
        primary: {
          50: "#f5f4ee",
          100: "#e8e6dd",
          200: "#d9d7ce",
          300: "#bdbaaf",
          400: "#98958a",
          500: "#6e6b62",
          600: "#23221e",
          700: "#1c1b18",
          800: "#171613",
          900: "#12110f",
          950: "#0c0b09",
        },
        // Warm paper-and-ink neutrals (override the default gray scale)
        gray: {
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
    },
  },
  plugins: [],
};
