import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  DailyOverview,
  DailyOverviewDataSource,
  DailyOverviewPeriod,
} from '../../modules/dailyOverview';
import {
  buildDailyOverview,
  getLocalDayPeriod,
  localDayStart,
  moveLocalDay,
} from '../../modules/dailyOverview';
import type {TrendsRangeThresholds} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {DestinationFocus} from '../shell';
import {ProductPage} from '../ui';
import {
  DEFAULT_DAILY_OVERVIEW_PREFERENCES,
  type StoredDailyOverviewPreferences,
} from '../personalization/types';
import type {DailyOverviewPreferencesRuntime} from './runtime';
import {DAILY_OVERVIEW_COPY} from './copy';
import {
  DailyOverviewCard,
  dailyCardLabel,
  RangeGraphic,
} from './DailyOverviewCards';
import {DailyOverviewReorderList} from './DailyOverviewReorderList';

const DEFAULT_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const systemNow = (): number => Date.now();
type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {readonly kind: 'ready'; readonly overview: DailyOverview};
export interface DailyOverviewModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: DailyOverviewDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly focus?: DestinationFocus;
  readonly expectedSampleIntervalMs?: number;
  readonly now?: () => number;
  readonly layoutPreferences?: DailyOverviewPreferencesRuntime;
}

// A scope change unmounts the presentation session, including any pending draft.
export const DailyOverviewModuleView = (
  props: DailyOverviewModuleViewProps,
) => {
  const focusedDayStartMs =
    props.focus?.kind === 'day'
      ? localDayStart(props.focus.dayStartMs)
      : undefined;
  const [selectedDayStartMs, setSelectedDayStartMs] = useState(() =>
    localDayStart(focusedDayStartMs ?? (props.now ?? systemNow)()),
  );
  useEffect(() => {
    if (focusedDayStartMs !== undefined) {
      setSelectedDayStartMs(focusedDayStartMs);
    }
  }, [focusedDayStartMs]);
  return (
    <DailyOverviewSession
      key={`${props.layoutPreferences?.scopeKey ?? 'preview'}:${
        props.layoutPreferences?.layout ?? 'phone'
      }`}
      {...props}
      selectedDayStartMs={selectedDayStartMs}
      setSelectedDayStartMs={setSelectedDayStartMs}
    />
  );
};

interface DailyOverviewSessionProps extends DailyOverviewModuleViewProps {
  readonly selectedDayStartMs: number;
  readonly setSelectedDayStartMs: (dayStartMs: number) => void;
}

const DailyOverviewSession = ({
  locale,
  dataSource,
  thresholds,
  expectedSampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = systemNow,
  layoutPreferences,
  selectedDayStartMs,
  setSelectedDayStartMs,
}: DailyOverviewSessionProps) => {
  const copy = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const [reloadSequence, setReloadSequence] = useState(0);
  const [state, setState] = useState<LoadState>({kind: 'loading'});
  const requestSequence = useRef(0);
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const [saved, setSaved] = useState(
    layoutPreferences?.value ?? DEFAULT_DAILY_OVERVIEW_PREFERENCES,
  );
  const [draft, setDraft] = useState<StoredDailyOverviewPreferences | null>(
    null,
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>(
    'idle',
  );
  const preferences = draft ?? saved;
  const canEdit = layoutPreferences?.hydrated !== false;
  const todayStartMs = localDayStart(now());
  const selectedPeriod = useMemo<DailyOverviewPeriod>(
    () => getLocalDayPeriod(selectedDayStartMs),
    [selectedDayStartMs],
  );
  const isToday = selectedDayStartMs >= todayStartMs;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // A native host can publish an optimistic value before its disk write.
    // Only a successful save may replace the baseline of an open editor.
    if (layoutPreferences?.value && draftRef.current === null) {
      setSaved(layoutPreferences.value);
    }
  }, [layoutPreferences?.value]);
  useEffect(() => {
    const request = ++requestSequence.current;
    let active = true;
    setState({kind: 'loading'});
    dataSource
      .loadDailyOverview(selectedPeriod)
      .then(source => {
        if (active && requestSequence.current === request) {
          setState({
            kind: 'ready',
            overview: buildDailyOverview({
              period: selectedPeriod,
              expectedSampleIntervalMs,
              thresholds,
              source,
            }),
          });
        }
      })
      .catch(() => {
        if (active && requestSequence.current === request) {
          setState({kind: 'error'});
        }
      });
    return () => {
      active = false;
    };
  }, [
    dataSource,
    expectedSampleIntervalMs,
    reloadSequence,
    selectedPeriod,
    thresholds,
  ]);
  const moveSelection = (delta: -1 | 1): void => {
    if (delta === 1 && isToday) {
      return;
    }
    setSelectedDayStartMs(
      Math.min(moveLocalDay(selectedDayStartMs, delta), todayStartMs),
    );
  };
  const saveDesign = async (): Promise<void> => {
    if (!draft || savingRef.current || !canEdit) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveStatus('idle');
    try {
      await layoutPreferences?.onSave?.(draft);
      if (mounted.current) {
        setSaved(draft);
        setDraft(null);
        setSaveStatus('saved');
      }
    } catch {
      if (mounted.current) {
        setSaveStatus('error');
      }
    } finally {
      savingRef.current = false;
      if (mounted.current) {
        setSaving(false);
      }
    }
  };
  const formattedDay = new Date(selectedDayStartMs).toLocaleDateString(
    locale === 'he' ? 'he-IL' : 'en-US',
    {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'},
  );
  const direction = rtl && styles.rowReverse;
  const textDirection = rtl && styles.rtlText;
  const heading = (
    <View style={[styles.pageHeader, direction]}>
      <View style={styles.headingText}>
        <Text
          accessibilityRole="header"
          style={[styles.pageTitle, textDirection]}>
          {copy.title}
        </Text>
        <Text style={[styles.subtitle, textDirection]}>{copy.subtitle}</Text>
      </View>
      {!draft ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{disabled: !canEdit}}
          disabled={!canEdit}
          testID="daily-overview-customize"
          onPress={() => {
            setDraft(saved);
            setSaveStatus('idle');
          }}
          style={({pressed}) => [
            styles.customizeButton,
            !canEdit && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.customizeIcon}>✧</Text>
          <Text style={styles.customizeText}>{copy.customize}</Text>
        </Pressable>
      ) : null}
    </View>
  );
  return (
    <ProductPage
      locale={locale}
      title={copy.title}
      subtitle={copy.subtitle}
      testID="daily-overview-view"
      header={heading}>
      <View style={styles.pageBody}>
        <View
          style={[styles.dayControls, direction]}
          testID="daily-overview-day-controls">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.previous}
            onPress={() => moveSelection(-1)}
            style={({pressed}) => [styles.dayButton, pressed && styles.pressed]}
            testID="daily-overview-previous">
            <Text style={styles.dayButtonText}>{copy.previous}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{selected: isToday}}
            onPress={() => setSelectedDayStartMs(todayStartMs)}
            style={({pressed}) => [
              styles.todayButton,
              isToday && styles.todaySelected,
              pressed && styles.pressed,
            ]}
            testID="daily-overview-today">
            <Text style={[styles.dayButtonText, isToday && styles.white]}>
              {copy.today}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.next}
            accessibilityState={{disabled: isToday}}
            disabled={isToday}
            onPress={() => moveSelection(1)}
            style={({pressed}) => [
              styles.dayButton,
              isToday && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="daily-overview-next">
            <Text style={styles.dayButtonText}>{copy.next}</Text>
          </Pressable>
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.dayTitle, textDirection]}
          testID="daily-overview-selected-day">
          {formattedDay}
        </Text>
        {draft ? (
          <View style={styles.editor} testID="daily-overview-editor">
            <Text
              accessibilityRole="header"
              style={[styles.editorTitle, textDirection]}>
              {copy.editorTitle}
            </Text>
            <Text style={[styles.hint, textDirection]}>
              {copy.editorDescription}
            </Text>
            <View style={[styles.editorActions, direction]}>
              <Pressable
                disabled={saving || !canEdit}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: saving || !canEdit,
                  busy: saving,
                }}
                testID="daily-overview-save"
                onPress={saveDesign}
                style={({pressed}) => [
                  styles.saveButton,
                  saving && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.saveText}>
                  {saving ? copy.saving : copy.save}
                </Text>
              </Pressable>
              <Pressable
                disabled={saving}
                accessibilityRole="button"
                testID="daily-overview-cancel"
                onPress={() => {
                  setDraft(null);
                  setSaveStatus('idle');
                }}
                style={styles.textButton}>
                <Text style={styles.buttonText}>{copy.cancel}</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                accessibilityRole="button"
                testID="daily-overview-reset"
                onPress={() => setDraft(DEFAULT_DAILY_OVERVIEW_PREFERENCES)}
                style={styles.textButton}>
                <Text style={styles.resetText}>{copy.reset}</Text>
              </Pressable>
            </View>
            {saveStatus === 'error' ? (
              <Text
                accessibilityRole="alert"
                style={[styles.errorText, textDirection]}>
                {copy.saveFailed}
              </Text>
            ) : null}
            {!layoutPreferences?.onSave ? (
              <Text style={[styles.hint, textDirection]}>
                {copy.sessionOnly}
              </Text>
            ) : null}
            <Text style={[styles.controlTitle, textDirection]}>
              {copy.rangeStyle}
            </Text>
            <View style={[styles.styleOptions, direction]}>
              {(['ring', 'bar', 'list'] as const).map(variant => (
                <Pressable
                  key={variant}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={copy[variant]}
                  accessibilityState={{
                    selected: draft.rangeStyle === variant,
                    disabled: saving,
                  }}
                  testID={`daily-overview-style-${variant}`}
                  onPress={() => setDraft({...draft, rangeStyle: variant})}
                  style={({pressed}) => [
                    styles.styleOption,
                    draft.rangeStyle === variant && styles.styleSelected,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.styleIcon}>
                    <RangeGraphic
                      ranges={
                        state.kind === 'ready' && state.overview.ranges
                          ? state.overview.ranges
                          : {
                              veryLowPercent: 5,
                              lowPercent: 5,
                              targetPercent: 75,
                              highPercent: 10,
                              veryHighPercent: 5,
                            }
                      }
                      variant={variant}
                      miniature
                    />
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      draft.rangeStyle === variant && styles.optionSelected,
                    ]}>
                    {copy[variant]}
                  </Text>
                </Pressable>
              ))}
            </View>
            {state.kind === 'ready' ? (
              <>
                <View style={[styles.liveHeading, direction]}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{copy.live}</Text>
                </View>
                <DailyOverviewCard
                  id="ranges"
                  overview={state.overview}
                  locale={locale}
                  thresholds={thresholds}
                  rangeStyle={draft.rangeStyle}
                />
                <Text style={[styles.controlTitle, textDirection]}>
                  {copy.reorder}
                </Text>
                <Text style={[styles.hint, textDirection]}>
                  {copy.reorderHint}
                </Text>
                <DailyOverviewReorderList
                  locale={locale}
                  disabled={saving}
                  items={draft.cardOrder.map(id => ({
                    id,
                    label: dailyCardLabel(id, locale),
                    preview: (
                      <DailyOverviewCard
                        id={id}
                        overview={state.overview}
                        locale={locale}
                        thresholds={thresholds}
                        rangeStyle={draft.rangeStyle}
                        compact
                      />
                    ),
                  }))}
                  onReorder={ids => {
                    const cardOrder = ids.flatMap(id =>
                      draft.cardOrder.filter(card => card === id),
                    );
                    if (
                      cardOrder.length === draft.cardOrder.length &&
                      new Set(cardOrder).size === cardOrder.length
                    ) {
                      setDraft({...draft, cardOrder});
                    }
                  }}
                />
                <View style={[styles.editorActions, direction]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: saving || !canEdit,
                      busy: saving,
                    }}
                    disabled={saving || !canEdit}
                    onPress={saveDesign}
                    style={styles.saveButton}
                    testID="daily-overview-save-bottom">
                    <Text style={styles.saveText}>
                      {saving ? copy.saving : copy.save}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => {
                      setDraft(null);
                      setSaveStatus('idle');
                    }}
                    style={styles.textButton}
                    testID="daily-overview-cancel-bottom">
                    <Text style={styles.buttonText}>{copy.cancel}</Text>
                  </Pressable>
                </View>
                {saveStatus === 'error' ? (
                  <Text
                    accessibilityRole="alert"
                    style={[styles.errorText, textDirection]}>
                    {copy.saveFailed}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        ) : saveStatus === 'saved' ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.savedText, textDirection]}>
            {layoutPreferences?.onSave ? copy.saved : copy.sessionOnly}
          </Text>
        ) : null}
        {state.kind === 'loading' ? (
          <View style={styles.stateCard} testID="daily-overview-loading">
            <ActivityIndicator color="#256D9D" />
            <Text style={styles.hint}>{copy.loading}</Text>
          </View>
        ) : state.kind === 'error' ? (
          <View style={styles.stateCard} testID="daily-overview-error">
            <Text style={[styles.errorText, textDirection]}>{copy.failed}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setReloadSequence(value => value + 1)}
              style={styles.saveButton}
              testID="daily-overview-retry">
              <Text style={styles.saveText}>{copy.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <View testID="daily-overview-content" style={styles.cards}>
            {draft ? (
              <View style={[styles.liveHeading, direction]}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{copy.live}</Text>
              </View>
            ) : null}
            {preferences.cardOrder.map(id => (
              <View key={id} testID={`daily-overview-card-${id}`}>
                <DailyOverviewCard
                  id={id}
                  overview={state.overview}
                  locale={locale}
                  thresholds={thresholds}
                  rangeStyle={preferences.rangeStyle}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.45},
  white: {color: '#FFFFFF'},
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  pageBody: {width: '100%', maxWidth: 620, alignSelf: 'center'},
  headingText: {flex: 1},
  pageTitle: {fontSize: 28, fontWeight: '800', color: '#233D49'},
  subtitle: {fontSize: 13, color: '#647785', marginTop: 4},
  customizeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E7F1',
    padding: 10,
    backgroundColor: '#EAF2F9',
    minHeight: 48,
    gap: 2,
  },
  customizeIcon: {fontSize: 19, color: '#256D9D'},
  customizeText: {fontSize: 11, color: '#256D9D', fontWeight: '700'},
  dayControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EAF0F4',
    borderRadius: 16,
    padding: 5,
    marginTop: 22,
  },
  dayButton: {
    minWidth: 72,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonText: {fontSize: 13, fontWeight: '700', color: '#456176'},
  todayButton: {
    minWidth: 92,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  todaySelected: {backgroundColor: '#286F9E'},
  dayTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#526C7C',
    textAlign: 'center',
    marginVertical: 18,
  },
  cards: {gap: 14},
  stateCard: {
    padding: 24,
    gap: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
  },
  editor: {
    padding: 12,
    backgroundColor: '#EAF1F8',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#CBDDEC',
    marginBottom: 20,
  },
  editorTitle: {fontSize: 20, color: '#254F6D', fontWeight: '800'},
  hint: {color: '#627A8C', fontSize: 12, lineHeight: 19, marginTop: 6},
  editorActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 12,
    alignItems: 'center',
  },
  saveButton: {
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#286F9E',
    borderRadius: 12,
  },
  saveText: {color: '#FFFFFF', fontWeight: '700', fontSize: 13},
  textButton: {
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {color: '#345B78', fontWeight: '600', fontSize: 13},
  resetText: {color: '#627A8C', fontSize: 12},
  controlTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#345B78',
    marginTop: 20,
    marginBottom: 8,
  },
  styleOptions: {flexDirection: 'row', gap: 8},
  styleOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#F7FAFC',
    minHeight: 86,
    gap: 5,
  },
  styleSelected: {borderColor: '#286F9E', backgroundColor: '#FFFFFF'},
  styleIcon: {height: 38, justifyContent: 'center'},
  optionText: {fontSize: 12, color: '#627A8C'},
  optionSelected: {color: '#286F9E', fontWeight: '800'},
  liveHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 14,
  },
  liveDot: {height: 6, width: 6, borderRadius: 3, backgroundColor: '#169C79'},
  liveText: {fontSize: 12, fontWeight: '700', color: '#39806D'},
  savedText: {fontSize: 13, color: '#187F65', marginBottom: 14},
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#A23438',
    marginVertical: 8,
  },
});
