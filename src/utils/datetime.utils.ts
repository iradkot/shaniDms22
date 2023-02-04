export const formatMinutesToLocaleTimeString = (minutes: number) => {
  let hours: number | string = Math.floor(minutes / 60);
  if (hours < 10) {
    hours = `0${hours}`;
  }
  let minutesLeft: number | string = minutes % 60;
  if (minutesLeft < 10) {
    minutesLeft = `0${minutesLeft}`;
  }
  return `${hours}:${minutesLeft}`;
};
export const getTimeInMinutes = (date: Date) => {
  return date.getHours() * 60 + date.getMinutes();
};

export const formatDateToLocaleTimeString = (date: Date | string | number) => {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateToLocaleDateString = (date: Date | string | number) => {
  return new Date(date).toLocaleDateString();
};

// get the local start of the day in utc time
export const getLocalStartOfTheDay = (date: Date | number) => {
  const startOfTheDay = new Date(date);
  startOfTheDay.setHours(0, 0, 0, 0);
  return startOfTheDay;
};

// get the local end of the day in utc time
export const getLocalEndOfTheDay = (date: Date) => {
  const endOfTheDay = new Date(date);
  endOfTheDay.setHours(23, 59, 59, 999);
  return endOfTheDay;
};

export const getUtcStartOfTheDay = (date: Date) => {
  const utcStartOfTheDay = new Date(date);
  utcStartOfTheDay.setUTCHours(0, 0, 0, 0);
  return utcStartOfTheDay;
};

export const getUtcEndOfTheDay = (date: Date) => {
  const utcEndOfTheDay = new Date(date);
  utcEndOfTheDay.setUTCHours(23, 59, 59, 999);
  return utcEndOfTheDay;
};
