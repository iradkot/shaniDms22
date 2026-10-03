import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {PrivacyView} from '../../../src/product/privacy/PrivacyView';
const mount = async (props: React.ComponentProps<typeof PrivacyView>) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<PrivacyView {...props} />);
  });
  return tree;
};
test('AI needs a separate cloud choice and choices start unchecked', async () => {
  const saveConsent = jest.fn(async () => {});
  const tree = await mount({
    locale: 'he',
    runtime: {consent: null, saveConsent, deleteAccount: jest.fn()},
  });
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-ai-choice'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-save'}).props.onPress(),
  );
  expect(saveConsent).toHaveBeenCalledWith(false, false);
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-cloud-choice'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-ai-choice'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-save'}).props.onPress(),
  );
  expect(saveConsent).toHaveBeenLastCalledWith(true, true);
});
test('deletion needs a second confirmation and failure stays visible', async () => {
  const deleteAccount = jest.fn(async () => {
    throw Object.assign(new Error('recent login needed'), {
      code: 'recent_auth_required',
    });
  });
  const tree = await mount({
    locale: 'en',
    runtime: {consent: null, saveConsent: jest.fn(), deleteAccount},
  });
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-delete'}).props.onPress(),
  );
  expect(deleteAccount).not.toHaveBeenCalled();
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-confirm-delete'}).props.onPress(),
  );
  expect(
    tree.root.findByProps({testID: 'privacy-error'}).props.children,
  ).toContain('Sign in again');
});
test('policy can be read before sign-in without authorizing sharing or deletion', async () => {
  const tree = await mount({
    locale: 'en',
    readOnly: true,
    runtime: {consent: null, saveConsent: jest.fn(), deleteAccount: jest.fn()},
  });
  expect(tree.root.findAllByProps({testID: 'privacy-save'})).toHaveLength(0);
  expect(tree.root.findAllByProps({testID: 'privacy-delete'})).toHaveLength(0);
});
