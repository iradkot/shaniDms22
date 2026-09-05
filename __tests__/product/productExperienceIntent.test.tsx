import React from 'react';
import {withTheme} from '../mocks/withTheme';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {
  ProductExperience,
  ProductImplementationRegistry,
} from 'app/product/app';
import {
  CORE_DESTINATION_IDS,
  CORE_IMPLEMENTATION_KEYS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from 'app/product/destinations';
import {createDestinationRequest} from 'app/product/shell';

describe('Product Experience navigation intents', () => {
  it('consumes one validated notification intent and opens its destination', () => {
    const destination = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.updateCenter),
      undefined,
      {platform: 'android'},
    );
    if (destination.status !== 'available') {
      throw new Error('Update Center should be available.');
    }
    const implementations = new ProductImplementationRegistry([
      {
        implementationKey: CORE_IMPLEMENTATION_KEYS.updateCenter,
        render: host => (
          <Text testID="opened-occurrence">
            {host.request.focus?.kind === 'alert-occurrence'
              ? host.request.focus.occurrenceId
              : 'missing'}
          </Text>
        ),
      },
    ]);
    const onConsumed = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        withTheme(
          <ProductExperience
            implementationRegistry={implementations}
            locale="en"
            navigationIntent={{
              id: 'intent-1',
              request: createDestinationRequest(destination, {
                focus: {
                  kind: 'alert-occurrence',
                  occurrenceId: 'occurrence-1',
                },
              }),
            }}
            onNavigationIntentConsumed={onConsumed}
            personalizationLayout="phone"
            runtime={{platform: 'android'}}
          />,
        ),
      );
    });

    expect(
      tree!.root.findByProps({testID: 'opened-occurrence'}).props.children,
    ).toBe('occurrence-1');
    expect(onConsumed).toHaveBeenCalledWith('intent-1');
    act(() => tree!.unmount());
  });
});
