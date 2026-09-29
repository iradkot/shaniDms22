import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import {AppVersionRow} from 'app/product/settings/AppVersionRow';

const text = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text)
  .map(node => node.props.children).join('\n');

it.each([
  {locale: 'he' as const, title: 'גרסת האפליקציה', build: 'מספר בנייה'},
  {locale: 'en' as const, title: 'App version', build: 'Build'},
])('shows the installed native version and build in $locale', ({locale, title, build}) => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AppVersionRow locale={locale} appInfo={{
      versionName: '1.0.529-preview', buildNumber: '53568000',
    }} />);
  });
  expect(text(tree!)).toContain(title);
  expect(text(tree!)).toContain('1.0.529-preview');
  expect(text(tree!)).toContain(`${build}: 53568000`);
  expect(tree!.root.findAllByProps({testID: 'settings-app-built-at'})).toHaveLength(0);
  act(() => tree!.unmount());
});

it('shows a browser bundle revision and its real build date without inventing a native version', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AppVersionRow locale="en" appInfo={{
      revision: 'defcdc6789012-dirty', builtAt: '2026-09-29T12:00:00Z',
    }} />);
  });
  expect(text(tree!)).toContain('defcdc6789012-dirty');
  expect(text(tree!)).toContain('Built on:');
  expect(text(tree!)).toContain('2026');
  expect(tree!.root.findAllByProps({testID: 'settings-app-build'})).toHaveLength(0);
  act(() => tree!.update(<AppVersionRow locale="en" />));
  expect(text(tree!)).toContain('Not available');
  expect(text(tree!)).not.toContain('2026');
  act(() => tree!.unmount());
});
