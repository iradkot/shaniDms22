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
