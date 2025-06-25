/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{html,js,ts,jsx,tsx}',
    './src/**/*.{html,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'stratosort': {
          primary: 'var(--stratosort-primary)',
          'primary-dark': 'var(--stratosort-primary-dark)',
          'primary-light': 'var(--stratosort-primary-light)',
        },
        'glass': {
          white: 'var(--glass-white)',
          'white-strong': 'var(--glass-white-strong)',
          border: 'var(--glass-border)',
          backdrop: 'var(--glass-backdrop)',
        },
        'text-glass': {
          DEFAULT: 'var(--text-on-glass)',
          light: 'var(--text-on-glass-light)',
          muted: 'var(--text-on-glass-muted)',
        }
      },
      animation: {
        'gradient-shift': 'gradient-shift 3s ease-in-out infinite',
        'fade-in-up': 'fadeInUp 0.8s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      boxShadow: {
        'glass': 'var(--shadow-glass)',
        'glass-hover': 'var(--shadow-glass-hover)',
        'glass-strong': 'var(--shadow-glass-strong)',
      },
      backdropBlur: {
        'glass': '16px',
        'glass-strong': '24px',
        'glass-light': '12px',
      }
    }
  },
  plugins: []
}; 