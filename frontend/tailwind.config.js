/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aether: {
          bg: "#030712",
          panel: "rgba(15,23,42,0.7)",
          border: "rgba(99,102,241,0.15)",
          primary: "#6366f1",
          accent: "#38bdf8",
          success: "#34d399",
          warning: "#fbbf24",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(99,102,241,0.2)",
        "glow-lg": "0 0 60px rgba(99,102,241,0.3)",
      },
    },
  },
  plugins: [],
};
