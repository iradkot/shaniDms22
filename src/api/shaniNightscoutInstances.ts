import axios from 'axios';

export const nightscoutInstance = axios.create({
  baseURL: 'shani-dms.jumpingcrab.com',
  timeout: 5000, // 5 seconds
  headers: {
    'Content-Type': 'application/json',
    'api-secret': 'jvA4cWn9c7zxgTyZ',
  },
});
