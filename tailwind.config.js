/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6f6',
          100: '#d5eaea',
          200: '#aed5d6',
          300: '#7fb8ba',
          400: '#529699',
          500: '#387b7e',
          600: '#1d5b5e',
          700: '#184a4d',
          800: '#163c3e',
          900: '#143334',
        },
        surface: {
          DEFAULT: '#f6f7f6',
          card: '#ffffff',
          muted: '#f0f2f1',
        },
        ink: {
          DEFAULT: '#1a2324',
          secondary: '#4a5658',
          muted: '#7a8688',
          faint: '#a8b0b2',
        },
        status: {
          success: '#2d7a5f',
          warning: '#b8860b',
          error: '#b54a4a',
          info: '#387b7e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(26, 35, 36, 0.06), 0 1px 2px rgba(26, 35, 36, 0.04)',
        'card-hover': '0 4px 12px rgba(26, 35, 36, 0.08), 0 2px 4px rgba(26, 35, 36, 0.04)',
        nav: '0 -1px 8px rgba(26, 35, 36, 0.06)',
      },
      borderRadius: {
        '2.5xl': '1.25rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'check-pop': {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out forwards',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        'check-pop': 'check-pop 0.35s ease-out forwards',
        'slide-up': 'slide-up 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
};
