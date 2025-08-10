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

// export const nightScoutUrl = 'https://liad.10be.de/';
// export const nightscoutInstance = axios.create({
//   baseURL: nightScoutUrl,
//   timeout: 5000, // 5 seconds
//   headers: {
//     'Content-Type': 'application/json',
//     'api-secret': '1ae2d0293aaaad06d12562284b9e2ce42dfb27e2', // The secret in sha1 for api requests
//   },
// });
