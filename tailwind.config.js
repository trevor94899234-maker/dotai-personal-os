/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F0E8",
        panel: "#FFFDF9",
        line: "#E6D6C7",
        ink: "#2A1711",
        muted: "#77645A",
        brand: "#F1641E",
        navy: "#3A211A",
        espresso: "#2A1711",
        copper: "#BD7446",
        cream: "#F2E5D2",
        sand: "#E3C9AA",
        sage: "#5E7763",
        rose: "#A45545",
      },
      fontFamily: {
        sans: ["Inter", "Avenir Next", "SF Pro Display", "Noto Sans HK", "sans-serif"],
        display: ["Georgia", "Times New Roman", "Noto Serif HK", "serif"],
      },
      boxShadow: {
        card: "0 16px 45px rgba(76, 42, 29, 0.09)",
        brand: "0 20px 60px rgba(76, 42, 29, 0.18)",
      },
    },
  },
  plugins: [],
};
