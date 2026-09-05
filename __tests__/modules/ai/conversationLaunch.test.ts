import {
  AI_SPECIALIST_DEFINITIONS,
  createAiConversationLaunch,
  decodeAiConversationHistory,
} from 'app/modules/ai';

describe('AI conversation launch domain', () => {
  it('keeps the curated specialist registry stable and groups specialists below general chat', () => {
    expect(
      AI_SPECIALIST_DEFINITIONS.map(({id, category}) => ({id, category})),
    ).toEqual([
      {id: 'general-chat', category: 'primary'},
      {id: 'hypo-investigation', category: 'investigation'},
      {id: 'behavior-analysis', category: 'investigation'},
      {id: 'meal-analysis', category: 'investigation'},
      {id: 'loop-advice', category: 'improvement'},
    ]);
  });

  it('turns a focused period into visible bilingual context without raw medical samples', () => {
    const focus = {
      kind: 'period',
      startMs: Date.UTC(2026, 7, 1, 0, 0),
      endMs: Date.UTC(2026, 7, 8, 0, 0),
    } as const;

    const english = createAiConversationLaunch({
      specialist: 'hypo-investigation',
      focus,
      locale: 'en',
    });
    const hebrew = createAiConversationLaunch({
      specialist: 'hypo-investigation',
      focus,
      locale: 'he',
    });

    expect(english.specialist).toBe('hypo-investigation');
    expect(english.visibleContext).toContain('Low-glucose investigation');
    expect(english.visibleContext).toContain('1 Aug 2026');
    expect(hebrew.visibleContext).toContain('חקירת סוכר נמוך');
    expect(hebrew.visibleContext).toMatch(/1.*אוג/);
    expect(JSON.stringify(english)).not.toMatch(/mg\/dL|glucoseSamples|apiKey/);
  });

  it('does not create context from an invalid period', () => {
    expect(
      createAiConversationLaunch({
        specialist: 'general-chat',
        focus: {kind: 'period', startMs: 50, endMs: 10},
        locale: 'en',
      }).visibleContext,
    ).toBeUndefined();
  });

  it('strictly decodes history and drops malformed messages', () => {
    expect(
      decodeAiConversationHistory([
        {
          id: 'conversation-1',
          title: 'Breakfast question',
          mission: 'openChat',
          createdAt: 10,
          updatedAt: 20,
          messages: [
            {role: 'user', content: 'What happened?'},
            {role: 'tool', content: 'secret raw payload'},
            {role: 'assistant', content: 'An observed pattern.'},
          ],
        },
        {id: '', title: 'invalid', updatedAt: 30, messages: []},
      ]),
    ).toEqual([
      {
        id: 'conversation-1',
        title: 'Breakfast question',
        specialist: 'general-chat',
        createdAt: 10,
        updatedAt: 20,
        messages: [
          {role: 'user', content: 'What happened?'},
          {role: 'assistant', content: 'An observed pattern.'},
        ],
      },
    ]);
  });
});
