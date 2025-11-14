import Typography from '@tailwindcss/typography';
import TailwindcssAnimate from 'tailwindcss-animate';
import { fontFamily } from 'tailwindcss/defaultTheme';

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
  theme: {

  },
  plugins: [Typography, TailwindcssAnimate],
  corePlugins: {},
};
