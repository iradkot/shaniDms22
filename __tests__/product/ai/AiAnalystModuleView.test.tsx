import React from 'react';
import {StyleSheet, Text} from 'react-native';
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
  startRecommendation: jest.fn(async () => undefined),
  saveFeedback: jest.fn(async () => undefined),
  savePatientMemory: jest.fn(async () => undefined),
  clearPatientMemory: jest.fn(async () => undefined),
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
  it('does not adapt a previous conversation when feedback saving finishes after navigation', async () => {
    const subject = runtime({
      recommendationContextKey: 'conversation-a',
      surface: {kind: 'conversation'},
      messages: [{role: 'assistant', content: 'First answer.'}],
    });
    const reviseFromFeedback = jest.fn(async () => undefined);
    const enhanced = {...subject, reviseFromFeedback};
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={enhanced} />,
      );
    });
    await act(async () => {
      tree!.root
        .findByProps({testID: 'ai-feedback-unhelpful-0'})
        .props.onPress();
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'ai-feedback-reason-0-already-tried'})
        .props.onPress();
    });
    let finishSave!: () => void;
    (subject.saveFeedback as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finishSave = resolve;
        }),
    );
    let adaptation!: Promise<void>;
    act(() => {
      adaptation = tree!.root
        .findByProps({testID: 'ai-feedback-adapt-0'})
        .props.onPress();
    });
    act(() => {
      tree!.update(
        <AiAnalystModuleView
          locale="en"
          runtime={{
            ...enhanced,
            snapshot: {
              ...subject.snapshot,
              recommendationContextKey: 'conversation-b',
              messages: [{role: 'assistant', content: 'Second answer.'}],
            },
          }}
        />,
      );
    });
    await act(async () => {
      finishSave();
      await adaptation;
    });
    expect(reviseFromFeedback).not.toHaveBeenCalled();
    expect(
      tree!.root.findAllByProps({testID: 'ai-feedback-adapt-0'}),
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });
  it('adapts only on explicit request, after saving the reason, and retains retry after a save failure', async () => {
    const subject = runtime({
      surface: {kind: 'conversation'},
      messages: [{role: 'assistant', content: 'Try one practical step.'}],
    });
    const reviseFromFeedback = jest.fn(async () => undefined);
    const enhanced = {...subject, reviseFromFeedback};
    const save = subject.saveFeedback as jest.Mock;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={enhanced} />,
      );
    });
    await act(async () => {
      tree!.root
        .findByProps({testID: 'ai-feedback-unhelpful-0'})
        .props.onPress();
    });
    expect(reviseFromFeedback).not.toHaveBeenCalled();
    act(() => {
      tree!.root
        .findByProps({testID: 'ai-feedback-reason-0-already-tried'})
        .props.onPress();
    });
    expect(reviseFromFeedback).not.toHaveBeenCalled();
    save.mockRejectedValueOnce(new Error('Storage unavailable'));
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'ai-feedback-adapt-0'})
        .props.onPress();
    });
    expect(reviseFromFeedback).not.toHaveBeenCalled();
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'ai-feedback-adapt-0'})
        .props.onPress();
    });
    expect(save).toHaveBeenLastCalledWith({
      messageIndex: 0,
      rating: 'not-helpful',
      reasons: ['already-tried'],
    });
    expect(reviseFromFeedback).toHaveBeenCalledWith(0);
    act(() => tree!.unmount());
  });
  it('offers simple recommendations in Hebrew RTL without the specialist catalogue', async () => {
    const subject = runtime();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="he" runtime={subject} />,
      );
    });
    expect(allText(tree!)).toContain('קבל המלצה לעכשיו');
    expect(allText(tree!)).toContain('קבל המלצה שבועית עכשיו');
    expect(allText(tree!)).not.toContain('חקירות');
    expect(
      tree!.root.findAllByProps({testID: 'ai-start-hypo-investigation'}),
    ).toHaveLength(0);
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({testID: 'ai-recommendation-grid'}).props.style,
      ).flexDirection,
    ).toBe('row-reverse');
    await act(async () => {
      tree!.root.findByProps({testID: 'ai-recommend-now'}).props.onPress();
    });
    expect(subject.startRecommendation).toHaveBeenCalledWith({
      request: {kind: 'now'},
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

  it('lets patients change meal size before submitting a single recommendation', async () => {
    const subject = runtime();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={subject} />,
      );
    });
    act(() =>
      tree!.root.findByProps({testID: 'ai-recommend-meal'}).props.onPress(),
    );
    expect(
      tree!.root.findByProps({testID: 'ai-meal-submit'}).props.disabled,
    ).toBe(true);
    act(() =>
      tree!.root.findByProps({testID: 'ai-meal-size-small'}).props.onPress(),
    );
    act(() =>
      tree!.root.findByProps({testID: 'ai-meal-size-large'}).props.onPress(),
    );
    expect(subject.startRecommendation).not.toHaveBeenCalled();
    await act(async () => {
      tree!.root.findByProps({testID: 'ai-meal-submit'}).props.onPress();
    });
    expect(subject.startRecommendation).toHaveBeenCalledTimes(1);
    expect(subject.startRecommendation).toHaveBeenCalledWith({
      request: {kind: 'meal', mealSize: 'large'},
      locale: 'en',
    });
    act(() => tree!.unmount());
  });

  it('collects, reviews and edits guided choices before submitting, with no early requests', async () => {
    const subject = runtime();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="he" runtime={subject} />,
      );
    });
    const press = (testID: string): void => {
      act(() => tree!.root.findByProps({testID}).props.onPress());
    };
    press('ai-recommend-guided');
    expect(
      tree!.root.findByProps({testID: 'ai-guided-next'}).props.disabled,
    ).toBe(true);
    press('ai-guided-step-0-monthly');
    press('ai-guided-next');
    press('ai-guided-step-1-care-team');
    press('ai-guided-next');
    press('ai-guided-step-2-fewer-lows');
    press('ai-guided-next');
    press('ai-guided-step-3-brief');
    press('ai-guided-next');
    act(() =>
      tree!.root
        .findByProps({testID: 'ai-guided-notes'})
        .props.onChangeText('חשוב לי להתמקד בלילה'),
    );
    press('ai-guided-change-1');
    press('ai-guided-step-1-routine');
    press('ai-guided-next');
    press('ai-guided-next');
    press('ai-guided-next');
    expect(
      tree!.root.findByProps({testID: 'ai-guided-notes'}).props.value,
    ).toBe('חשוב לי להתמקד בלילה');
    expect(subject.startRecommendation).not.toHaveBeenCalled();
    await act(async () => {
      tree!.root.findByProps({testID: 'ai-guided-submit'}).props.onPress();
    });
    expect(subject.startRecommendation).toHaveBeenCalledTimes(1);
    expect(subject.startRecommendation).toHaveBeenCalledWith({
      locale: 'he',
      request: {
        kind: 'guided',
        horizon: 'monthly',
        focus: 'routine',
        goal: 'fewer-lows',
        responseStyle: 'brief',
        patientNotes: 'חשוב לי להתמקד בלילה',
      },
    });
    act(() => tree!.unmount());
  });

  it('persists a rating and optional feedback, and offers retry after a save failure', async () => {
    const subject = runtime({
      surface: {kind: 'conversation'},
      messages: [{role: 'assistant', content: 'Try a small, practical step.'}],
    });
    const save = subject.saveFeedback as jest.Mock;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={subject} />,
      );
    });
    await act(async () => {
      tree!.root.findByProps({testID: 'ai-feedback-helpful-0'}).props.onPress();
    });
    expect(save).toHaveBeenLastCalledWith({
      messageIndex: 0,
      rating: 'helpful',
      reasons: [],
    });
    expect(allText(tree!)).toContain('Thank you, feedback saved');
    act(() =>
      tree!.root
        .findByProps({testID: 'ai-feedback-reason-0-practical'})
        .props.onPress(),
    );
    act(() =>
      tree!.root
        .findByProps({testID: 'ai-feedback-comment-0'})
        .props.onChangeText('Keep suggestions short'),
    );
    save.mockRejectedValueOnce(new Error('Storage unavailable'));
    await act(async () => {
      tree!.root.findByProps({testID: 'ai-feedback-save-0'}).props.onPress();
    });
    expect(allText(tree!)).toContain(
      'We could not save this. Please try again.',
    );
    await act(async () => {
      tree!.root.findByProps({testID: 'ai-feedback-save-0'}).props.onPress();
    });
    expect(save).toHaveBeenLastCalledWith({
      messageIndex: 0,
      rating: 'helpful',
      reasons: ['practical'],
      comment: 'Keep suggestions short',
    });
    expect(allText(tree!)).not.toContain(
      'We could not save this. Please try again.',
    );
    act(() => tree!.unmount());
  });

  it('lets patients edit, disable and clear their saved personal instructions', async () => {
    const subject = runtime({
      patientMemory: {
        enabled: true,
        instructions: 'Vegetarian meals',
        feedbackCount: 2,
        questionCount: 3,
      },
    });
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AiAnalystModuleView locale="en" runtime={subject} />,
      );
    });
    act(() =>
      tree!.root.findByProps({testID: 'ai-memory-toggle'}).props.onPress(),
    );
    expect(
      tree!.root.findByProps({testID: 'ai-memory-instructions'}).props.value,
    ).toBe('Vegetarian meals');
    act(() =>
      tree!.root
        .findByProps({testID: 'ai-memory-instructions'})
        .props.onChangeText('Short vegetarian ideas'),
    );
    act(() =>
      tree!.root.findByProps({testID: 'ai-memory-enabled'}).props.onPress(),
    );
    await act(async () => {
      tree!.root.findByProps({testID: 'ai-memory-save'}).props.onPress();
    });
    expect(subject.savePatientMemory).toHaveBeenCalledWith({
      enabled: false,
      instructions: 'Short vegetarian ideas',
    });
    await act(async () => {
      tree!.root.findByProps({testID: 'ai-memory-clear'}).props.onPress();
    });
    expect(subject.clearPatientMemory).toHaveBeenCalledTimes(1);
    expect(
      tree!.root.findByProps({testID: 'ai-memory-instructions'}).props.value,
    ).toBe('');
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
      visibleContext: 'Loop advice · Focused Loop setting change: change-42.',
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

    expect(allText(tree!)).toContain('What this recommendation is based on');
    expect(allText(tree!)).not.toContain('change-42');
    act(() =>
      tree!.root.findByProps({testID: 'ai-context-toggle'}).props.onPress(),
    );
    expect(allText(tree!)).toContain('change-42');
    expect(allText(tree!)).toContain(
      'The AI cannot change Loop, Nightscout, or therapy settings.',
    );
    act(() =>
      tree!.root
        .findByProps({testID: 'ai-composer-input'})
        .props.onChangeText('A safer question'),
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
    act(() =>
      tree!.root.findByProps({testID: 'ai-history-resume'}).props.onPress(),
    );
    act(() =>
      tree!.root.findByProps({testID: 'ai-history-delete'}).props.onPress(),
    );
    expect(subject.resumeConversation).toHaveBeenCalledWith('c-1');
    expect(subject.deleteConversation).toHaveBeenCalledWith('c-1');
    act(() => tree!.unmount());
  });
});
