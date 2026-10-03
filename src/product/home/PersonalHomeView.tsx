import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {TrendsRangeThresholds} from '../../modules/trends';
import {ProductPage} from '../ui';
import {ReorderList} from '../ui/reorder';
import {
  DEFAULT_HOME_PREFERENCES,
  HOME_WIDGET_IDS,
  type HomeWidgetId,
  type StoredHomePreferences,
} from '../personalization';
import {useRefreshingNow} from '../time/useRefreshingNow';
import {HomeWidget, HOME_WIDGET_COLORS, HOME_WIDGET_ICONS} from './HomeWidgets';
import {HOME_COPY} from './homeCopy';
import {useHomeData} from './useHomeData';
import type {HomeDataSources} from './homeData';

export interface PersonalHomeViewProps {
  readonly locale: 'en' | 'he';
  /** Account, workspace, source and form factor identify a presentation session. */
  readonly scopeKey: string;
  readonly value: StoredHomePreferences;
  readonly hydrated: boolean;
  readonly sources: HomeDataSources;
  readonly thresholds: TrendsRangeThresholds;
  readonly onSave?: (value: StoredHomePreferences) => Promise<void>;
  readonly onOpenWidget: (id: HomeWidgetId, dayStartMs?: number) => void;
  readonly modules: React.ReactNode;
  readonly chatReady?: boolean;
  readonly now?: () => number;
  readonly resetSequence?: number;
  readonly onRegisterBack?: (handler: (() => boolean) | undefined) => void;
}

export function PersonalHomeView(props: PersonalHomeViewProps) {
  return (
    <HomeSession
      key={`${props.scopeKey}:${props.resetSequence ?? 0}`}
      {...props}
    />
  );
}

function HomeSession({
  locale,
  scopeKey,
  value,
  hydrated,
  sources,
  thresholds,
  onSave,
  onOpenWidget,
  modules,
  chatReady = false,
  now,
  onRegisterBack,
}: PersonalHomeViewProps) {
  const c = HOME_COPY[locale];
  const rtl = locale === 'he' && s.rtl;
  const reverse = locale === 'he' && s.reverse;
  const [saved, setSaved] = useState(value);
  const [draft, setDraft] = useState<StoredHomePreferences | null>(null);
  const [activeTab, setActiveTab] = useState(value.mode);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [width, setWidth] = useState(0);
  const alive = useRef(true);
  const savingRef = useRef(false);
  const draftRef = useRef(draft);
  const observedValue = useRef(value);
  draftRef.current = draft;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    onRegisterBack?.(() => {
      if (saving) {
        return true;
      }
      if (draft) {
        setDraft(null);
        setSaved(value);
        setStatus('idle');
        return true;
      }
      if (activeTab !== saved.mode) {
        setActiveTab(saved.mode);
        return true;
      }
      return false;
    });
    return () => onRegisterBack?.(undefined);
  }, [activeTab, draft, onRegisterBack, saved.mode, saving, value]);
  useEffect(() => {
    if (observedValue.current === value) {
      return;
    }
    const previousMode = observedValue.current.mode;
    observedValue.current = value;
    if (!draftRef.current) {
      setSaved(value);
      setActiveTab(previous =>
        previous === previousMode ? value.mode : previous,
      );
    }
  }, [value]);
  const preferences = draft ?? saved;
  const showingPersonal = draft !== null || activeTab === 'personal';
  const nowMs = useRefreshingNow({
    active: showingPersonal,
    ...(now ? {now} : {}),
  });
  const enabledWidgetIds = showingPersonal
    ? preferences.widgetOrder.filter(
        id => !preferences.hiddenWidgets.includes(id),
      )
    : [];
  const data = useHomeData({
    sources,
    thresholds,
    enabledWidgetIds,
    scopeKey,
    nowMs,
    refreshSequence,
  });
  const canEdit = hydrated && !!onSave;
  const save = async () => {
    if (!draft || !canEdit || !onSave || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setStatus('idle');
    const next = draft;
    try {
      await onSave(next);
      if (alive.current) {
        setSaved(next);
        setDraft(null);
        setActiveTab(next.mode);
        setStatus('saved');
      }
    } catch {
      if (alive.current) {
        setStatus('error');
      }
    } finally {
      savingRef.current = false;
      if (alive.current) {
        setSaving(false);
      }
    }
  };
  const update = (next: Partial<StoredHomePreferences>) =>
    setDraft(current => (current ? {...current, ...next} : current));
  const choice = (
    label: string,
    selected: boolean,
    onPress: () => void,
    testID: string,
  ) => (
    <Pressable
      key={testID}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{selected, disabled: saving}}
      aria-pressed={selected}
      disabled={saving}
      onPress={onPress}
      style={({pressed}) => [
        s.chip,
        selected && s.chipSelected,
        pressed && s.pressed,
      ]}>
      <Text style={[s.chipLabel, selected && s.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
  const top = (
    <View style={[s.toolbar, reverse]}>
      <View style={[s.tabs, reverse]}>
        {(['personal', 'modules'] as const).map(tab => (
          <Pressable
            key={tab}
            testID={`home-tab-${tab}`}
            disabled={draft !== null}
            accessibilityRole="tab"
            aria-selected={activeTab === tab}
            accessibilityState={{
              selected: activeTab === tab,
              disabled: draft !== null,
            }}
            onPress={() => setActiveTab(tab)}
            style={[s.tab, activeTab === tab && s.activeTab]}>
            <Text style={[s.tabText, activeTab === tab && s.activeTabText]}>
              {tab === 'personal' ? c.personal : c.tools}
            </Text>
          </Pressable>
        ))}
      </View>
      {!draft ? (
        <Pressable
          testID="home-customize"
          accessibilityRole="button"
          disabled={!canEdit}
          accessibilityState={{disabled: !canEdit}}
          onPress={() => {
            setDraft(saved);
            setStatus('idle');
          }}
          style={[s.editButton, !canEdit && s.disabled]}>
          <Text style={s.editText}>✧ {c.edit}</Text>
        </Pressable>
      ) : null}
    </View>
  );
  return (
    <View style={s.root} testID="product-home">
      {top}
      {showingPersonal ? (
        <ProductPage
          locale={locale}
          title={c.title}
          subtitle={c.subtitle}
          testID="personal-home-view"
          onLayout={event => setWidth(event.nativeEvent.layout.width)}
          header={
            <View style={[s.pageHeading, reverse]}>
              <View style={s.flex}>
                <Text accessibilityRole="header" style={[s.pageTitle, rtl]}>
                  {draft ? c.editor : c.title}
                </Text>
                <Text style={[s.subtitle, rtl]}>
                  {draft
                    ? c.description
                    : new Date(nowMs).toLocaleDateString(
                        locale === 'he' ? 'he-IL' : 'en-US',
                        {weekday: 'long', day: 'numeric', month: 'long'},
                      )}
                </Text>
              </View>
              {!draft ? (
                <Pressable
                  testID="home-refresh"
                  accessibilityRole="button"
                  accessibilityLabel={c.refresh}
                  onPress={() => setRefreshSequence(n => n + 1)}
                  style={s.refreshButton}>
                  <Text style={s.editText}>↻ {c.refresh}</Text>
                </Pressable>
              ) : null}
            </View>
          }>
          {draft ? (
            <View style={s.editor} testID="home-editor">
              <View style={[s.actions, reverse]}>
                <Pressable
                  testID="home-save"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: saving || !canEdit,
                    busy: saving,
                  }}
                  aria-busy={saving}
                  disabled={saving || !canEdit}
                  onPress={save}
                  style={[s.saveButton, saving && s.disabled]}>
                  <Text style={s.saveText}>{saving ? c.saving : c.save}</Text>
                </Pressable>
                <Pressable
                  testID="home-cancel"
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => {
                    setDraft(null);
                    setStatus('idle');
                    setSaved(value);
                  }}
                  style={s.textButton}>
                  <Text style={s.editText}>{c.cancel}</Text>
                </Pressable>
                <Pressable
                  testID="home-reset"
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => setDraft(DEFAULT_HOME_PREFERENCES)}
                  style={s.textButton}>
                  <Text style={s.mutedButton}>{c.reset}</Text>
                </Pressable>
              </View>
              {status === 'error' ? (
                <Text
                  accessibilityRole="alert"
                  testID="home-save-error"
                  style={[s.error, rtl]}>
                  {c.saveError}
                </Text>
              ) : null}
              <Text accessibilityRole="header" style={[s.controlTitle, rtl]}>
                {c.widgets}
              </Text>
              <View style={[s.options, reverse]}>
                {HOME_WIDGET_IDS.map(id => (
                  <Pressable
                    key={id}
                    testID={`home-toggle-${id}`}
                    accessibilityRole="checkbox"
                    aria-checked={!draft.hiddenWidgets.includes(id)}
                    accessibilityLabel={c.labels[id]}
                    accessibilityState={{
                      checked: !draft.hiddenWidgets.includes(id),
                      disabled: saving,
                    }}
                    disabled={saving}
                    onPress={() =>
                      update({
                        hiddenWidgets: draft.hiddenWidgets.includes(id)
                          ? draft.hiddenWidgets.filter(hidden => hidden !== id)
                          : [...draft.hiddenWidgets, id],
                      })
                    }
                    style={[
                      s.widgetOption,
                      !draft.hiddenWidgets.includes(id) && s.widgetSelected,
                    ]}>
                    <View style={[s.optionTitle, reverse]}>
                      <Text
                        style={[s.widgetIcon, {color: HOME_WIDGET_COLORS[id]}]}>
                        {HOME_WIDGET_ICONS[id]}
                      </Text>
                      <Text style={[s.optionLabel, rtl]}>{c.labels[id]}</Text>
                      <Text style={s.check}>
                        {draft.hiddenWidgets.includes(id) ? '+' : '✓'}
                      </Text>
                    </View>
                    <Text style={[s.small, rtl]}>{c.hints[id]}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[s.controlTitle, rtl]}>{c.window}</Text>
              <View style={[s.choices, reverse]}>
                {([6, 12, 'full-day'] as const).map(hours =>
                  choice(
                    hours === 6
                      ? c.hours6
                      : hours === 12
                      ? c.hours12
                      : c.fullDay,
                    draft.glucoseWindowHours === hours,
                    () => update({glucoseWindowHours: hours}),
                    `home-window-${hours}`,
                  ),
                )}
              </View>
              <Text style={[s.controlTitle, rtl]}>{c.defaultView}</Text>
              <View style={[s.choices, reverse]}>
                {(['personal', 'modules'] as const).map(mode =>
                  choice(
                    mode === 'personal' ? c.personal : c.tools,
                    draft.mode === mode,
                    () => update({mode}),
                    `home-mode-${mode}`,
                  ),
                )}
              </View>
              {enabledWidgetIds.length > 1 ? (
                <>
                  <Text style={[s.controlTitle, rtl]}>{c.order}</Text>
                  <ReorderList
                    testIDPrefix="home"
                    listAccessibilityLabel={c.order}
                    locale={locale}
                    disabled={saving}
                    items={enabledWidgetIds.map(id => ({
                      id,
                      label: c.labels[id],
                      preview: (
                        <View style={[s.reorderPreview, reverse]}>
                          <Text
                            style={[
                              s.widgetIcon,
                              {color: HOME_WIDGET_COLORS[id]},
                            ]}>
                            {HOME_WIDGET_ICONS[id]}
                          </Text>
                          <Text style={[s.small, rtl]}>{c.hints[id]}</Text>
                        </View>
                      ),
                    }))}
                    onReorder={ids => {
                      // Hidden cards retain their relative order and return after visible cards.
                      update({
                        widgetOrder: [
                          ...(ids as HomeWidgetId[]),
                          ...draft.widgetOrder.filter(id =>
                            draft.hiddenWidgets.includes(id),
                          ),
                        ],
                      });
                    }}
                  />
                </>
              ) : null}
              <Text accessibilityRole="header" style={[s.controlTitle, rtl]}>
                {c.preview}
              </Text>
              <Text style={[s.small, rtl]}>{c.previewHint}</Text>
            </View>
          ) : status === 'saved' ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[s.saved, rtl]}
              testID="home-saved">
              {c.saved}
            </Text>
          ) : null}
          {draft?.mode === 'modules' ? (
            <View style={s.modulePreview} testID="home-modules-preview">
              <Text style={[s.controlTitle, rtl]}>{c.tools}</Text>
              <Text style={[s.small, rtl]}>
                {locale === 'he'
                  ? 'לאחר השמירה ייפתחו כל הכלים. הבית האישי יישאר זמין בלשונית ״הבית שלי״.'
                  : 'All tools will open after saving. Your personal home remains available in the My home tab.'}
              </Text>
            </View>
          ) : null}
          <View style={[s.grid, reverse]} testID="home-widget-grid">
            {enabledWidgetIds.map(id => (
              <View
                key={id}
                style={[s.widgetSlot, width >= 760 && s.wideWidget]}>
                <HomeWidget
                  id={id}
                  locale={locale}
                  nowMs={nowMs}
                  preferences={preferences}
                  thresholds={thresholds}
                  {...data}
                  chatReady={chatReady}
                  onOpen={onOpenWidget}
                  preview={draft !== null}
                />
              </View>
            ))}
          </View>
          {!enabledWidgetIds.length ? (
            <View style={s.empty}>
              <Text style={[s.controlTitle, rtl]}>{c.empty}</Text>
              <Text style={[s.subtitle, rtl]}>{c.emptyHint}</Text>
            </View>
          ) : null}
        </ProductPage>
      ) : (
        <View style={s.flex}>{modules}</View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F5F7FA'},
  flex: {flex: 1, minWidth: 0},
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E4EAF0',
    backgroundColor: '#FFFFFF',
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 3,
    backgroundColor: '#F0F4F8',
  },
  tab: {
    paddingHorizontal: 12,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 13,
  },
  activeTab: {backgroundColor: '#FFFFFF'},
  tabText: {fontSize: 13, color: '#627484'},
  activeTabText: {color: '#18354B', fontWeight: '700'},
  editButton: {minHeight: 44, justifyContent: 'center', paddingHorizontal: 10},
  editText: {color: '#1769AA', fontSize: 13, fontWeight: '700'},
  pageHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: '700',
    color: '#18354B',
  },
  subtitle: {fontSize: 14, lineHeight: 22, color: '#627484', marginTop: 3},
  refreshButton: {minHeight: 44, justifyContent: 'center', padding: 6},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'flex-start',
  },
  widgetSlot: {width: '100%', minWidth: 0},
  wideWidget: {width: '48.5%'},
  editor: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DCE5EC',
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#1769AA',
    borderRadius: 13,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  saveText: {color: '#FFFFFF', fontWeight: '700', fontSize: 14},
  textButton: {paddingHorizontal: 10, minHeight: 44, justifyContent: 'center'},
  mutedButton: {fontSize: 13, color: '#627484'},
  controlTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: '#253B4C',
    marginTop: 6,
  },
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  widgetOption: {
    flexGrow: 1,
    flexBasis: 220,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E7ED',
    gap: 4,
  },
  widgetSelected: {borderColor: '#8FB6D5', backgroundColor: '#F2F7FC'},
  optionTitle: {flexDirection: 'row', alignItems: 'center', gap: 8},
  optionLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: '#253B4C',
    fontWeight: '600',
  },
  widgetIcon: {fontSize: 25},
  check: {fontSize: 18, color: '#1769AA'},
  small: {fontSize: 12, lineHeight: 18, color: '#627484', flexShrink: 1},
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE5EC',
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipSelected: {backgroundColor: '#E7F1FA', borderColor: '#8FB6D5'},
  chipLabel: {fontSize: 13, color: '#627484'},
  chipLabelSelected: {color: '#1769AA', fontWeight: '700'},
  reorderPreview: {flexDirection: 'row', gap: 12, alignItems: 'center'},
  modulePreview: {
    backgroundColor: '#E7F1FA',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  empty: {
    padding: 24,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saved: {color: '#138868', fontSize: 13, marginBottom: 12},
  error: {fontSize: 13, color: '#9F2D27'},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  reverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: 0.7},
  disabled: {opacity: 0.5},
});
