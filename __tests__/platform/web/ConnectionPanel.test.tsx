import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {ConnectionPanel} from '../../../web/ConnectionPanel';
import {AuthenticatedWebApiClient} from '../../../src/platform/web';

describe('browser AI connection panel', () => {
  const renderPanel = (requestJson: jest.Mock) => {
    const onChanged = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ConnectionPanel
          locale="en"
          api={{requestJson} as unknown as AuthenticatedWebApiClient}
          nightscout={{configured: false}}
          aiConfigured={true}
          onChanged={onChanged}
          onClose={jest.fn()}
        />,
      );
    });
    const button = (label: string) =>
      tree.root
        .findAllByType('button')
        .find(node => node.props.children === label)!;
    return {tree, onChanged, button};
  };

  it('retains a replacement draft after a malformed save acknowledgement', async () => {
    const {tree, onChanged, button} = renderPanel(
      jest.fn().mockResolvedValue({version: 1}),
    );
    act(() =>
      tree.root
        .findAllByType('input')[2]!
        .props.onChange({target: {value: 'sk-replacement-test'}}),
    );
    await act(async () => button('Save key').props.onClick());
    expect(tree.root.findAllByType('input')[2]!.props.value).toBe(
      'sk-replacement-test',
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(tree.root.findByProps({role: 'alert'}).props.children).not.toContain(
      'sk-replacement-test',
    );
    act(() => tree.unmount());
  });

  it('keeps the AI draft when a Nightscout connection is saved', async () => {
    const requestJson = jest.fn().mockResolvedValue({
      version: 1,
      configured: true,
      sourceId: 'source-test',
      workspaceId: 'workspace-test',
    });
    const {tree, button} = renderPanel(requestJson);
    act(() => {
      const inputs = tree.root.findAllByType('input');
      inputs[0]!.props.onChange({
        target: {value: 'https://nightscout.example.test'},
      });
      inputs[1]!.props.onChange({target: {value: 'nightscout-test-secret'}});
      inputs[2]!.props.onChange({target: {value: 'sk-draft-test'}});
    });
    await act(async () => button('Connect and verify').props.onClick());
    expect(tree.root.findAllByType('input')[2]!.props.value).toBe(
      'sk-draft-test',
    );
    expect(tree.root.findAllByType('input')[1]!.props.value).toBe('');
    act(() => tree.unmount());
  });

  it('distinguishes a saved key from a successfully tested connection', async () => {
    const requestJson = jest
      .fn()
      .mockResolvedValueOnce({version: 1, configured: true})
      .mockResolvedValueOnce({
        version: 1,
        provider: 'openai',
        model: 'gpt-5.5',
        connected: true,
      });
    const {tree, onChanged, button} = renderPanel(requestJson);
    act(() =>
      tree.root
        .findAllByType('input')[2]!
        .props.onChange({target: {value: 'sk-replacement-test'}}),
    );
    await act(async () => button('Save key').props.onClick());
    expect(tree.root.findByProps({role: 'status'}).props.children).toBe(
      'Key saved securely. Test the connection to confirm OpenAI access.',
    );
    expect(requestJson).toHaveBeenCalledTimes(1);
    await act(async () => button('Test saved key').props.onClick());
    expect(tree.root.findByProps({role: 'status'}).props.children).toBe(
      'OpenAI connection verified. AI is ready to use.',
    );
    expect(requestJson.mock.calls[1]![1].body).not.toHaveProperty('credential');
    expect(onChanged).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
