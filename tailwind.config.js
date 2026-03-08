/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Elite Lime design system */
        brand: {
          50:  '#f7ffe0',
          100: '#eeffb3',
          200: '#d9ff70',
          300: '#c8f542',
          400: '#b8eb1a',  /* PRIMARY */
          500: '#a0d400',
          600: '#84b000',
          700: '#648700',
          800: '#486200',
          900: '#2e3e00',
          950: '#1a2300',
        },
        surface: {
          0: 'var(--surface-50)',
          bg: 'var(--surface-bg)',
          50: 'var(--surface-50)',
          100: 'var(--surface-100)',
          200: 'var(--surface-200)',
          300: 'var(--surface-300)',
          400: 'var(--surface-400)',
          500: 'var(--surface-500)',
          600: 'var(--surface-600)',
          700: 'var(--surface-700)',
          800: 'var(--surface-800)',
          900: 'var(--surface-900)',
        },
        /* Semantic text — readable on dark backgrounds */
        textReadable: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        /* Role-specific accent — all resolve to lime via role-themes.css */
        candidate: {
          50: '#f7ffe0',
          100: '#eeffb3',
          200: '#d9ff70',
          300: '#c8f542',
          400: '#b8eb1a',
          500: '#a0d400',
          600: '#84b000',
          700: '#648700',
          800: '#486200',
          900: '#2e3e00',
        },
        recruiter: {
          50: '#f7ffe0',
          100: '#eeffb3',
          200: '#d9ff70',
          300: '#c8f542',
          400: '#b8eb1a',
          500: '#a0d400',
          600: '#84b000',
          700: '#648700',
          800: '#486200',
          900: '#2e3e00',
        },
        admin: {
          50: '#f7ffe0',
          100: '#eeffb3',
          200: '#d9ff70',
          300: '#c8f542',
          400: '#b8eb1a',
          500: '#a0d400',
          600: '#84b000',
          700: '#648700',
          800: '#486200',
          900: '#2e3e00',
        },
        success: { 500: '#22c55e', 600: '#16a34a' },
        warning: { 500: '#f59e0b', 600: '#d97706' },
        danger: { 500: '#ef4444', 600: '#dc2626' },
        /* WCAG AA semantic (use these for error/success text on dark bg) */
        error: {
          DEFAULT: 'var(--color-error)',
          light: 'var(--color-error-light)',
          dark: 'var(--color-error-dark)',
        },
        successSemantic: {
          DEFAULT: 'var(--color-success)',
          light: 'var(--color-success-light)',
          dark: 'var(--color-success-dark)',
        },
      },
      fontFamily: {
        sans: ['var(--font-satoshi)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
        display: ['var(--font-cabinet)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'elevated': '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)',
        'card': '0 1px 3px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.03)',
        'modal': '0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.06)',
        'glow': '0 0 24px -4px var(--role-glow, rgba(184,235,26,0.15))',
        'lime': '0 0 20px -4px rgba(184, 235, 26, 0.25)',
        'lime-lg': '0 0 40px -8px rgba(184, 235, 26, 0.35)',
        'lime-sm': '0 0 10px -2px rgba(184, 235, 26, 0.20)',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      transitionDuration: {
        '400': '400ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'hero-in': 'heroIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'hero-content': 'heroContent 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'hero-glow': 'heroGlow 8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        heroIn: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        heroContent: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        heroGlow: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
};
