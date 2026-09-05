import {aiSpecialistForImplementationKey} from 'app/product/ai';
import {CORE_IMPLEMENTATION_KEYS} from 'app/product/destinations';

describe('AI Product destination mapping', () => {
  it('maps every curated child implementation to one specialist and keeps the parent as a landing', () => {
    expect(
      [
        CORE_IMPLEMENTATION_KEYS.aiAnalyst,
        CORE_IMPLEMENTATION_KEYS.aiGeneralChat,
        CORE_IMPLEMENTATION_KEYS.aiHypoSpecialist,
        CORE_IMPLEMENTATION_KEYS.aiBehaviorSpecialist,
        CORE_IMPLEMENTATION_KEYS.aiMealSpecialist,
        CORE_IMPLEMENTATION_KEYS.aiLoopSpecialist,
      ].map(aiSpecialistForImplementationKey),
    ).toEqual([
      undefined,
      'general-chat',
      'hypo-investigation',
      'behavior-analysis',
      'meal-analysis',
      'loop-advice',
    ]);
  });
});
