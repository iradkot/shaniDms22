/* eslint-disable */
/**
 *
 * @param {dayBGs} DayBGs
 * @param {BgSample} bgSample
 * @return {*}
 */
const addBgSampleToDayBgsString = (DayBGs, bgSample) => {
  const dayBgs = JSON.parse(DayBGs);
  dayBgs.push(bgSample);
  return JSON.stringify(dayBgs);
};

/**
 *
 * @param {number} date
 * @return {BgSample}
 */
const createMockBgSample = (date) => {
  const mockBgValue = Math.floor(Math.random() * 100);
  const mockTrend = Math.floor(Math.random() * 10);
  const mockDirection = Math.floor(Math.random() * 10);
  const mockDevice = Math.floor(Math.random() * 10);
  const mockType = Math.floor(Math.random() * 10);
  return {
    date,
    bgValue: mockBgValue,
    trend: mockTrend,
    direction: mockDirection,
    device: mockDevice,
    type: mockType,
  };
};

const milliSecondsInDay = 86400000;
const createMockDayBgs = (startdate, enddate, samplesPerDay = 20) => {
  const days = [];
  const daysCount = Math.floor((enddate - startdate) / milliSecondsInDay);
  for (let i = 0; i < daysCount; i++) {
    const day = [];
    for (let j = 0; j < samplesPerDay; j++) {
      const date = startdate + i * milliSecondsInDay + j * 1000 * 60 * 5;
      const bgSample = createMockBgSample(date);
      day.push(bgSample);
    }
    days.push(day);
  }
  return days;
};

function getDayBgDateId(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${month}-${day}`;
}

function getElapsedTime(date) {
  const now = new Date();
  const elapsed = now - date;
  return elapsed;
}

//get latest bg sample from stringified array of bg samples
/**
 *
 * @param {string} dayBgs
 * @return {BgSample}
 */
function getLatestBgSample(dayBgs) {
  const dayBgsArray = JSON.parse(dayBgs);
  // sort bg samples by date from latest to oldest
  const sortedDayBgsArray = dayBgsArray.sort((a, b) => {
      return b.date - a.date;
    },
  );
  // get latest bg sample
  const latestBgSample = sortedDayBgsArray[0];
  return latestBgSample;
}

exports.getLatestBgSample = getLatestBgSample;

exports.createMockDayBgs = createMockDayBgs;


exports.addBgSampleToDayBgsString = addBgSampleToDayBgsString;
exports.getDayBgDateId = getDayBgDateId;
exports.getElapsedTime = getElapsedTime;
