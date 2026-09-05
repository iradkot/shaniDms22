import React from 'react';
import {Pressable, StyleSheet, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {AiAnalystModuleRuntime} from 'app/product/ai';
import {AiAnalystModuleView} from 'app/product/ai';

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return Array.isArray(value) ? value.map(renderedText).join('') : '';
};

const allText = (tree: renderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map(node => renderedText(node.props.children))
    .join('\n');

const runtime = (
  overrides: Partial<AiAnalystModuleRuntime['snapshot']> = {},
): AiAnalystModuleRuntime => ({
  snapshot: {
    availability: 'ready',
    surface: {kind: 'landing'},
    activeSpecialist: 'general-chat',
    visibleContext: undefined,
    messages: [],
    draft: '',
    busy: false,
    progress: '',
    error: undefined,
    history: [],
    historyBusy: false,
    ...overrides,
  },
  setDraft: jest.fn(),
  start: jest.fn(async () => undefined),
  send: jest.fn(async () => undefined),
  retry: jest.fn(async () => undefined),
  cancel: jest.fn(),
  openLanding: jest.fn(),
  openHistory: jest.fn(async () => undefined),
  openHistoryDetail: jest.fn(),
  resumeConversation: jest.fn(async () => undefined),
  deleteConversation: jest.fn(async () => undefined),
  clearHistory: jest.fn(async () => undefined),
  openSettings: jest.fn(),
});

describe('AiAnalystModuleView', () => {
  it('keeps general chat primary and groups secondary specialists below it in Hebrew RTL', () => {
    const subject = runtime();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="he" runtime={subject} />,
      );
    });

    expect(allText(tree!)).toContain('צ׳אט כללי');
    expect(allText(tree!)).toContain('חקירות');
    expect(allText(tree!)).toContain('שיפורים');
    const general = tree!.root.findByProps({testID: 'ai-start-general-chat'});
    const hypo = tree!.root.findByProps({
      testID: 'ai-start-hypo-investigation',
    });
    expect(
      tree!.root.findAllByType(Pressable).indexOf(general),
    ).toBeLessThan(tree!.root.findAllByType(Pressable).indexOf(hypo));
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({testID: 'ai-specialist-investigation-grid'})
          .props.style,
      ).flexDirection,
    ).toBe('row-reverse');

    act(() => general.props.onPress());
    expect(subject.start).toHaveBeenCalledWith({
      specialist: 'general-chat',
      locale: 'he',
    });
    act(() =>
      tree!.root
        .findByProps({testID: 'ai-open-settings-from-landing'})
        .props.onPress(),
    );
    expect(subject.openSettings).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('opens settings immediately when an AI key is missing', () => {
    const subject = runtime({availability: 'missing-credentials'});
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={subject} />,
      );
    });
    expect(subject.openSettings).toHaveBeenCalledTimes(1);
    expect(allText(tree!)).toContain('AI credentials are needed');
    act(() => tree!.unmount());
  });

  it('shows focused context and sends user text from the conversation surface', () => {
    const subject = runtime({
      surface: {kind: 'conversation'},
      activeSpecialist: 'loop-advice',
      visibleContext:
        'Loop advice · Focused Loop setting change: change-42.',
      messages: [
        {role: 'assistant', content: 'I can help review the evidence.'},
      ],
      draft: 'What should I review?',
    });
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={subject} />,
      );
    });

    expect(allText(tree!)).toContain('Context in this conversation');
    expect(allText(tree!)).toContain('change-42');
    expect(allText(tree!)).toContain(
      'The AI cannot change Loop, Nightscout, or therapy settings.',
    );
    act(() =>
      tree!.root.findByType(TextInput).props.onChangeText('A safer question'),
    );
    expect(subject.setDraft).toHaveBeenCalledWith('A safer question');
    act(() => tree!.root.findByProps({testID: 'ai-send'}).props.onPress());
    expect(subject.send).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('supports cancel and retry without hiding the current conversation', () => {
    const subject = runtime({
      surface: {kind: 'conversation'},
      busy: true,
      progress: 'Reviewing evidence…',
      error: 'The request failed.',
    });
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={subject} />,
      );
    });

    act(() => tree!.root.findByProps({testID: 'ai-cancel'}).props.onPress());
    expect(subject.cancel).toHaveBeenCalledTimes(1);
    act(() => tree!.root.findByProps({testID: 'ai-retry'}).props.onPress());
    expect(subject.retry).toHaveBeenCalledTimes(1);
    expect(tree!.root.findByProps({testID: 'ai-conversation'})).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('shows Workspace-scoped history and resumes or deletes a selected session', () => {
    const subject = runtime({
      surface: {kind: 'history-detail', conversationId: 'c-1'},
      history: [
        {
          id: 'c-1',
          title: 'Night question',
          specialist: 'general-chat',
          createdAt: 1,
          updatedAt: 2,
          messages: [
            {role: 'user', content: 'What happened overnight?'},
            {role: 'assistant', content: 'Here are the observations.'},
          ],
        },
      ],
    });
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={subject} />,
      );
    });

    expect(allText(tree!)).toContain('Night question');
    expect(allText(tree!)).toContain('What happened overnight?');
    act(() => tree!.root.findByProps({testID: 'ai-history-resume'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'ai-history-delete'}).props.onPress());
    expect(subject.resumeConversation).toHaveBeenCalledWith('c-1');
    expect(subject.deleteConversation).toHaveBeenCalledWith('c-1');
    act(() => tree!.unmount());
  });
});
