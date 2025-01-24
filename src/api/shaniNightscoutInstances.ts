import axios from 'axios';

export const nightScoutUrl = 'https://shani-dms.jumpingcrab.com';
export const nightscoutInstance = axios.create({
  baseURL: nightScoutUrl,
  timeout: 5000, // 5 seconds
  headers: {
    'Content-Type': 'application/json',
    'api-secret': '55a342b44e4c1d0d3c293f90042af4251e150e32', // The secret in sha1 for api requests
  },
});
