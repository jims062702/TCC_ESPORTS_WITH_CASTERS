/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Theme-aware tokens (switch between light & dark via CSS variables in index.css)
        bg: token('bg'),
        surface: token('surface'),
        surface2: token('surface-2'),
        line: token('line'),
        fg: token('fg'),
        muted: token('muted'),
        brand: token('brand'),
        'brand-strong': token('brand-strong'),
        accent: token('accent'),
        // Fixed palette sampled from the TCC Esports badge (used by overlays, always dark)
        crimson: {
          50: '#fff1f1',
          100: '#ffdfdf',
          200: '#ffc5c5',
          300: '#ff9d9d',
          400: '#ff5f5f',
          500: '#f8312f',
          600: '#e51d1b',
          700: '#c11512',
          800: '#9f1614',
          900: '#841917',
          950: '#480706',
        },
        ink: {
          50: '#f6f5f6',
          100: '#e7e5e8',
          200: '#d1ced3',
          300: '#b1acb4',
          400: '#8a848e',
          500: '#6f6973',
          600: '#5f5962',
          700: '#4f4a52',
          800: '#322f36',
          900: '#1d1b20',
          950: '#0d0b0e',
        },
        teal: {
          glow: '#3ef0d8',
          deep: '#0e9f8e',
        },
      },
      fontFamily: {
        display: ['Teko', 'Impact', 'system-ui', 'sans-serif'],
        sans: ['Barlow', 'system-ui', 'Segoe UI', 'sans-serif'],
        cond: ['"Barlow Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Glow strength comes from the theme (softer in light mode).
        glow: '0 0 24px rgb(var(--brand) / var(--glow-a, 0.45))',
        'glow-lg': '0 0 60px rgb(var(--brand) / var(--glow-lg-a, 0.35))',
        'glow-teal': '0 0 24px rgba(62, 240, 216, 0.45)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(248, 49, 47, 0.7)' },
          '70%': { boxShadow: '0 0 0 14px rgba(248, 49, 47, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(248, 49, 47, 0)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        scan: 'scan 3s linear infinite',
        shimmer: 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
};
