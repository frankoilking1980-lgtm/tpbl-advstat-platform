/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0F19',
        card: '#111827',
        cardBorder: '#1F2937',
        tpbl: {
          gold: '#E5B842',
          amber: '#F59E0B',
          dreamers: '#10B981', // 夢想家綠
          kings: '#FBBF24',    // 國王黃/金
          accent: '#3B82F6',
        },
      },
    },
  },
  plugins: [],
};
