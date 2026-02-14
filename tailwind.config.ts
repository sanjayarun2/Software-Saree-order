import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        geist: ["var(--font-geist)", "Geist", "system-ui", "sans-serif"],
      },
      colors: {
        primary: {
          50: "#fdf4f6",
          100: "#fce8ec",
          200: "#f9d5de",
          300: "#f4b4c5",
          400: "#ec86a2",
          500: "#e05a7f",
          600: "#cc3d64",
          700: "#ac2d52",
          800: "#902946",
          900: "#7a273e",
          950: "#47111f",
        },
        bento: {
          bg: "var(--bento-bg)",
          card: "var(--bento-card)",
          border: "var(--bento-border)",
        },
      },
      borderRadius: {
        bento: "16px",
      },
      minHeight: {
        touch: "50px",
      },
      minWidth: {
        touch: "50px",
      },
    },
  },
  plugins: [],
};

export default config;
