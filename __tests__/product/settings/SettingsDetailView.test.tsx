import React from 'react';
import {Pressable, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {SettingsDetailView} from 'app/product/settings';

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAllByType(Text)
    .map(node =>
      Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? ''),
    );

describe('SettingsDetailView', () => {
  it('explains a pending upload and lets the user retry without pasting again', async () => {
    const retry = jest.fn(async () => undefined);
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SettingsDetailView
          locale="he"
          section="ai-credentials"
          status={{
            credentialConfigured: false,
            credentialSyncState: 'error',
            credentialSyncPending: true,
            credentialErrorCode: 'backend_unconfigured',
          }}
          onRetryAiCredential={retry}
          onClose={() => undefined}
        />,
      );
    });
    expect(textValues(tree)).toContain(
      'השינוי במפתח ממתין לסנכרון. הפעולה עדיין לא הושלמה.',
    );
    expect(textValues(tree).join(' ')).toContain('נדרש תיקון בפריסה');
    await act(async () => {
      tree.root
        .findAllByProps({testID: 'settings-detail-retry-ai'})
        .find(node => node.type === Pressable)!
        .props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('shows a safe, actionable key error and retains the entered key for correction', async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SettingsDetailView
          locale="en"
          section="ai-credentials"
          status={{credentialConfigured: false}}
          onClose={() => undefined}
          onSaveAiCredential={async () => {
            throw Object.assign(new Error('raw secret in upstream error'), {
              code: 'invalid_credential',
            });
          }}
        />,
      );
    });
    act(() => tree.root.findByType(TextInput).props.onChangeText('sk-test'));
    await act(async () => {
      tree.root
        .findAllByProps({testID: 'settings-detail-save-ai'})
        .find(node => node.type === Pressable)!
        .props.onPress();
    });
    expect(textValues(tree)).toContain(
      'OpenAI rejected this key. Copy the full API key and try again.',
    );
    expect(textValues(tree).join(' ')).not.toContain('raw secret');
    expect(tree.root.findByType(TextInput).props.value).toBe('sk-test');
    act(() => tree.unmount());
  });
  it('saves a newly entered AI key without ever rendering the saved key', async () => {
    const saveCredential = jest.fn(async () => undefined);
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <SettingsDetailView
          locale="en"
          section="ai-credentials"
          status={{credentialConfigured: true}}
          onClose={() => undefined}
          onSaveAiCredential={saveCredential}
        />,
      );
    });

    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'AI credential',
        'An OpenAI key is saved securely. Test the connection to check that AI is available.',
        'Advisory only. The AI cannot change therapy or Nightscout data.',
      ]),
    );

    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('  sk-new  ');
    });
    await act(async () => {
      tree!.root
        .findAllByProps({testID: 'settings-detail-save-ai'})
        .find(node => node.type === Pressable)!
        .props.onPress();
      await Promise.resolve();
    });

    expect(saveCredential).toHaveBeenCalledWith('sk-new');
    expect(textValues(tree!)).not.toContain('sk-new');
    act(() => tree!.unmount());
  });

  it('requires explicit confirmation before clearing an AI credential', async () => {
    const clearCredential = jest.fn(async () => undefined);
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <SettingsDetailView
          locale="he"
          section="ai-credentials"
          status={{credentialConfigured: true}}
          onClearAiCredential={clearCredential}
          onClose={() => undefined}
        />,
      );
    });

    act(() => {
      tree!.root
        .findAllByProps({testID: 'settings-detail-clear-ai'})
        .find(node => node.type === Pressable)!
        .props.onPress();
    });
    expect(clearCredential).not.toHaveBeenCalled();
    expect(textValues(tree!)).toContain('למחוק את המפתח מכספת החשבון המוצפנת?');

    await act(async () => {
      tree!.root
        .findAllByProps({testID: 'settings-detail-confirm-clear-ai'})
        .find(node => node.type === Pressable)!
        .props.onPress();
      await Promise.resolve();
    });
    expect(clearCredential).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('shows safe diagnostics and signs out only after confirmation', async () => {
    const signOut = jest.fn(async () => undefined);
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <SettingsDetailView
          accountLabel="irad@example.com"
          locale="en"
          section="account"
          status={{credentialConfigured: false}}
          onClose={() => undefined}
          onSignOut={signOut}
        />,
      );
    });
    expect(textValues(tree!)).toContain('irad@example.com');

    act(() => {
      tree!.root
        .findAllByProps({testID: 'settings-detail-sign-out'})
        .find(node => node.type === Pressable)!
        .props.onPress();
    });
    expect(signOut).not.toHaveBeenCalled();

    await act(async () => {
      tree!.root
        .findAllByProps({testID: 'settings-detail-confirm-sign-out'})
        .find(node => node.type === Pressable)!
        .props.onPress();
      await Promise.resolve();
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('renders diagnostics without exposing credential values', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SettingsDetailView
          diagnostics={[
            {label: 'Platform', value: 'Android'},
            {label: 'Pending sync', value: '2'},
          ]}
          locale="en"
          section="diagnostics"
          status={{credentialConfigured: true}}
          onClose={() => undefined}
        />,
      );
    });
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining(['Diagnostics', 'Platform', 'Android']),
    );
    expect(JSON.stringify(tree!.toJSON())).not.toMatch(/api[_ -]?key|secret/i);
    act(() => tree!.unmount());
  });
});
