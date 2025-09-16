export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Vibrant Red from the logo/flag
        'art-red': {
          50: '#FFF1F2',
          100: '#FFE4E6',
          200: '#FFC0C7',
          300: '#FF99A4',
          400: '#FF6F7E',
          500: '#FF3D51',
          600: '#F02A40', // Primary Red for alerts/destructive actions
          700: '#D91C30',
          800: '#C01427',
          900: '#A10D1E',
          'logo': '#BF0A30',
        },
        // Deep, Vibrant Blue from the logo/flag
        'art-blue': {
          50: '#E6F0FF',
          100: '#CCDDFE',
          200: '#99BFFD',
          300: '#669BFD',
          400: '#3376FC',
          500: '#0055FC',
          600: '#0047D9', // Primary Blue for actions
          700: '#003BAF',
          800: '#002E8A',
          900: '#002266',
          'logo': '#002868',
        },
        // NEW Accent color from the logo's star
        'accent-cyan': {
          50: '#E0F8FF',
          100: '#B3F0FF',
          200: '#80E7FF',
          300: '#4DDFFF',
          400: '#26D7FF', // Primary Accent
          500: '#00CFFF',
          600: '#00A6D9',
          700: '#007EAF',
          800: '#00568A',
          900: '#003A66',
        },
        // Base colors
        'star-white': '#FFFFFF',
        'deep-navy': '#0A1D3A', // Primary Text
        'immigo-gray': {
          50: '#F8F9FA',   // Primary Background
          100: '#F1F3F5',
          200: '#E9ECEF',
          300: '#DEE2E6',
          500: '#ADB5BD',
          600: '#6C757D',   // Secondary Text
          700: '#495057',
        }
      },
      fontFamily: {
        sans: ['"Roboto"', 'sans-serif'],
        display: ['"Lato"', 'sans-serif'],
        emoji: ['"Apple Color Emoji"', '"Segoe UI Emoji"', '"Noto Color Emoji"', '"Segoe UI Symbol"', 'EmojiOneMozilla', 'sans-serif'],
      }
    },
  },
  plugins: [],
}