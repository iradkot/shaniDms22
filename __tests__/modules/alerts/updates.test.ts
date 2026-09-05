import {
  isUpdateDeepLinkDescriptor,
  projectLegacyRuleTriggerHistory,
} from 'app/modules/alerts/domain/updates';

describe('update-center facts', () => {
  it('projects every retained rule trigger as its own occurrence without inventing payload facts', () => {
    const items = projectLegacyRuleTriggerHistory([
      {
        ruleId: 'night-low',
        ruleName: 'Night low',
        triggeredAtMs: [2_000, 1_000, Number.NaN, -1],
      },
    ]);

    expect(items).toEqual([
      {
        id: 'legacy-rule:night-low:2000:0',
        kind: 'alert',
        occurredAtMs: 2_000,
        readState: 'unknown',
        content: {kind: 'alert-rule-trigger', ruleName: 'Night low'},
        deepLink: {
          kind: 'alert-rule',
          ruleId: 'night-low',
        },
      },
      {
        id: 'legacy-rule:night-low:1000:1',
        kind: 'alert',
        occurredAtMs: 1_000,
        readState: 'unknown',
        content: {kind: 'alert-rule-trigger', ruleName: 'Night low'},
        deepLink: {
          kind: 'alert-rule',
          ruleId: 'night-low',
        },
      },
    ]);
    expect(JSON.stringify(items)).not.toMatch(/glucose|mg\/dL|body/i);
  });

  it('accepts only supported, minimally scoped deep-link descriptors', () => {
    expect(
      isUpdateDeepLinkDescriptor({
        kind: 'day',
        dayStartMs: 1_725_667_200_000,
      }),
    ).toBe(true);
    expect(
      isUpdateDeepLinkDescriptor({
        kind: 'journal-entry',
        entryKind: 'meal',
        entryId: 'meal-1',
      }),
    ).toBe(true);
    expect(
      isUpdateDeepLinkDescriptor({
        kind: 'destination',
        url: 'https://example.com',
      }),
    ).toBe(false);
    expect(
      isUpdateDeepLinkDescriptor({
        kind: 'alert-occurrence',
        occurrenceId: '',
      }),
    ).toBe(false);
  });
});
