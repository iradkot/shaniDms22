import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {withTheme} from '../mocks/withTheme';
import {
  DEFAULT_HOME_PREFERENCES,
  PersonalizationQuestionnaireView,
  createDefaultProductPersonalization,
  selectLayoutProfile,
  skipPersonalizationQuestionnaire,
  updateHomePreferences,
  type StoredProductPersonalization,
} from 'app/product/personalization';

const design = {
  ...DEFAULT_HOME_PREFERENCES,
  hiddenWidgets: ['chat'] as const,
  glucoseWindowHours: 12 as const,
};

it('preserves a designed Home when changing and saving general presentation settings', async () => {
  const value = skipPersonalizationQuestionnaire(
    updateHomePreferences(createDefaultProductPersonalization(), 'phone', design),
  );
  const results: StoredProductPersonalization[] = [];
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      withTheme(
        <PersonalizationQuestionnaireView
          initialStage="presentation"
          layout="phone"
          locale="he"
          mode="customize"
          value={value}
          onSave={async next => {
            results.push(next);
          }}
        />,
      ),
    );
  });
  act(() => {
    tree.root.findByProps({testID: 'personalization-current-snapshot'}).props.onPress();
  });
  await act(async () => {
    await tree.root.findByProps({testID: 'personalization-primary-action'}).props.onPress();
  });
  expect(results).toHaveLength(1);
  expect(selectLayoutProfile(results[0]!, 'phone').home).toEqual(design);
  act(() => tree.unmount());
});

it('preserves Home through onboarding relationship presets and completion', async () => {
  const value = updateHomePreferences(
    createDefaultProductPersonalization(),
    'tablet',
    design,
  );
  const results: StoredProductPersonalization[] = [];
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      withTheme(
        <PersonalizationQuestionnaireView
          layout="tablet"
          locale="en"
          mode="onboarding"
          value={value}
          onSave={async next => {
            results.push(next);
          }}
        />,
      ),
    );
  });
  act(() => {
    tree.root.findByProps({testID: 'personalization-relationship-parent'}).props.onPress();
  });
  for (let step = 0; step < 3; step += 1) {
    await act(async () => {
      await tree.root.findByProps({testID: 'personalization-primary-action'}).props.onPress();
    });
  }
  expect(results).toHaveLength(1);
  expect(selectLayoutProfile(results[0]!, 'tablet').home).toEqual(design);
  expect(results[0]!.workspace.relationship).toBe('parent');
  act(() => tree.unmount());
});
