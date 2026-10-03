import {
  ALERT_RULE_INTERPRETATION_ERROR_MESSAGE,
  AlertRuleInterpretationError,
  interpretAlertRuleDraft,
} from 'app/modules/alerts/domain/alertRuleInterpreter';

describe('alert-rule AI interpretation', () => {
  it('maps a Hebrew below-65 night request to a safe legacy-schema draft', async () => {
    const chat = jest.fn(async (_prompt: string) =>
      JSON.stringify({
        name: 'סוכר נמוך בלילה',
        condition: 'below',
        thresholdMgDl: 65,
        lowerBoundMgDl: null,
        upperBoundMgDl: null,
        activeFrom: null,
        activeTo: null,
        timePreset: 'night',
        trend: null,
      }),
    );

    await expect(
      interpretAlertRuleDraft(
        'תתריע לי אם הסוכר יורד מתחת ל-65 במשך הלילה',
        chat,
      ),
    ).resolves.toEqual({
      name: 'סוכר נמוך בלילה',
      enabled: true,
      lowerBoundMgDl: 65,
      upperBoundMgDl: 1000,
      activeFromMinute: 22 * 60,
      activeToMinute: 7 * 60,
      trend: 'any',
    });

    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0]?.[0]).toContain(
      'תתריע לי אם הסוכר יורד מתחת ל-65 במשך הלילה',
    );
  });

  it('rejects malformed model output with one stable domain error', async () => {
    const chat = async () => '```json\n{"condition":"below"}\n```';

    try {
      await interpretAlertRuleDraft('Alert me below 65', chat);
      throw new Error('Expected interpretation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(AlertRuleInterpretationError);
      expect(error).toMatchObject({
        code: 'invalid-alert-rule-interpretation',
        message: ALERT_RULE_INTERPRETATION_ERROR_MESSAGE,
      });
    }
  });

  it('rejects one-sided thresholds that collide with storage sentinels', async () => {
    const chat = async () =>
      JSON.stringify({
        name: 'Impossible low',
        condition: 'below',
        thresholdMgDl: 1,
        lowerBoundMgDl: null,
        upperBoundMgDl: null,
        activeFrom: null,
        activeTo: null,
        timePreset: 'all-day',
        trend: 'any',
      });

    await expect(
      interpretAlertRuleDraft('Alert below 1', chat),
    ).rejects.toBeInstanceOf(AlertRuleInterpretationError);
  });
});
