/**
 * Tailwind 設定 — 權威值來源：prototypes/00-design-system.html 之 tailwind.config。
 * 逐值移植，勿臆造或簡化色階。若設計系統更新，本檔須同步。
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans TC', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        primary: {
          50: '#F3F7FC',
          100: '#EAF1FA',
          200: '#CFDFF3',
          300: '#98B6E4',
          400: '#6E96D4',
          500: '#4A72AE',
          600: '#365C97',
          700: '#2A4A7E',
        },
      },
    },
  },
  plugins: [],
};
