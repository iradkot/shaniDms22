import {buildCurrentDataSnapshot} from '../../../src/modules/currentData';
import cases from '../../fixtures/current-load-parity.json';

describe('current app and widget load contract', () => {
  it.each(cases)('$name', fixture => {
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: fixture.nowMs,
      glucose: null,
      deviceStatus: {
        records: fixture.records,
        freshness: {kind: 'fresh', fetchedAtMs: fixture.nowMs},
      },
    });
    expect(snapshot.iob.status === 'fresh' ? snapshot.iob.value : null).toBe(
      fixture.iob,
    );
    expect(snapshot.cob.status === 'fresh' ? snapshot.cob.value : null).toBe(
      fixture.cob,
    );
  });
});
