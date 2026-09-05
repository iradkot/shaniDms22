import {guardAssistantOutput} from 'app/services/aiAnalyst/assistantOutputGuard';

describe('AI assistant output guard', () => {
  it('never invents a dose or carb-ratio adjustment', () => {
    const source = 'The carb ratio may be worth reviewing with more evidence.';
    const result = guardAssistantOutput({text: source, language: 'en'});

    expect(result).toBe(source);
    expect(result).not.toMatch(/5-10%|adjustment of about/i);
  });

  it('does not rewrite a request to involve a clinician into an instruction to self-adjust', () => {
    const source = 'Please review this with your clinician.';
    expect(guardAssistantOutput({text: source, language: 'en'})).toBe(source);
  });

  it('does not claim data was loaded when the assistant says it was unavailable', () => {
    const source =
      "I don't have enough AGP data for that conclusion.\n\n[[evidence:agp:14]]";
    expect(guardAssistantOutput({text: source, language: 'en'})).toBe(source);
  });

  it('removes a long raw sample dump while preserving the explanation', () => {
    const rawLines = Array.from(
      {length: 12},
      (_, index) => `mgdl: ${100 + index}`,
    );
    const result = guardAssistantOutput({
      text: ['Summary', ...rawLines].join('\n'),
      language: 'he',
    });

    expect(result).toContain('Summary');
    expect(result).not.toContain('mgdl:');
    expect(result).toContain('הסרתי פלט RAW');
  });
});
