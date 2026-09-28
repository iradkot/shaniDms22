import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {AiLocale, AiRecommendationFeedback} from '../../modules/ai';
import type {AiAnalystModuleRuntime} from './runtime';
import {
  RecommendationButton,
  recommendationColors as colors,
} from './RecommendationControls';

const COPY = {
  he: {
    memoryTitle: 'מה חשוב שנזכור?',
    memoryDescription: 'העדפות והנחיות אישיות לשיחות הבאות',
    memoryEnabled: 'לזכור את ההעדפות שלי',
    memoryLabel: 'הנחיות אישיות',
    memoryPlaceholder: 'למשל: אני צמחוני, מעדיף תשובות קצרות ועובד במשמרות',
    memoryHint:
      'נשמר במכשיר ובסביבת העבודה הזו. מידע רלוונטי נשלח ל־AI להתאמת ההמלצות. אפשר לערוך או לנקות בכל רגע.',
    save: 'שמירת העדפות',
    clear: 'ניקוי הזיכרון האישי',
    saved: 'נשמר',
    cleared: 'הזיכרון נוקה',
    saving: 'שומר…',
    failed: 'השמירה לא הצליחה. אפשר לנסות שוב.',
    close: 'סגירה',
    feedbackQuestion: 'ההמלצה עזרה לכם?',
    helpful: 'עזר לי',
    unhelpful: 'פחות התאים לי',
    feedbackDetail: 'מה עבד, ומה אפשר לשפר? (לא חובה)',
    feedbackPlaceholder: 'מה תרצו שנעשה אחרת בפעם הבאה?',
    feedbackLabel: 'משוב אישי על ההמלצה',
    feedbackSave: 'שמירת המשוב',
    feedbackSaved: 'תודה, המשוב נשמר',
    clearReason: 'ברור',
    practical: 'מעשי',
    fits: 'מתאים לי',
    tooLong: 'ארוך מדי',
    irrelevant: 'לא רלוונטי',
    hard: 'קשה ליישום',
    tried: 'כבר ניסיתי',
    adapt: 'התאם לי את ההמלצה',
    adapting: 'מתאים את ההמלצה…',
  },
  en: {
    memoryTitle: 'What should we remember?',
    memoryDescription:
      'Your preferences and instructions for future conversations',
    memoryEnabled: 'Remember my preferences',
    memoryLabel: 'Personal instructions',
    memoryPlaceholder:
      'For example: I am vegetarian, prefer short answers, and work shifts',
    memoryHint:
      'Saved on this device for this Workspace. Relevant details are sent to the AI to personalize recommendations. Edit or clear anytime.',
    save: 'Save preferences',
    clear: 'Clear personal memory',
    saved: 'Saved',
    cleared: 'Memory cleared',
    saving: 'Saving…',
    failed: 'We could not save this. Please try again.',
    close: 'Close',
    feedbackQuestion: 'Was this helpful?',
    helpful: 'Helpful',
    unhelpful: 'Not helpful',
    feedbackDetail: 'What worked, or could be better? (optional)',
    feedbackPlaceholder: 'What should we do differently next time?',
    feedbackLabel: 'Personal feedback on this recommendation',
    feedbackSave: 'Save feedback',
    feedbackSaved: 'Thank you, feedback saved',
    clearReason: 'Clear',
    practical: 'Practical',
    fits: 'Fits my needs',
    tooLong: 'Too long',
    irrelevant: 'Not relevant',
    hard: 'Hard to follow',
    tried: 'Already tried this',
    adapt: 'Adapt this recommendation',
    adapting: 'Adapting your recommendation…',
  },
} as const;

export const PatientMemoryControl = ({
  locale,
  runtime,
}: {
  readonly locale: AiLocale;
  readonly runtime: AiAnalystModuleRuntime;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const memory = runtime.snapshot.patientMemory;
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(memory?.enabled ?? true);
  const [instructions, setInstructions] = useState(memory?.instructions ?? '');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'saved' | 'cleared' | 'error'>();
  const pendingRef = useRef(false);
  useEffect(() => {
    setEnabled(memory?.enabled ?? true);
    setInstructions(memory?.instructions ?? '');
  }, [memory?.enabled, memory?.instructions]);
  if (!runtime.savePatientMemory || !runtime.clearPatientMemory) {
    return null;
  }
  const save = async (clear: boolean): Promise<void> => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setStatus(undefined);
    try {
      if (clear) {
        await runtime.clearPatientMemory?.();
        setInstructions('');
        setStatus('cleared');
      } else {
        await runtime.savePatientMemory?.({enabled, instructions});
        setStatus('saved');
      }
    } catch {
      setStatus('error');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const busy = pending || !!runtime.snapshot.memoryBusy;
  return (
    <View style={styles.memory} testID="ai-patient-memory">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{expanded}}
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        style={[styles.memoryHeading, rtl && styles.reverse]}
        testID="ai-memory-toggle">
        <View style={styles.grow}>
          <Text style={[styles.memoryTitle, rtl && styles.rtl]}>
            {copy.memoryTitle}
          </Text>
          <Text style={[styles.description, rtl && styles.rtl]}>
            {copy.memoryDescription}
          </Text>
        </View>
        <Text style={styles.expandIcon}>{expanded ? '−' : '+'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.memoryBody}>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={copy.memoryEnabled}
            accessibilityState={{checked: enabled, disabled: busy}}
            disabled={busy}
            onPress={() => {
              setEnabled(!enabled);
              setStatus(undefined);
            }}
            style={[styles.switchRow, rtl && styles.reverse]}
            testID="ai-memory-enabled">
            <Text style={[styles.switchLabel, rtl && styles.rtl]}>
              {copy.memoryEnabled}
            </Text>
            <View style={[styles.switchTrack, enabled && styles.switchTrackOn]}>
              <View
                style={[styles.switchThumb, enabled && styles.switchThumbOn]}
              />
            </View>
          </Pressable>
          <Text style={[styles.label, rtl && styles.rtl]}>
            {copy.memoryLabel}
          </Text>
          <TextInput
            accessibilityLabel={copy.memoryLabel}
            editable={!busy}
            multiline
            maxLength={1000}
            value={instructions}
            onChangeText={value => {
              setInstructions(value);
              setStatus(undefined);
            }}
            placeholder={copy.memoryPlaceholder}
            placeholderTextColor={colors.muted}
            style={[styles.input, rtl && styles.rtl]}
            testID="ai-memory-instructions"
          />
          <Text style={[styles.hint, rtl && styles.rtl]}>
            {copy.memoryHint}
          </Text>
          <View style={[styles.actions, rtl && styles.reverse]}>
            <RecommendationButton
              label={busy ? copy.saving : copy.save}
              disabled={busy}
              onPress={() => {
                save(false);
              }}
              testID="ai-memory-save"
            />
            <RecommendationButton
              label={copy.clear}
              disabled={busy}
              onPress={() => {
                save(true);
              }}
              secondary
              testID="ai-memory-clear"
            />
          </View>
          {status || runtime.snapshot.memoryError ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.status,
                (status === 'error' || !!runtime.snapshot.memoryError) &&
                  styles.error,
                rtl && styles.rtl,
              ]}>
              {runtime.snapshot.memoryError ||
                (status === 'error'
                  ? copy.failed
                  : status === 'cleared'
                  ? copy.cleared
                  : copy.saved)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export const RecommendationFeedbackControl = ({
  locale,
  runtime,
  messageIndex,
}: {
  readonly locale: AiLocale;
  readonly runtime: AiAnalystModuleRuntime;
  readonly messageIndex: number;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const saved = runtime.snapshot.messageFeedback?.[messageIndex];
  const [rating, setRating] = useState<
    AiRecommendationFeedback['rating'] | undefined
  >(saved?.rating);
  const [reasons, setReasons] = useState<readonly string[]>(
    saved?.reasons ?? [],
  );
  const [comment, setComment] = useState(saved?.comment ?? '');
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'saved' | 'error' | 'editing'>();
  const pendingRef = useRef(false);
  const actionGeneration = useRef(0);
  useEffect(() => {
    actionGeneration.current += 1;
    return () => {
      actionGeneration.current += 1;
    };
  }, [runtime.snapshot.recommendationContextKey]);
  useEffect(() => {
    setRating(saved?.rating);
    setReasons(saved?.reasons ?? []);
    setComment(saved?.comment ?? '');
  }, [saved]);
  if (!runtime.saveFeedback) {
    return null;
  }
  const save = async (
    nextRating: AiRecommendationFeedback['rating'],
    nextReasons: readonly string[],
    nextComment: string,
  ): Promise<boolean> => {
    if (pendingRef.current) {
      return false;
    }
    pendingRef.current = true;
    setPending(true);
    setStatus('editing');
    try {
      await runtime.saveFeedback?.({
        messageIndex,
        rating: nextRating,
        reasons: [...nextReasons],
        ...(nextComment.trim() ? {comment: nextComment.trim()} : {}),
      });
      setStatus('saved');
      return true;
    } catch {
      setStatus('error');
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const chooseRating = (value: AiRecommendationFeedback['rating']): void => {
    const nextReasons = value === rating ? reasons : [];
    setRating(value);
    setReasons(nextReasons);
    setExpanded(true);
    save(value, nextReasons, comment);
  };
  const options =
    rating === 'helpful'
      ? [
          {value: 'clear', label: copy.clearReason},
          {value: 'practical', label: copy.practical},
          {value: 'fits-me', label: copy.fits},
        ]
      : [
          {value: 'too-long', label: copy.tooLong},
          {value: 'not-relevant', label: copy.irrelevant},
          {value: 'hard-to-follow', label: copy.hard},
          {value: 'already-tried', label: copy.tried},
        ];
  return (
    <View style={styles.feedback} testID={`ai-feedback-${messageIndex}`}>
      <Text style={[styles.feedbackTitle, rtl && styles.rtl]}>
        {copy.feedbackQuestion}
      </Text>
      <View style={[styles.actions, rtl && styles.reverse]}>
        <RecommendationButton
          label={`👍 ${copy.helpful}`}
          accessibilityLabel={copy.helpful}
          secondary
          selected={rating === 'helpful'}
          disabled={pending || runtime.snapshot.busy}
          onPress={() => chooseRating('helpful')}
          testID={`ai-feedback-helpful-${messageIndex}`}
        />
        <RecommendationButton
          label={`👎 ${copy.unhelpful}`}
          accessibilityLabel={copy.unhelpful}
          secondary
          selected={rating === 'not-helpful'}
          disabled={pending || runtime.snapshot.busy}
          onPress={() => chooseRating('not-helpful')}
          testID={`ai-feedback-unhelpful-${messageIndex}`}
        />
      </View>
      {expanded && rating ? (
        <View style={styles.feedbackDetails}>
          <Text style={[styles.description, rtl && styles.rtl]}>
            {copy.feedbackDetail}
          </Text>
          <View style={[styles.actions, rtl && styles.reverse]}>
            {options.map(option => (
              <RecommendationButton
                key={option.value}
                label={option.label}
                secondary
                selected={reasons.includes(option.value)}
                disabled={pending}
                onPress={() => {
                  setReasons(
                    reasons.includes(option.value)
                      ? reasons.filter(reason => reason !== option.value)
                      : [...reasons, option.value],
                  );
                  setStatus('editing');
                }}
                testID={`ai-feedback-reason-${messageIndex}-${option.value}`}
              />
            ))}
          </View>
          <TextInput
            accessibilityLabel={copy.feedbackLabel}
            editable={!pending}
            multiline
            maxLength={500}
            value={comment}
            onChangeText={value => {
              setComment(value);
              setStatus('editing');
            }}
            placeholder={copy.feedbackPlaceholder}
            placeholderTextColor={colors.muted}
            style={[styles.input, rtl && styles.rtl]}
            testID={`ai-feedback-comment-${messageIndex}`}
          />
          <View style={[styles.actions, rtl && styles.reverse]}>
            {rating === 'not-helpful' &&
            runtime.reviseFromFeedback &&
            (reasons.length > 0 || comment.trim()) ? (
              <RecommendationButton
                label={runtime.snapshot.busy ? copy.adapting : copy.adapt}
                disabled={pending || runtime.snapshot.busy}
                onPress={async () => {
                  const generation = actionGeneration.current;
                  if (
                    !(await save(rating, reasons, comment)) ||
                    actionGeneration.current !== generation
                  ) {
                    return;
                  }
                  pendingRef.current = true;
                  setPending(true);
                  try {
                    await runtime.reviseFromFeedback?.(messageIndex);
                  } catch {
                    setStatus('error');
                  } finally {
                    pendingRef.current = false;
                    setPending(false);
                  }
                }}
                testID={`ai-feedback-adapt-${messageIndex}`}
              />
            ) : null}
            <RecommendationButton
              label={pending ? copy.saving : copy.feedbackSave}
              disabled={pending}
              onPress={() => {
                save(rating, reasons, comment);
              }}
              testID={`ai-feedback-save-${messageIndex}`}
            />
            <RecommendationButton
              label={copy.close}
              secondary
              disabled={pending}
              onPress={() => setExpanded(false)}
              testID={`ai-feedback-close-${messageIndex}`}
            />
          </View>
        </View>
      ) : null}
      {status === 'saved' ||
      status === 'error' ||
      (status === undefined && saved) ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.status,
            status === 'error' && styles.error,
            rtl && styles.rtl,
          ]}>
          {status === 'error' ? copy.failed : copy.feedbackSaved}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  reverse: {flexDirection: 'row-reverse'},
  grow: {flex: 1},
  memory: {
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginTop: 20,
    overflow: 'hidden',
  },
  memoryHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    padding: 18,
    gap: 14,
  },
  memoryTitle: {color: colors.ink, fontSize: 16, fontWeight: '700'},
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  expandIcon: {color: colors.teal, fontSize: 24},
  memoryBody: {paddingHorizontal: 18, paddingBottom: 18},
  switchRow: {
    flexDirection: 'row',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#B2C4BB',
    padding: 3,
  },
  switchTrackOn: {backgroundColor: colors.teal},
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  switchThumbOn: {alignSelf: 'flex-end'},
  switchLabel: {color: colors.ink, fontSize: 14, flexShrink: 1},
  label: {color: colors.ink, fontSize: 13, fontWeight: '600', marginTop: 12},
  input: {
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    minHeight: 86,
    marginTop: 9,
    padding: 14,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  hint: {color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 8},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10},
  status: {color: colors.teal, fontSize: 12, lineHeight: 19, marginTop: 10},
  error: {color: '#9F2D27'},
  feedback: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 14,
  },
  feedbackTitle: {color: colors.muted, fontSize: 12},
  feedbackDetails: {marginTop: 10},
});
