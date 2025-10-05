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
        hover: "#0e4036",
        headerColor:"#0d4237",
        bgColor: '#125648',
        teader: '#0A705B',
        object: '#464646',
        white: '#FFFFFF'
      },
    },
  },
  plugins: [],
};
