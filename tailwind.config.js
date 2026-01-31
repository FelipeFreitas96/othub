/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ot: {
          panel: '#1a1a1a',
          border: '#292929',
          'border-light': '#747474',
          dark: '#0d0d0d',
          text: '#c0c0c0',
          'text-bright': '#ffffe7',
          hover: 'rgba(255,255,255,0.1)',
          bar: {
            health: '#8b0000',
            mana: '#1a1a8b',
            border: '#4a4a4a',
          }
        }
      },
      fontFamily: {
        verdana: ['Verdana', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'ot-panel': 'inset 0 0 0 1px rgba(0,0,0,0.5)',
      }
    },
  },
  plugins: [],
}
