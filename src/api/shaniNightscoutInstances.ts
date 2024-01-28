import axios from 'axios';

export const nightscoutInstance = axios.create({
  baseURL: 'https://shani-cgm.herokuapp.com',
  timeout: 5000, // 5 seconds
  headers: {
    'Content-Type': 'application/json',
    'api-secret': '55a342b44e4c1d0d3c293f90042af4251e150e32',
  },
});
