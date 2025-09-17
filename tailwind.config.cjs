/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/web/app/index.html',
    './src/web/app/src/**/*.{ts,tsx,js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#f8fafc',
          100: '#eef2ff',
          500: '#1e293b',
          600: '#16213a',
          700: '#111b2f',
          800: '#0d1422',
          900: '#090f1a',
        },
        accent: {
          DEFAULT: '#38bdf8',
          soft: 'rgba(56, 189, 248, 0.12)',
          strong: '#0ea5e9',
        },
        warning: '#fbbf24',
        success: '#34d399',
        danger: '#f87171',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      spacing: {
        13: '3.25rem',
        15: '3.75rem',
        18: '4.5rem',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        panel: '0 20px 40px rgba(8, 15, 26, 0.45)',
        glass: '0 30px 60px rgba(15, 23, 42, 0.55)',
      },
      backdropBlur: {
        20: '20px',
      },
      transitionTimingFunction: {
        menu: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
};
