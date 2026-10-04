import {decodeEstimatedBasalProfile} from 'app/services/insulin/estimatedBasalProfile';

const asOfMs = Date.parse('2026-10-04T09:00:00Z');
const row = {
  startDate: '2026-10-01T00:00:00Z',
  defaultProfile: 'Default',
  store: {
    Default: {
      timezone: 'Asia/Jerusalem',
      basal: [{time: '00:00', timeAsSeconds: '0', value: '0.8'}],
    },
  },
};
describe('effective basal profile decoding', () => {
  it('retains the selected schedule and timezone', () => {
    expect(decodeEstimatedBasalProfile([row], asOfMs)).toEqual({
      timeZone: 'Asia/Jerusalem',
      entries: [{time: '00:00', timeAsSeconds: 0, value: 0.8}],
    });
  });
  it.each([
    {...row, startDate: '2026-10-05T00:00:00Z'},
    {...row, startDate: 'invalid'},
    {...row, defaultProfile: 'missing'},
    {...row, store: {Default: {basal: [{time: '00:00', value: null}]}}},
  ])('declines missing or invalid effective schedules', value => {
    expect(decodeEstimatedBasalProfile([value], asOfMs)).toBeUndefined();
  });
});
