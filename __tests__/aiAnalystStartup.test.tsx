import React from 'react';
import renderer, {act} from 'react-test-renderer';
import type {AiAnalystEngine} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/types';
import {useAiAnalystEngine} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/hooks/useAiAnalystEngine';
import {
  createMarkdownItInstance,
  createSelectableMarkdownRules,
  createMarkdownStyle,
} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/helpers/markdownConfig';

let mockApiKey = '';
let mockCredentialState = 'idle';
jest.mock('app/contexts/AiSettingsContext', () => ({
  useAiSettings: () => ({
    settings: {enabled: true, apiKey: mockApiKey, openAiModel: 'fixture'},
    credentialSyncStatus: {state: mockCredentialState, pending: false},
  }),
}));
jest.mock('app/contexts/GlucoseSettingsContext', () => ({
  useGlucoseSettings: () => ({settings: {severeHypo: 54, hypo: 70, hyper: 180}}),
}));
jest.mock('app/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'en'}),
}));
jest.mock('app/services/aiMemory/useActiveAiWorkspaceScope', () => ({
  useActiveAiWorkspaceScope: () => ({productUserId: 'test-user', workspaceId: 'test-workspace'}),
}));
jest.mock('app/services/llm/llmClient', () => ({
  createLlmProvider: () => ({sendChat: jest.fn()}),
  withAppLanguagePolicy: (instruction: string) => instruction,
}));
jest.mock(
  'app/containers/MainTabsNavigator/Containers/AiAnalyst/helpers/markdownConfig',
  () => ({
    createMarkdownItInstance: jest.fn(() => ({})),
    createSelectableMarkdownRules: jest.fn(() => ({})),
    createMarkdownStyle: jest.fn(() => ({})),
  }),
);

let engine: AiAnalystEngine;
function Harness() {
  engine = useAiAnalystEngine();
  return null;
}

describe('AI engine startup work', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    mockApiKey = '';
    mockCredentialState = 'idle';
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('does not construct legacy chat rendering resources when the shared engine mounts', () => {
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(createMarkdownItInstance).not.toHaveBeenCalled();
    expect(createSelectableMarkdownRules).not.toHaveBeenCalled();
    expect(createMarkdownStyle).not.toHaveBeenCalled();
  });

  it('updates key availability without render-time timers and preserves an active mission', () => {
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(engine.state.mode).toBe('locked');
    mockApiKey = '__shani_server_vault__';
    mockCredentialState = 'configured';
    act(() => tree.update(<Harness />));
    expect(jest.getTimerCount()).toBe(0);
    expect(engine.state.mode).toBe('dashboard');
    act(() => engine.setState({mode: 'mission', mission: 'openChat'}));
    act(() => tree.update(<Harness />));
    expect(engine.state.mode).toBe('mission');
    mockApiKey = '';
    mockCredentialState = 'idle';
    act(() => tree.update(<Harness />));
    expect(jest.getTimerCount()).toBe(0);
    expect(engine.state.mode).toBe('locked');
  });

  it('does not unlock AI for a pending or failed credential upload', () => {
    mockApiKey = '__shani_server_vault_pending__';
    mockCredentialState = 'pending';
    act(() => { tree = renderer.create(<Harness />); });
    expect(engine.hasKey).toBe(false);
    expect(engine.state.mode).toBe('locked');
    mockCredentialState = 'error';
    act(() => tree.update(<Harness />));
    expect(engine.hasKey).toBe(false);
  });

  it('keeps the confirmed key available while its replacement is pending or rejected', () => {
    mockApiKey = '__shani_server_vault__';
    mockCredentialState = 'pending';
    act(() => { tree = renderer.create(<Harness />); });
    expect(engine.hasKey).toBe(true);
    expect(engine.state.mode).toBe('dashboard');
    mockCredentialState = 'error';
    act(() => tree.update(<Harness />));
    expect(engine.hasKey).toBe(true);
    expect(engine.state.mode).toBe('dashboard');
  });
});
