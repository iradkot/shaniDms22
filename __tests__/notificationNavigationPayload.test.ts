import {
  readNotificationData,
  readString,
} from '../src/services/notifications/notificationNavigationPayload';

describe('notification navigation payload', () => {
  it('reads Firebase Messaging top-level data', () => {
    expect(
      readNotificationData({
        data: {route: 'DailyReview', occurrenceId: 'occurrence-1'},
      }),
    ).toEqual({route: 'DailyReview', occurrenceId: 'occurrence-1'});
  });

  it('reads Notifee nested data before top-level data', () => {
    expect(
      readNotificationData({
        data: {route: 'wrong'},
        notification: {data: {route: 'HypoInvestigation'}},
      }),
    ).toEqual({route: 'HypoInvestigation'});
  });

  it('drops non-string values from an untrusted payload', () => {
    expect(
      readNotificationData({
        data: {route: 'DailyReview', retryCount: 2, enabled: true},
      }),
    ).toEqual({route: 'DailyReview'});
  });

  it('rejects invalid envelopes and non-string scalar values', () => {
    expect(readNotificationData(null)).toBeUndefined();
    expect(readNotificationData({notification: {data: 42}})).toBeUndefined();
    expect(readString(42)).toBeUndefined();
    expect(readString('rule-1')).toBe('rule-1');
  });
});
