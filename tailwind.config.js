/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Idinagdag na ang Bristol font
      fontFamily: {
        poppins: ["Poppins", "sans-serif"],
        bristol: ["Bristol", "sans-serif"],
        montserrat: ["Montserrat", "sans-serif"], // Ngayon ay magagamit na bilang 'font-bristol'
      },
      // Iyong ORGINAL na mga kulay, walang binago
      colors: {
        mainColor: "#125648",
        hover: "#0e4036",
        headerColor: "#0d4237",
        bgColor: "#125648",
        teader: "#0A705B",
        object: "#464646",
        white: "#FFFFFF",
        yel: "#ffad01",
      },
    },
  },
  plugins: [],
};
