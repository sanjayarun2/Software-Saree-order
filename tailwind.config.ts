import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
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
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#4f46e5",
          600: "#4338ca",
          700: "#3730a3",
          800: "#312e81",
          900: "#1e1b4b",
          950: "#0f0d2e",
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
