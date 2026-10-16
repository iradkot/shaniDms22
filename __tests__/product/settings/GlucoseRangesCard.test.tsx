import React from 'react';
import {Pressable, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {DEFAULT_GLUCOSE_RANGE_THRESHOLDS} from 'app/modules/settings';
import {GlucoseRangesCard} from 'app/product/settings/GlucoseRangesCard';
import {withTheme} from '../../mocks/withTheme';

const field = (tree: renderer.ReactTestRenderer, name: string) =>
  tree.root
    .findAllByProps({testID: `settings-glucose-${name}`})
    .find(node => node.type === TextInput)!;
const button = (tree: renderer.ReactTestRenderer, name: string) =>
  tree.root
    .findAllByProps({testID: `settings-glucose-${name}`})
    .find(node => node.type === Pressable)!;
const text = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(node => React.Children.toArray(node.props.children).join(''))
    .join('\n');

describe('GlucoseRangesCard', () => {
  it('keeps invalid drafts, previews exact inclusive boundaries, and saves all four values together', async () => {
    const onSave = jest.fn(async () => true);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <GlucoseRangesCard
            thresholds={DEFAULT_GLUCOSE_RANGE_THRESHOLDS}
            locale="en"
            saving={false}
            onSave={onSave}
          />,
        ),
      );
    });
    expect(text(tree!)).toContain('≥ 70, ≤ 180 mg/dL');
    act(() => field(tree!, 'targetMinMgDl').props.onChangeText(''));
    expect(field(tree!, 'targetMinMgDl').props.value).toBe('');
    expect(button(tree!, 'save').props.disabled).toBe(true);
    expect(
      tree!.root.findAllByProps({testID: 'settings-glucose-validation'}).length,
    ).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      field(tree!, 'veryLowMaxMgDl').props.onChangeText('60');
      field(tree!, 'targetMinMgDl').props.onChangeText('80');
      field(tree!, 'targetMaxMgDl').props.onChangeText('160');
      field(tree!, 'highMaxMgDl').props.onChangeText('220');
    });
    expect(text(tree!)).toContain('≥ 80, ≤ 160 mg/dL');
    expect(text(tree!)).toContain('> 160, ≤ 220 mg/dL');
    expect(button(tree!, 'save').props.disabled).toBe(false);
    await act(async () => button(tree!, 'save').props.onPress());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      veryLowMaxMgDl: 60,
      targetMinMgDl: 80,
      targetMaxMgDl: 160,
      highMaxMgDl: 220,
    });
    act(() => tree!.unmount());
  });

  it('shows Hebrew accessible labels, retains failed drafts, and restores defaults through the same save', async () => {
    const onSave = jest.fn(async () => false);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <GlucoseRangesCard
            thresholds={DEFAULT_GLUCOSE_RANGE_THRESHOLDS}
            locale="he"
            saving={false}
            onSave={onSave}
          />,
        ),
      );
    });
    expect(field(tree!, 'targetMinMgDl').props.accessibilityLabel).toBe(
      'בטווח (TIR): החל מ־ (mg/dL)',
    );
    act(() => field(tree!, 'targetMinMgDl').props.onChangeText('85'));
    await act(async () => button(tree!, 'save').props.onPress());
    expect(field(tree!, 'targetMinMgDl').props.value).toBe('85');
    expect(text(tree!)).toContain('לא הצלחנו לשמור את הטווחים.');

    onSave.mockResolvedValue(true);
    await act(async () => button(tree!, 'reset').props.onPress());
    expect(onSave).toHaveBeenLastCalledWith(DEFAULT_GLUCOSE_RANGE_THRESHOLDS);
    expect(field(tree!, 'targetMinMgDl').props.value).toBe('70');
    act(() => tree!.unmount());
  });

  it('rejects pasted decimal, reversed, and out-of-sensor-range inputs without substituting defaults', async () => {
    const onSave = jest.fn(async () => true);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <GlucoseRangesCard
            thresholds={DEFAULT_GLUCOSE_RANGE_THRESHOLDS}
            locale="en"
            saving={false}
            onSave={onSave}
          />,
        ),
      );
    });
    for (const invalid of ['70.5', '20', '601', 'abc']) {
      act(() => field(tree!, 'targetMinMgDl').props.onChangeText(invalid));
      expect(field(tree!, 'targetMinMgDl').props.value).toBe(invalid);
      expect(button(tree!, 'save').props.disabled).toBe(true);
    }
    expect(onSave).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });
});
