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

const buttonLabel = (tree: renderer.ReactTestRenderer, id: string): string =>
  tree.root.findByProps({testID: id}).props.children.props.children.join('');

test('Hebrew save explains that successful saving returns to the app', async () => {
  const saveConsent = jest.fn(async () => {});
  const tree = await mount({
    locale: 'he',
    runtime: {consent: null, saveConsent, deleteAccount: jest.fn()},
  });

  expect(buttonLabel(tree, 'privacy-save')).toBe('שמירה והמשך לאפליקציה');
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-save'}).props.onPress(),
  );
  expect(saveConsent).toHaveBeenCalledWith(false, false);
});

test('a failed consent save reports saving only and does not suggest cleanup sign-in', async () => {
  const saveConsent = jest.fn(async () => {
    throw new Error('Backend unavailable');
  });
  const reauthenticate = jest.fn(async () => {});
  const runtime = {
    consent: null,
    saveConsent,
    deleteAccount: jest.fn(),
    reauthenticate,
    continueLocally: jest.fn(async () => {}),
  };
  const tree = await mount({locale: 'he', runtime});

  await act(async () =>
    tree.root.findByProps({testID: 'privacy-cloud-choice'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-ai-choice'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-save'}).props.onPress(),
  );

  expect(saveConsent).toHaveBeenCalledWith(true, true);
  const message = tree.root.findByProps({testID: 'privacy-error'}).props.children;
  expect(message).toContain('שמירת');
  expect(message).not.toContain('מחיקה');
  expect(tree.root.findAllByProps({testID: 'privacy-reauthenticate'})).toHaveLength(
    0,
  );
  expect(buttonLabel(tree, 'privacy-continue-locally')).toBe(
    'המשך ללא סנכרון ענן',
  );
});

test('local continuation after a cloud save failure uses the explicit local action', async () => {
  const saveConsent = jest.fn(async () => {
    throw new Error('Backend unavailable');
  });
  const continueLocally = jest.fn(async () => {});
  const runtime = {
    consent: null,
    saveConsent,
    deleteAccount: jest.fn(),
    continueLocally,
  };
  const tree = await mount({locale: 'he', runtime});

  await act(async () =>
    tree.root.findByProps({testID: 'privacy-cloud-choice'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-ai-choice'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-save'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-continue-locally'}).props.onPress(),
  );

  expect(continueLocally).toHaveBeenCalledTimes(1);
  expect(saveConsent).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByProps({testID: 'privacy-error'})).toHaveLength(0);
  expect(
    tree.root.findByProps({testID: 'privacy-cloud-choice'}).props
      .accessibilityState.checked,
  ).toBe(false);
  expect(
    tree.root.findByProps({testID: 'privacy-ai-choice'}).props.accessibilityState
      .checked,
  ).toBe(false);
});

test('saved consent has an explicit return-to-app action without saving again', async () => {
  const onClose = jest.fn();
  const saveConsent = jest.fn(async () => {});
  const tree = await mount({
    locale: 'he',
    runtime: {
      consent: {
        policyVersion: '2026-10-03.1',
        cloudSync: false,
        aiProcessing: false,
        updatedAtMs: 1,
      },
      saveConsent,
      deleteAccount: jest.fn(),
      onClose,
    },
  });

  expect(buttonLabel(tree, 'privacy-close')).toBe('חזרה לאפליקציה');
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-close'}).props.onPress(),
  );
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(saveConsent).not.toHaveBeenCalled();
});

test('recent sign-in errors during saving describe saving rather than deletion', async () => {
  const saveConsent = jest.fn(async () => {
    throw Object.assign(new Error('Sign in again'), {
      code: 'recent_auth_required',
    });
  });
  const reauthenticate = jest.fn(async () => {});
  const tree = await mount({
    locale: 'he',
    runtime: {
      consent: null,
      saveConsent,
      deleteAccount: jest.fn(),
      reauthenticate,
    },
  });

  await act(async () =>
    tree.root.findByProps({testID: 'privacy-save'}).props.onPress(),
  );
  const message = tree.root.findByProps({testID: 'privacy-error'}).props.children;
  expect(message).toContain('לשמור');
  expect(message).not.toContain('למחוק');
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-reauthenticate'}).props.onPress(),
  );
  expect(reauthenticate).toHaveBeenCalledTimes(1);
});

test('local continuation is absent when the runtime cannot allow it', async () => {
  const tree = await mount({
    locale: 'en',
    runtime: {consent: null, saveConsent: jest.fn(), deleteAccount: jest.fn()},
  });
  expect(
    tree.root.findAllByProps({testID: 'privacy-continue-locally'}),
  ).toHaveLength(0);
});

test('a read-only policy never offers local continuation', async () => {
  const runtime = {
    consent: null,
    saveConsent: jest.fn(),
    deleteAccount: jest.fn(),
    continueLocally: jest.fn(async () => {}),
  };
  const tree = await mount({locale: 'en', runtime, readOnly: true});
  expect(
    tree.root.findAllByProps({testID: 'privacy-continue-locally'}),
  ).toHaveLength(0);
});

test('local continuation disables competing actions and ignores duplicate presses until settled', async () => {
  let complete!: () => void;
  const continueLocally = jest.fn(
    () => new Promise<void>(resolve => (complete = resolve)),
  );
  const saveConsent = jest.fn(async () => {});
  const runtime = {
    consent: null,
    saveConsent,
    deleteAccount: jest.fn(),
    continueLocally,
  };
  const tree = await mount({locale: 'en', runtime});
  let pending!: Promise<void>;
  await act(async () => {
    pending = tree.root
      .findByProps({testID: 'privacy-continue-locally'})
      .props.onPress();
    // A second tap can arrive before React commits the disabled state.
    tree.root.findByProps({testID: 'privacy-continue-locally'}).props.onPress();
    tree.root.findByProps({testID: 'privacy-save'}).props.onPress();
  });

  expect(continueLocally).toHaveBeenCalledTimes(1);
  expect(saveConsent).not.toHaveBeenCalled();
  expect(tree.root.findByProps({testID: 'privacy-save'}).props.disabled).toBe(
    true,
  );
  expect(
    tree.root.findByProps({testID: 'privacy-continue-locally'}).props.disabled,
  ).toBe(true);
  expect(tree.root.findByProps({testID: 'privacy-delete'}).props.disabled).toBe(
    true,
  );
  await act(async () => {
    complete();
    await pending;
  });
  expect(tree.root.findByProps({testID: 'privacy-save'}).props.disabled).toBe(
    false,
  );
});

test('a generic deletion failure does not incorrectly offer Google reauthentication', async () => {
  const deleteAccount = jest.fn(async () => {
    throw new Error('Deletion unavailable');
  });
  const tree = await mount({
    locale: 'en',
    runtime: {
      consent: null,
      saveConsent: jest.fn(),
      deleteAccount,
      reauthenticate: jest.fn(async () => {}),
    },
  });
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-delete'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-confirm-delete'}).props.onPress(),
  );
  expect(
    tree.root.findByProps({testID: 'privacy-error'}).props.children,
  ).toContain('Deletion did not complete');
  expect(tree.root.findAllByProps({testID: 'privacy-reauthenticate'})).toHaveLength(
    0,
  );
});

test('a deletion cleanup account mismatch still offers its explicit sign-out action', async () => {
  const deleteAccount = jest.fn(async () => {
    throw Object.assign(new Error('Account changed'), {
      code: 'local_cleanup_account_changed',
    });
  });
  const reauthenticate = jest.fn(async () => {});
  const tree = await mount({
    locale: 'en',
    runtime: {
      consent: null,
      saveConsent: jest.fn(),
      deleteAccount,
      reauthenticate,
    },
  });
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-delete'}).props.onPress(),
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-confirm-delete'}).props.onPress(),
  );
  expect(buttonLabel(tree, 'privacy-reauthenticate')).toBe(
    'Sign out to finish device cleanup',
  );
  await act(async () =>
    tree.root.findByProps({testID: 'privacy-reauthenticate'}).props.onPress(),
  );
  expect(reauthenticate).toHaveBeenCalledTimes(1);
});

test.each(['privacy-save', 'privacy-revoke', 'privacy-continue-locally'])(
  '%s blocks a same-tick return press until the action settles',
  async actionId => {
    let complete!: () => void;
    const deferred = new Promise<void>(resolve => (complete = resolve));
    const onClose = jest.fn();
    const tree = await mount({
      locale: 'en',
      runtime: {
        consent: {
          policyVersion: '2026-10-03.1',
          cloudSync: true,
          aiProcessing: true,
          updatedAtMs: 1,
        },
        saveConsent: jest.fn(() => deferred),
        continueLocally: jest.fn(() => deferred),
        deleteAccount: jest.fn(),
        onClose,
      },
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = tree.root.findByProps({testID: actionId}).props.onPress();
      // React has not committed the disabled state yet. The old return
      // callback must not restore the consent being replaced or withdrawn.
      tree.root.findByProps({testID: 'privacy-close'}).props.onPress();
    });

    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      complete();
      await pending;
    });
    await act(async () =>
      tree.root.findByProps({testID: 'privacy-close'}).props.onPress(),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  },
);
