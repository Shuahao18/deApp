/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {  
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],    
      },
      colors: {
        mainColor: '#125648',
        bgColor: '#125648B2',
      },
    },
  },
  plugins: [],
};
