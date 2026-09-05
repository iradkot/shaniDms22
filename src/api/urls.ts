type ApiDate = string | number;

export const INSULIN_DATA_URL = (date: ApiDate) =>
  `/api/v1/treatments?date=${date}`;
export const BG_DATA_URL = (date: ApiDate) => `/api/v1/entries?date=${date}`;
