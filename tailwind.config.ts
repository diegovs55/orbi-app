import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        orbi: {
          black: "#05070d",
          navy: "#081424",
          panel: "#0c1b2d",
          line: "#183450",
          blue: "#1f8bff",
          cyan: "#36d7ff",
          text: "#eef7ff",
          muted: "#91a6bd"
        }
      },
      boxShadow: {
        glow: "0 0 45px rgba(31, 139, 255, 0.22)",
        soft: "0 22px 60px rgba(0, 0, 0, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
