import {endOfWeek, format, isSameDay, startOfWeek, subDays} from 'date-fns';

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
  return new Date(date).toLocaleDateString(['he'], {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
};

export const formatDateToDateAndTimeString = (date: Date | string | number) => {
  return `${formatDateToLocaleDateString(date)} ${formatDateToLocaleTimeString(
    date,
  )}`;
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

export const getRelativeDateText = (date: Date): string => {
  const today = new Date();
  const yesterday = subDays(today, 1);

  if (isSameDay(date, today)) {
    return `Today, ${format(date, 'MMM d')}`;
  } else if (isSameDay(date, yesterday)) {
    return `Yesterday, ${format(date, 'MMM d')}`;
  } else if (date > subDays(today, 7)) {
    return `${format(date, 'EEEE')}, ${format(date, 'MMM d')}`;
  } else if (
    date >= startOfWeek(subDays(today, 14)) &&
    date <= endOfWeek(subDays(today, 14))
  ) {
    return `${format(date, 'EEEE')}, ${format(date, 'MMM d')}`;
  } else {
    return format(date, 'MMM d');
  }
};

export const getFormattedStartEndOfDay = inputDate => {
  const date = new Date(inputDate);
  const now = new Date();

  // Start of Day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const formattedStartDate = startOfDay.toISOString();

  // End of Day or Current Moment if Today
  let endOfDay;
  if (date.toDateString() === now.toDateString()) {
    // If the input date is today, use current time
    endOfDay = now;
  } else {
    // Else, use the end of the input date
    endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
  }
  const formattedEndDate = endOfDay.toISOString();

  return {formattedStartDate, formattedEndDate};
};
