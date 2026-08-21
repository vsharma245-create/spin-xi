/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /**
       * The palette is a floodlit evening at the cricket: a deep navy-black
       * sky, willow-tan for anything the player acts on, cut grass for a win,
       * cherry red for a defeat and brass for silverware.
       */
      colors: {
        ink: {
          DEFAULT: '#0A0D13', // page — night sky
          800: '#0E1219', // raised
          700: '#141924', // card
          600: '#1B2130', // card hover
        },
        turf: {
          // green-tinted surfaces — the square in the middle
          950: '#080D0B',
          900: '#0C1411',
          800: '#111C16',
        },
        cream: {
          DEFAULT: '#F4F1E6', // whites, freshly laundered
          dim: '#CBC5B4',
        },
        moss: '#7C8794', // muted secondary text — dusk
        willow: {
          // primary accent — bat willow under lights
          DEFAULT: '#E3A54B',
          bright: '#F2BC6B',
          deep: '#B47C2C',
          ghost: 'rgba(227,165,75,0.12)',
        },
        pitch: {
          // cut grass — wins, positives
          DEFAULT: '#4FA96B',
          bright: '#66C285',
          deep: '#337A4C',
          ghost: 'rgba(79,169,107,0.12)',
        },
        leather: '#C8453A', // the cherry — losses, pace
        gold: '#C9902F', // brass — seasons, trophies, rare
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        display: ['Archivo', 'system-ui', 'sans-serif'],
        editorial: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      letterSpacing: {
        label: '0.16em',
        tight2: '-0.03em',
        tight3: '-0.045em',
      },
      borderRadius: {
        card: '18px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(227,165,75,0.35), 0 0 32px -8px rgba(227,165,75,0.45)',
        'glow-lg': '0 0 0 1px rgba(227,165,75,0.5), 0 0 80px -10px rgba(227,165,75,0.6)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.2s infinite',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
}
