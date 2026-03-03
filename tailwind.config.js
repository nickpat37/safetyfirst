/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["'Faculty Glyphic'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
