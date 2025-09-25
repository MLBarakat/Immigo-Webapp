export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'text-sm',
    'text-base',
    'text-lg',
  ],
  theme: {
    extend: {
      colors: {
        'art-red': { 50: '#FFF1F2', 100: '#FFE4E6', 200: '#FFC0C7', 300: '#FF99A4', 400: '#FF6F7E', 500: '#FF3D51', 600: '#DC2626', 700: '#D91C30', 800: '#C01427', 900: '#A10D1E', 'logo': '#BF0A30', },
        'art-blue': { 50: '#E6F0FF', 100: '#CCDDFE', 200: '#99BFFD', 300: '#669BFD', 400: '#3376FC', 500: '#0055FC', 600: '#2563EB', 700: '#003BAF', 800: '#002E8A', 900: '#002266', 'logo': '#002868', },
        'accent-cyan': { 50: '#E0F8FF', 100: '#B3F0FF', 200: '#80E7FF', 300: '#4DDFFF', 400: '#26D7FF', 500: '#00CFFF', 600: '#00A6D9', 700: '#007EAF', 800: '#00568A', 900: '#003A66', },
        'star-white': '#FFFFFF',
        'deep-navy': '#0A1128',
        'immigo-gray': { 50: '#F9FAFB', 100: '#F1F3F5', 200: '#E5E7EB', 300: '#DEE2E6', 500: '#ADB5BD', 600: '#4B5563', 700: '#495057', }
      },
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
        display: ['"Inter"', 'sans-serif'],
      },
      keyframes: {
        'fill-wave': {
          '0%': { transform: 'translateY(100%)' },
          '50%': { transform: 'translateY(40%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        waveform: {
          '0%, 100%': { transform: 'scaleY(0.2)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'circular-roll': {
          from: { transform: 'rotate(0deg) translateX(30px) rotate(0deg)' },
          to: { transform: 'rotate(360deg) translateX(30px) rotate(-360deg)' },
        },
        'hourglass-intro': {
          from: { transform: 'scale(0.3)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(0.95)' },
          '50%': { transform: 'scale(1.05)' },
        },
        'surface-flow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'orb-intro': {
            'from': { transform: 'scale(0.2)', opacity: '0.5' },
            'to': { transform: 'scale(1.05)', opacity: '1' },
        },
        scan: {
            'from': { top: '-10%' },
            'to': { top: '110%' },
        },
        'scan-glitch': {
            '0%, 100%': { transform: 'translateX(0)' },
            '25%': { transform: 'translateX(-5px)' },
            '50%': { transform: 'translateX(5px)' },
            '75%': { transform: 'translateX(-2px)' },
        },
        'error-intro': {
            '0%': { transform: 'scale(0.2) rotate(-180deg)', opacity: '0' },
            '60%': { transform: 'scale(1.1) rotate(10deg)' },
            '80%': { transform: 'scale(0.95) rotate(-5deg)' },
            '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
      },
      animation: {
        'fill-wave': 'fill-wave 4s ease-in-out infinite',
        'waveform-bar': 'waveform 1.2s ease-in-out infinite',
        'gravity-particle': 'circular-roll 3s linear infinite',
        'hourglass-intro': 'hourglass-intro 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards',
        'orb': 'breathe 5s ease-in-out infinite',
        'orb-surface': 'surface-flow 25s linear infinite',
        'orb-intro': 'orb-intro 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards, breathe 5s ease-in-out infinite 0.5s',
        'scan': 'scan 3s linear infinite',
        'scan-glitch': 'scan-glitch 0.2s linear',
        'error-intro': 'error-intro 0.6s cubic-bezier(0.5, 0, 0.1, 1) forwards',
      },
    },
  },
  plugins: [],
}