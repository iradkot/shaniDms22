// interface for bg data
export interface BgSample {
  sgv: number;
  date: number; // timestamp in ms
  dateString: string;
  trend: number;
  direction: string;
  device: string;
  type: string;
}

/*
example of bg data
// {
//   sgv: 91,
//     date: 1665321153000,
//   dateString: '2022-10-09T13:12:33.000Z',
//   trend: 5,
//   trendDirection: 'FortyFiveDown',
//   device: 'share2',
//   type: 'sgv'
// }
*/

/**
 * @typedef BgSample
 * @property {number} sgv
 * @property {number} date - timestamp in ms for exmaple 10:30 to 11:10 is new Date().setHours(10, 30, 0, 0) to new Date().setHours(11, 10, 0, 0)
 * @property {string} dateString
 * @property {number} trend
 * @property {string} direction
 * @property {string} device
 * @property {string} type
 */

/**
 * @typedef dayBGs {string} - stringified JSON of BgSample[]
 */

/**
 * @typedef {BgSample[]} DaysBG
 */

/**
 * @typedef dayBgDocument - stringified JSON of DaysBG
 * @property {string} _id
 * @property {dayBGs} data
 * @property {number} timestamp
 */
