import {recommendationEvidenceRange} from '../../src/services/aiRecommendations/recommendationEvidenceRange';

const day = 86_400_000;
const now = Date.parse('2026-09-28T12:00:00Z');

describe('recommendation evidence period', () => {
  it('uses the requested month only when no explicit period was selected', () => {
    expect(recommendationEvidenceRange({locale: 'en', request: {kind: 'monthly'}}, now))
      .toMatchObject({startMs: now - 30 * day, endMs: now, explicitPeriod: false});
  });

  it('keeps a historical period instead of silently replacing it with recent data', () => {
    expect(recommendationEvidenceRange({
      locale: 'en', request: {kind: 'weekly'},
      focus: {kind: 'period', startMs: now - 40 * day, endMs: now - 20 * day},
    }, now)).toEqual({startMs: now - 40 * day, endMs: now - 20 * day, days: 20, explicitPeriod: true});
  });

  it('uses a full selected local calendar day', () => {
    const date = new Date(2026, 8, 4);
    const next = new Date(2026, 8, 5);
    expect(recommendationEvidenceRange({
      locale: 'he', request: {kind: 'now'},
      focus: {kind: 'day', dayStartMs: date.getTime()},
    }, now)).toMatchObject({startMs: date.getTime(), endMs: next.getTime()});
  });

  it.each([
    {startMs: now, endMs: now + day},
    {startMs: Number.NaN, endMs: now},
    {startMs: now - day, endMs: now - 2 * day},
    {startMs: now - 31 * day, endMs: now},
  ])('rejects invalid or oversized selections instead of answering about another period: %p', focus => {
    expect(() => recommendationEvidenceRange({
      locale: 'he', request: {kind: 'weekly'}, focus: {kind: 'period', ...focus},
    }, now)).toThrow('valid past period');
  });
});
