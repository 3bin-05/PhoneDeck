/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/*/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        void: {
          bg: '#000000',
          card: '#09090D',
          border: 'rgba(255, 255, 255, 0.08)',
          accent: '#7C5CFF',
          accentDim: 'rgba(124, 92, 255, 0.15)',
          text: '#EDEDF2',
          muted: '#71717A',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', '"Roboto Mono"', 'Menlo', 'monospace'],
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
