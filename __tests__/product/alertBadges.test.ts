import {selectAlertOperationalBadges} from 'app/product/app';
import {CORE_DESTINATION_IDS} from 'app/product/destinations';

describe('alert operational badges', () => {
  it('counts unread updates only and localizes the compact label', () => {
    const snapshot = {
      status: 'ready' as const,
      items: [
        {
          id: 'unread',
          kind: 'alert' as const,
          occurredAtMs: 1,
          readState: 'unread' as const,
          content: {kind: 'message' as const, title: 'One'},
        },
        {
          id: 'unknown',
          kind: 'alert' as const,
          occurredAtMs: 2,
          readState: 'unknown' as const,
          content: {kind: 'message' as const, title: 'Two'},
        },
        {
          id: 'read',
          kind: 'reminder' as const,
          occurredAtMs: 3,
          readState: 'read' as const,
          content: {kind: 'message' as const, title: 'Three'},
        },
      ],
    };

    expect(
      selectAlertOperationalBadges(snapshot, 'he').get(
        CORE_DESTINATION_IDS.updateCenter,
      ),
    ).toEqual({label: '1 עדכון חדש', tone: 'attention'});
  });

  it('does not show a badge before data is ready or when all items are read', () => {
    expect(selectAlertOperationalBadges({status: 'loading'}, 'en').size).toBe(
      0,
    );
    expect(
      selectAlertOperationalBadges({status: 'ready', items: []}, 'en').size,
    ).toBe(0);
  });
});
