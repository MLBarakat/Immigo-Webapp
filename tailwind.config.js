/** @type {import('tailwindcss').Config} */
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
          500: '#FF3D51', // Primary Vibrant Red
          600: '#F02A40',
          700: '#D91C30',
          800: '#C01427',
          900: '#A10D1E',
          'logo': '#BF0A30', // Exact logo red
        },
        // Deep, Vibrant Blue from the logo/flag
        'art-blue': {
          50: '#E6F0FF',
          100: '#CCDDFE',
          200: '#99BFFD',
          300: '#669BFD',
          400: '#3376FC',
          500: '#0055FC', // Primary Vibrant Blue
          600: '#0047D9',
          700: '#003BAF',
          800: '#002E8A',
          900: '#002266',
          'logo': '#002868', // Exact logo blue
        },
        // Bright white for clean backgrounds and text
        'star-white': '#FFFFFF',
        // Deep navy for strong foundational text and elements
        'deep-navy': '#0A1D3A',
        // Accent gold for subtle highlights or processing states
        'accent-gold': '#FFD700',

        // Green for active/success states
        'immigo-green': {
          100: '#D4EDDA',
          500: '#28A745',
          800: '#155724',
        },
        // Grays for neutral elements and borders
        'immigo-gray': {
          50: '#F8F9FA',
          100: '#F1F3F5',
          200: '#E9ECEF',
          300: '#DEE2E6',
          500: '#ADB5BD',
          600: '#6C757D',
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