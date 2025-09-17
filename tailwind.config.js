export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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
        emoji: ['"Apple Color Emoji"', '"Segoe UI Emoji"', '"Noto Color Emoji"', '"Segoe UI Symbol"', 'EmojiOneMozilla', 'sans-serif'],
      }
    },
  },
  plugins: [],
}