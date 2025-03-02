import {addBrightness} from 'app/style/styling.utils';

export const colors = {
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },
  red: {
    100: '#ffebee',
    200: '#ffcdd2',
    300: '#ef9a9a',
    400: '#e57373',
    500: '#ef5350',
    600: '#f44336',
    700: '#e53935',
    800: '#d32f2f',
    900: '#c62828',
    get main() {
      return addBrightness(this[500], 44);
    },
  },
  darkRed: {
    100: '#e57373',
    200: '#ef5350',
    300: '#f44336',
    400: '#e53935',
    500: '#d32f2f',
    600: '#c62828',
    700: '#b71c1c',
    800: '#ff1744',
    900: '#d50000',
    get main() {
      return this[500];
    },
  },
  pink: {
    100: '#fce4ec',
    200: '#f8bbd0',
    300: '#f48fb1',
    400: '#f06292',
    500: '#ec407a',
    600: '#e91e63',
    700: '#d81b60',
    800: '#c2185b',
    900: '#ad1457',
  },
  purple: {
    100: '#f3e5f5',
    200: '#e1bee7',
    300: '#ce93d8',
    400: '#ba68c8',
    500: '#ab47bc',
    600: '#9c27b0',
    700: '#8e24aa',
    800: '#7b1fa2',
    900: '#6a1b9a',
  },
  indigo: {
    100: '#e8eaf6',
    200: '#c5cae9',
    300: '#9fa8da',
    400: '#7986cb',
    500: '#5c6bc0',
    600: '#3f51b5',
    700: '#3949ab',
    800: '#303f9f',
    900: '#283593',
  },
  blue: {
    100: '#e3f2fd',
    200: '#bbdefb',
    300: '#90caf9',
    400: '#64b5f6',
    500: '#42a5f5',
    600: '#2196f3',
    700: '#1e88e5',
    800: '#1976d2',
    900: '#1565c0',
  },
  lightBlue: {
    100: '#e1f5fe',
    200: '#b3e5fc',
    300: '#81d4fa',
    400: '#4fc3f7',
    500: '#29b6f6',
    600: '#03a9f4',
    700: '#039be5',
    800: '#0288d1',
    900: '#0277bd',
  },
  cyan: {
    100: '#e0f7fa',
    200: '#b2ebf2',
    300: '#80deea',
    400: '#4dd0e1',
    500: '#26c6da',
    600: '#00bcd4',
    700: '#00acc1',
    800: '#0097a7',
    900: '#00838f',
  },
  teal: {
    100: '#e0f2f1',
    200: '#b2dfdb',
    300: '#80cbc4',
    400: '#4db6ac',
    500: '#26a69a',
    600: '#009688',
    700: '#00897b',
    800: '#00796b',
    900: '#00695c',
  },
  green: {
    100: '#e8f5e9',
    200: '#c8e6c9',
    300: '#a5d6a7',
    400: '#81c784',
    500: '#66bb6a',
    600: '#4caf50',
    700: '#43a047',
    800: '#388e3c',
    900: '#2e7d32',
    get main() {
      return this[600];
    },
  },
  lightGreen: {
    100: '#f1f8e9',
    200: '#dcedc8',
    300: '#c5e1a5',
    400: '#aed581',
    500: '#9ccc65',
    600: '#8bc34a',
    700: '#7cb342',
    800: '#689f38',
    900: '#558b2f',
  },
  lime: {
    100: '#f9fbe7',
    200: '#f0f4c3',
    300: '#e6ee9c',
    400: '#dce775',
    500: '#d4e157',
    600: '#cddc39',
    700: '#c0ca33',
    800: '#afb42b',
    900: '#9e9d24',
  },
  yellow: {
    100: '#fffde7',
    200: '#fff9c4',
    300: '#fff59d',
    400: '#fff176',
    500: '#ffee58',
    600: '#ffeb3b',
    700: '#fdd835',
    800: '#fbc02d',
    900: '#f9a825',
    get main() {
      return this[600];
    },
  },
  darkYellow: {
    100: '#fff59d',
    200: '#fff176',
    300: '#ffee58',
    400: '#ffeb3b',
    500: '#fdd835',
    600: '#fbc02d',
    700: '#f9a825',
    800: '#f57f17',
    900: '#f57f17',
    get main() {
      return this[600];
    },
  },
  amber: {
    100: '#fff8e1',
    200: '#ffecb3',
    300: '#ffe082',
    400: '#ffd54f',
    500: '#ffca28',
    600: '#ffc107',
    700: '#ffb300',
    800: '#ffa000',
    900: '#ff8f00',
  },
  orange: {
    100: '#fff3e0',
    200: '#ffe0b2',
    300: '#ffcc80',
    400: '#ffb74d',
    500: '#ffa726',
    600: '#ff9800',
    700: '#fb8c00',
    800: '#f57c00',
    900: '#ef6c00',
  },
  deepOrange: {
    100: '#fbe9e7',
    200: '#ffccbc',
    300: '#ffab91',
    400: '#ff8a65',
    500: '#ff7043',
    600: '#ff5722',
    700: '#f4511e',
    800: '#e64a19',
    900: '#d84315',
  },
};
