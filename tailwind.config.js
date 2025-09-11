/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'crisp-red': {
          500: '#BF0A30', // A strong, classic red
          600: '#A5092A',
          700: '#8A0722',
        },
        'crisp-blue': {
          500: '#002868', // A deep, royal blue
          600: '#00225A',
          700: '#001D4B',
          800: '#00173D',
        },
        'immigo-green': {
          100: '#D4EDDA',
          500: '#28A745',
          800: '#155724',
        },
        'immigo-gray': {
          100: '#F0F2F5',
          200: '#E4E6E8',
          300: '#D1D9E0',
          500: '#86909E',
          600: '#5A626C',
          700: '#343A40',
        }
      },
      fontFamily: {
        sans: ['"Open Sans"', 'sans-serif'],
      }
    },
  },
  plugins: [],
}