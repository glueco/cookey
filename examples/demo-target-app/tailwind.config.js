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
        // Caramel amber accent (matches the Cookey gateway app)
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
        // Warm neutrals (override the cool default gray scale)
        gray: {
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
    },
  },
  plugins: [],
};
