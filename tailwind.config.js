/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.{html,js,ts,jsx,tsx}",
    "./src/**/*.{html,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'system-ui', 'sans-serif'],
        'mono': ['SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', 'Consolas', 'Courier New', 'monospace'],
      },
      fontSize: {
        // Enhanced typography scale following Minor Third (1.200) ratio
        'micro': ['0.694rem', { lineHeight: '1rem' }],      // 11.1px
        'small': ['0.833rem', { lineHeight: '1.25rem' }],   // 13.3px  
        'base': ['1rem', { lineHeight: '1.5rem' }],         // 16px
        'lg': ['1.2rem', { lineHeight: '1.75rem' }],        // 19.2px
        'xl': ['1.44rem', { lineHeight: '2rem' }],          // 23px
        '2xl': ['1.728rem', { lineHeight: '2.25rem' }],     // 27.6px
        '3xl': ['2.074rem', { lineHeight: '2.5rem' }],      // 33.2px  
        '4xl': ['2.488rem', { lineHeight: '3rem' }],        // 39.8px
        'display': ['2.986rem', { lineHeight: '3.5rem' }],  // 47.8px
      },
      colors: {
        // Enhanced StratoSort brand colors - Modern, professional palette
        'stratosort': {
          'blue': '#2563EB',      // Primary brand blue - more vibrant
          'light-blue': '#3B82F6', // Lighter variant
          'dark-blue': '#1D4ED8',  // Darker variant
          'deep-blue': '#1E40AF',  // Deepest blue
          'gold': '#F59E0B',       // Refined gold accent
          'accent': '#EF4444',     // Modern red accent
          'success': '#10B981',    // Success green
          'warning': '#F59E0B',    // Warning amber
        },
        // Enhanced system colors with better contrast and accessibility
        'system': {
          'blue': '#2563EB',
          'green': '#10B981',
          'orange': '#F59E0B', 
          'red': '#EF4444',
          'purple': '#8B5CF6',
          'pink': '#EC4899',
          'gray': {
            '25': '#FCFCFD',   // Ultra light
            '50': '#F8FAFC',   // Background
            '100': '#F1F5F9',  // Light background
            '200': '#E2E8F0',  // Border light
            '300': '#CBD5E1',  // Border
            '400': '#94A3B8',  // Muted text
            '500': '#64748B',  // Text secondary
            '600': '#475569',  // Text primary
            '700': '#334155',  // Text strong
            '800': '#1E293B',  // Text stronger
            '900': '#0F172A',  // Text strongest
            '950': '#020617',  // Almost black
          }
        },
        // Additional semantic colors for better UX
        'surface': {
          'primary': '#FFFFFF',
          'secondary': '#F8FAFC',
          'tertiary': '#F1F5F9',
          'elevated': '#FFFFFF',
        },
        'border': {
          'light': '#E2E8F0',
          'medium': '#CBD5E1',
          'strong': '#94A3B8',
        }
      },
      spacing: {
        // Golden ratio based spacing using Fibonacci sequence
        'fib-1': '1px',
        'fib-2': '2px',
        'fib-3': '3px',
        'fib-5': '5px',
        'fib-8': '8px',
        'fib-13': '13px',
        'fib-21': '21px',
        'fib-34': '34px',
        'fib-55': '55px',
        'fib-89': '89px',
        'fib-144': '144px',
        'fib-233': '233px',
        'fib-377': '377px',
      },
      borderRadius: {
        'xs': '2px',
        'sm': '3px',
        'md': '5px',
        'lg': '8px',
        'xl': '13px',
        '2xl': '21px',
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'sm': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'stratosort': '0 4px 14px 0 rgba(37, 99, 235, 0.15)',
        'stratosort-lg': '0 8px 25px 0 rgba(37, 99, 235, 0.2)',
        'glow': '0 0 20px rgba(37, 99, 235, 0.3)',
        'inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-out': 'fadeOut 0.2s cubic-bezier(0.4, 0, 1, 1)',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'shake': 'shake 0.3s ease-in-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'bounce-subtle': 'bounceSubtle 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeOut: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-8px)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-3px)' },
          '75%': { transform: 'translateX(3px)' },
        },
        pulseGlow: {
          '0%, 100%': { 
            boxShadow: '0 0 15px rgba(37, 99, 235, 0.3)',
            transform: 'scale(1)' 
          },
          '50%': { 
            boxShadow: '0 0 25px rgba(37, 99, 235, 0.4), 0 0 35px rgba(37, 99, 235, 0.2)',
            transform: 'scale(1.02)' 
          },
        },
        bounceSubtle: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'bounce-smooth': 'cubic-bezier(0.34, 0.55, 0.89, 1)',
      },
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '20px',
      }
    },
  },
  plugins: [],
} 