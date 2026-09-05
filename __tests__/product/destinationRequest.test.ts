import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from 'app/product/destinations';
import {
  DestinationRequestValidationError,
  createDestinationRequest,
} from 'app/product/shell';

const meals = () => {
  const resolved = resolveDestinationTarget(
    coreDestinationRegistry,
    createStoredDestinationTarget(CORE_DESTINATION_IDS.meals),
    undefined,
    {platform: 'ios'},
  );
  if (resolved.status !== 'available') {
    throw new Error('Meals must be available.');
  }
  return resolved;
};

describe('DestinationRequest transient boundary', () => {
  it('retains an event time in transient day navigation and rejects invalid times', () => {
    const dayStartMs = new Date(2026, 7, 20).getTime();
    const focus = {kind: 'day', dayStartMs, atMs: dayStartMs + 3600000};
    expect(createDestinationRequest(meals(), {focus}).focus).toEqual(focus);
    for (const atMs of [
      dayStartMs - 1,
      dayStartMs + 27 * 3600000,
      NaN,
      'noon',
    ]) {
      expect(() =>
        createDestinationRequest(meals(), {focus: {...focus, atMs}}),
      ).toThrow(DestinationRequestValidationError);
    }
  });
  it('accepts a typed entity focus without adding it to the stored target', () => {
    const request = createDestinationRequest(meals(), {
      workspaceId: 'workspace-a',
      focus: {
        kind: 'journal-entry',
        entryKind: 'meal',
        entryId: 'meal-1',
      },
    });

    expect(request).toEqual({
      destination: expect.objectContaining({status: 'available'}),
      workspaceId: 'workspace-a',
      focus: {
        kind: 'journal-entry',
        entryKind: 'meal',
        entryId: 'meal-1',
      },
    });
    expect(request.destination.target).toEqual({
      schemaVersion: 1,
      destinationId: CORE_DESTINATION_IDS.meals,
    });
  });

  it('rejects invalid ranges and untyped medical payloads at runtime', () => {
    expect(() =>
      createDestinationRequest(meals(), {
        focus: {kind: 'period', startMs: 200, endMs: 100},
      }),
    ).toThrow(DestinationRequestValidationError);
    expect(() =>
      createDestinationRequest(meals(), {
        workspaceId: 'workspace-a',
        glucose: 61,
      }),
    ).toThrow(DestinationRequestValidationError);
  });
});
