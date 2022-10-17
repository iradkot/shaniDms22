// interface for bg data
export interface BgSample {
  sgv: number;
  date: number;
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
//   direction: 'FortyFiveDown',
//   device: 'share2',
//   type: 'sgv'
// }
*/

/**
 * @typedef BgSample
 * @property {number} sgv
 * @property {number} date
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
