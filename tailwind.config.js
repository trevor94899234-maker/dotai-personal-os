/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f8fb",
        panel: "#ffffff",
        line: "#e6edf5",
        ink: "#11243a",
        muted: "#66758a",
        brand: "#3b82f6",
        navy: "#003153"
      },
      fontFamily: {
        sans: ["Inter", "Avenir Next", "SF Pro Display", "sans-serif"]
      }
    }
  },
  plugins: []
};
