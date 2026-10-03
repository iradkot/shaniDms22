import {
  assertGlucoseForecastAllowed,
  assertRecommendationAllowed,
  getReleaseSafetyPolicy,
  isAiConversationAllowed,
  isRecommendationAllowed,
} from '../../../src/modules/releaseSafety/policy';

const previous = globalThis.__SHANI_RELEASE_CHANNEL__;
afterEach(() => {globalThis.__SHANI_RELEASE_CHANNEL__ = previous;});

it.each([undefined, null, '', 'pilot', 'production', 'Development', true, 'invalid'])(
  'fails closed with release declaration %s', value => {
    globalThis.__SHANI_RELEASE_CHANNEL__ = value;
    expect(getReleaseSafetyPolicy().currentRecommendations).toBe(false);
    expect(getReleaseSafetyPolicy().experimentalGlucoseForecasts).toBe(false);
    expect(() => assertGlucoseForecastAllowed()).toThrow('unavailable');
    for (const kind of ['now', 'meal'] as const) {
      expect(() => assertRecommendationAllowed({kind})).toThrow('unavailable');
    }
    expect(isRecommendationAllowed({kind: 'weekly'})).toBe(true);
    expect(isRecommendationAllowed({kind: 'monthly'})).toBe(true);
    expect(isRecommendationAllowed({kind: 'guided', horizon: 'weekly'})).toBe(true);
  },
);

it('only enables experiments in an explicitly declared development build', () => {
  globalThis.__SHANI_RELEASE_CHANNEL__ = 'development';
  expect(getReleaseSafetyPolicy()).toEqual({
    channel: 'development', currentRecommendations: true, experimentalGlucoseForecasts: true,
  });
  expect(() => assertRecommendationAllowed({kind: 'now'})).not.toThrow();
  expect(() => assertGlucoseForecastAllowed()).not.toThrow();
});

it('hides saved current, meal and unclassified legacy transcripts but keeps retrospective ones', () => {
  globalThis.__SHANI_RELEASE_CHANNEL__ = 'pilot';
  const saved = {
    id: 'saved', title: 'Saved answer', specialist: 'general-chat' as const,
    createdAt: 1, updatedAt: 2, messages: [],
  };
  expect(isAiConversationAllowed(saved)).toBe(false);
  expect(isAiConversationAllowed({...saved, recommendation: {kind: 'meal'}})).toBe(false);
  expect(isAiConversationAllowed({...saved, recommendation: {kind: 'now'}})).toBe(false);
  expect(isAiConversationAllowed({...saved, recommendation: {kind: 'monthly'}})).toBe(true);
});
