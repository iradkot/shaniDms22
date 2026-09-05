import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
} from 'app/product/destinations';
import {
  createNativeProductNavigationIntent,
  decodeNativeProductNavigationIntent,
} from 'app/platform/native/product';

describe('native Product navigation intent', () => {
  it('opens a supported destination with validated transient focus', () => {
    const payload = createNativeProductNavigationIntent(
      CORE_DESTINATION_IDS.updateCenter,
      {focus: {kind: 'alert-occurrence', occurrenceId: 'occurrence-1'}},
      () => 'intent-1',
    );

    expect(
      decodeNativeProductNavigationIntent(payload, coreDestinationRegistry, {
        platform: 'android',
      }),
    ).toEqual({
      id: 'intent-1',
      request: expect.objectContaining({
        destination: expect.objectContaining({
          destination: expect.objectContaining({
            id: CORE_DESTINATION_IDS.updateCenter,
          }),
        }),
        focus: {kind: 'alert-occurrence', occurrenceId: 'occurrence-1'},
      }),
    });
  });

  it('rejects extra payload fields, malformed focus, and disabled destinations', () => {
    expect(
      decodeNativeProductNavigationIntent(
        {
          id: 'intent-1',
          destinationId: CORE_DESTINATION_IDS.updateCenter,
          url: 'https://should-not-be-accepted.example',
        },
        coreDestinationRegistry,
        {platform: 'android'},
      ),
    ).toBeUndefined();
    expect(
      decodeNativeProductNavigationIntent(
        {
          id: 'intent-2',
          destinationId: CORE_DESTINATION_IDS.updateCenter,
          options: {
            focus: {
              kind: 'alert-occurrence',
              occurrenceId: '',
              apiKey: 'must-not-pass',
            },
          },
        },
        coreDestinationRegistry,
        {platform: 'android'},
      ),
    ).toBeUndefined();
    expect(
      decodeNativeProductNavigationIntent(
        {
          id: 'intent-3',
          destinationId: CORE_DESTINATION_IDS.hypoInvestigation,
        },
        coreDestinationRegistry,
        {
          platform: 'web',
          disabledDestinations: new Map([
            [CORE_DESTINATION_IDS.hypoInvestigation, 'Not configured'],
          ]),
        },
      ),
    ).toBeUndefined();
  });
});
