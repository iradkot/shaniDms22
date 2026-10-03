import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  AlertDeliveryMode,
  AlertRule,
  AlertRuleInput,
  AlertRulesRepository,
} from '../../modules/alerts';
import {
  ALERT_DELIVERY_MODES,
  DEFAULT_ALERT_DELIVERY_MODE,
  formatClockTime,
  inferAlertRuleCondition,
} from '../../modules/alerts';
import type {DestinationLocale} from '../destinations';
import {ProductPage, ProductSection, productUiTokens} from '../ui';
import {AlertRuleForm, createBelow65NightAlertDraft} from './AlertRuleForm';
import type {AlertRuleDraftInterpreter} from './runtime';

const COPY = {
  en: {
    title: 'Glucose alerts',
    subtitle:
      'Create clear rules for the glucose situations that matter to you.',
    explanationTitle: 'No more confusing upper and lower limits',
    explanation:
      'Choose “below”, “above”, or “outside a range”. The app then shows only the values you need.',
    exactExample:
      'For an alert below 65 during the night: below 65 · night 22:00–07:00 · any trend.',
    safetyNote:
      'This alert needs the app to be running and receiving fresh Nightscout data. Delivery is not guaranteed after the app is closed. Keep your CGM safety alerts enabled.',
    useExample: 'Set up below 65 at night',
    manual: 'Set up manually',
    createWithAi: 'Create with AI',
    aiTitle: 'Tell AI what you want',
    aiHelp:
      'AI fills an editable draft. Nothing is saved until you review it and press Save.',
    aiLabel: 'Describe the alert',
    aiPlaceholder: 'For example: Alert me if I go below 65 during the night',
    aiExample: 'Alert me if I go below 65 during the night',
    aiAction: 'Create draft',
    aiBusy: 'Understanding your request…',
    aiError:
      'That request could not be turned into a rule. Add a value and hours, then try again.',
    aiMissing: 'Connect AI in Settings to create a rule from a sentence.',
    aiDisabled: 'AI is turned off. You can enable it in Settings.',
    openSettings: 'Open AI settings',
    cancel: 'Cancel',
    soundTitle: 'Alert sound on this device',
    soundHelp:
      'Choose how glucose alerts get your attention. Phone notification and battery settings can still override this.',
    soundLoading: 'Loading sound preference…',
    soundLoadError: 'The saved sound preference could not be loaded.',
    soundRetry: 'Try again',
    soundModes: {
      'sound-and-vibrate': 'Sound + vibration',
      'vibrate-only': 'Vibration only',
      silent: 'Silent',
    },
    soundError: 'The sound preference could not be saved.',
    rules: 'Your alerts',
    loading: 'Loading alerts…',
    failed: 'Alerts could not be loaded.',
    retry: 'Try again',
    empty: 'No alerts yet. Start with the night example or describe one to AI.',
    enabled: 'On',
    disabled: 'Off',
    enable: 'Turn alert on',
    disable: 'Turn alert off',
    edit: 'Edit',
    remove: 'Delete',
    confirm: 'Delete this alert?',
    confirmDelete: 'Yes, delete',
    cancelDelete: 'Keep it',
    conditions: {
      below: (low: number) => `Glucose below ${low} mg/dL`,
      above: (_low: number, high: number) => `Glucose above ${high} mg/dL`,
      'outside-range': (low: number, high: number) =>
        `Glucose below ${low} or above ${high} mg/dL`,
    },
    allDay: 'All day',
    night: 'Every night · 22:00–07:00',
    customHours: (from: string, to: string) => `Every day · ${from}–${to}`,
    anyTrend: 'Any trend',
    trendLabels: {
      'double-down': 'Falling very fast',
      'single-down': 'Falling',
      'forty-five-down': 'Falling slowly',
      'forty-five-up': 'Rising slowly',
      'single-up': 'Rising',
      'double-up': 'Rising very fast',
    },
    repeat: 'May alert again after 20 min',
    recordedTriggers: 'recorded alerts',
    actionFailed: 'The change could not be saved. Try again.',
  },
  he: {
    title: 'התראות סוכר',
    subtitle: 'יוצרים כללים ברורים למצבי הסוכר שחשובים לך.',
    explanationTitle: 'בלי לנחש מהו גבול עליון או תחתון',
    explanation:
      'בוחרים ״מתחת לערך״, ״מעל לערך״ או ״מחוץ לטווח״. לאחר מכן מוצגים רק הערכים שצריך למלא.',
    exactExample:
      'להתראה מתחת ל־65 בלילה: מתחת ל־65 · לילה 22:00–07:00 · כל מגמה.',
    safetyNote:
      'ההתראה דורשת שהאפליקציה תפעל ותקבל נתון עדכני מ־Nightscout. אחרי סגירת האפליקציה לא ניתן להבטיח שהיא תישלח. חשוב להשאיר את התראות הבטיחות של מערכת ה־CGM פעילות.',
    useExample: 'הגדרת מתחת ל־65 בלילה',
    manual: 'הגדרה ידנית',
    createWithAi: 'יצירה עם AI',
    aiTitle: 'אפשר פשוט לכתוב מה רוצים',
    aiHelp:
      'ה־AI ימלא טיוטה שאפשר לערוך. דבר לא נשמר עד שעוברים עליה ולוחצים על שמירה.',
    aiLabel: 'תיאור ההתראה',
    aiPlaceholder: 'למשל: תתריע לי אם אני יורד מתחת ל־65 במהלך הלילה',
    aiExample: 'תתריע לי אם אני יורד מתחת ל־65 במהלך הלילה',
    aiAction: 'יצירת טיוטה',
    aiBusy: 'מבין את הבקשה…',
    aiError: 'לא הצלחנו להפוך את הבקשה לכלל. כדאי לציין ערך ושעות ולנסות שוב.',
    aiMissing: 'כדי ליצור כלל ממשפט, צריך לחבר AI בהגדרות.',
    aiDisabled: 'ה־AI כבוי. אפשר להפעיל אותו בהגדרות.',
    openSettings: 'פתיחת הגדרות AI',
    cancel: 'ביטול',
    soundTitle: 'צליל ההתראות במכשיר הזה',
    soundHelp:
      'בוחרים איך התראות הסוכר ימשכו תשומת לב. הגדרות ההתראות והסוללה במכשיר עדיין יכולות להשפיע.',
    soundLoading: 'טוען את העדפת הצליל…',
    soundLoadError: 'לא הצלחנו לטעון את העדפת הצליל שנשמרה.',
    soundRetry: 'ניסיון נוסף',
    soundModes: {
      'sound-and-vibrate': 'צליל ורטט',
      'vibrate-only': 'רטט בלבד',
      silent: 'שקט',
    },
    soundError: 'לא הצלחנו לשמור את העדפת הצליל.',
    rules: 'ההתראות שלך',
    loading: 'טוען התראות…',
    failed: 'לא הצלחנו לטעון את ההתראות.',
    retry: 'ניסיון נוסף',
    empty: 'עדיין אין התראות. אפשר להתחיל מדוגמת הלילה או לכתוב בקשה ל־AI.',
    enabled: 'פעילה',
    disabled: 'כבויה',
    enable: 'הפעלת ההתראה',
    disable: 'כיבוי ההתראה',
    edit: 'עריכה',
    remove: 'מחיקה',
    confirm: 'למחוק את ההתראה?',
    confirmDelete: 'כן, למחוק',
    cancelDelete: 'להשאיר',
    conditions: {
      below: (low: number) => `סוכר נמוך מ־${low} mg/dL`,
      above: (_low: number, high: number) => `סוכר גבוה מ־${high} mg/dL`,
      'outside-range': (low: number, high: number) =>
        `סוכר נמוך מ־${low} או גבוה מ־${high} mg/dL`,
    },
    allDay: 'כל היום',
    night: 'בכל לילה · 22:00–07:00',
    customHours: (from: string, to: string) => `בכל יום · ${from}–${to}`,
    anyTrend: 'כל מגמה',
    trendLabels: {
      'double-down': 'ירידה מהירה מאוד',
      'single-down': 'ירידה',
      'forty-five-down': 'ירידה מתונה',
      'forty-five-up': 'עלייה מתונה',
      'single-up': 'עלייה',
      'double-up': 'עלייה מהירה מאוד',
    },
    repeat: 'ניתן להתריע שוב כעבור 20 דקות',
    recordedTriggers: 'התראות שנשמרו',
    actionFailed: 'לא הצלחנו לשמור את השינוי. אפשר לנסות שוב.',
  },
} as const;

type EditorState =
  | {readonly kind: 'closed'}
  | {readonly kind: 'add'; readonly draft?: AlertRuleInput}
  | {readonly kind: 'ai'}
  | {readonly kind: 'edit'; readonly ruleId: string};

export interface AlertRulesViewProps {
  readonly locale: DestinationLocale;
  readonly repository: AlertRulesRepository;
  readonly interpreter?: AlertRuleDraftInterpreter;
  readonly deliveryMode?: AlertDeliveryMode;
  readonly deliveryModeReady?: boolean;
  readonly deliveryModeLoadError?: boolean;
  readonly retryDeliveryMode?: () => void;
  readonly setDeliveryMode?: (mode: AlertDeliveryMode) => Promise<void>;
}

const scheduleText = (locale: DestinationLocale, rule: AlertRule): string => {
  const copy = COPY[locale];
  if (rule.activeFromMinute === 0 && rule.activeToMinute === 1439) {
    return copy.allDay;
  }
  if (rule.activeFromMinute === 22 * 60 && rule.activeToMinute === 7 * 60) {
    return copy.night;
  }
  return copy.customHours(
    formatClockTime(rule.activeFromMinute),
    formatClockTime(rule.activeToMinute),
  );
};

const conditionText = (locale: DestinationLocale, rule: AlertRule): string => {
  const condition = inferAlertRuleCondition(rule);
  return COPY[locale].conditions[condition](
    rule.lowerBoundMgDl,
    rule.upperBoundMgDl,
  );
};

const AiComposer = ({
  locale,
  interpreter,
  onCancel,
  onDraft,
}: {
  readonly locale: DestinationLocale;
  readonly interpreter?: AlertRuleDraftInterpreter;
  readonly onCancel: () => void;
  readonly onDraft: (draft: AlertRuleInput) => void;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [text, setText] = useState<string>(copy.aiExample);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const runRef = useRef(0);

  useEffect(() => {
    runRef.current += 1;
    setBusy(false);
    setFailed(false);
    return () => {
      runRef.current += 1;
    };
  }, [interpreter]);

  const createDraft = async () => {
    if (!interpreter || interpreter.availability !== 'ready' || busy) {
      return;
    }
    const run = runRef.current + 1;
    runRef.current = run;
    setBusy(true);
    setFailed(false);
    try {
      const draft = await interpreter.interpret(text, locale);
      if (runRef.current === run) {
        onDraft(draft);
      }
    } catch {
      if (runRef.current === run) {
        setFailed(true);
      }
    } finally {
      if (runRef.current === run) {
        setBusy(false);
      }
    }
  };

  const unavailableMessage =
    interpreter?.availability === 'disabled' ? copy.aiDisabled : copy.aiMissing;

  return (
    <View style={styles.aiCard} testID="alert-rule-ai-composer">
      <Text style={[styles.cardTitle, rtl && styles.rtlText]}>
        {copy.aiTitle}
      </Text>
      <Text style={[styles.help, rtl && styles.rtlText]}>{copy.aiHelp}</Text>
      {interpreter?.availability === 'ready' ? (
        <>
          <Text style={[styles.label, styles.aiLabel, rtl && styles.rtlText]}>
            {copy.aiLabel}
          </Text>
          <TextInput
            accessibilityLabel={copy.aiLabel}
            editable={!busy}
            maxLength={2000}
            multiline
            onChangeText={setText}
            placeholder={copy.aiPlaceholder}
            style={[styles.aiInput, rtl && styles.rtlText]}
            testID="alert-rule-ai-input"
            textAlignVertical="top"
            value={text}
          />
          {failed ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, rtl && styles.rtlText]}>
              {copy.aiError}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy || text.trim().length === 0}
            onPress={() => {
              createDraft().catch(() => undefined);
            }}
            style={({pressed}) => [
              styles.primaryButton,
              (busy || text.trim().length === 0) && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="alert-rule-ai-create-draft">
            {busy ? (
              <View style={[styles.inline, rtl && styles.rowReverse]}>
                <ActivityIndicator color={productUiTokens.colors.actionText} />
                <Text style={styles.primaryButtonText}>{copy.aiBusy}</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>{copy.aiAction}</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.noticeText, rtl && styles.rtlText]}>
            {unavailableMessage}
          </Text>
          {interpreter?.onOpenSettings ? (
            <Pressable
              accessibilityRole="button"
              onPress={interpreter.onOpenSettings}
              style={({pressed}) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
              testID="alert-rule-ai-settings">
              <Text style={styles.secondaryButtonText}>
                {copy.openSettings}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={({pressed}) => [styles.cancelButton, pressed && styles.pressed]}
        testID="alert-rule-ai-cancel">
        <Text style={styles.cancelText}>{copy.cancel}</Text>
      </Pressable>
    </View>
  );
};

const RuleCard = ({
  locale,
  rule,
  busy,
  confirmingDelete,
  onToggle,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  readonly locale: DestinationLocale;
  readonly rule: AlertRule;
  readonly busy: boolean;
  readonly confirmingDelete: boolean;
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  return (
    <View style={styles.ruleCard} testID={`alert-rule-card-${rule.id}`}>
      <View style={[styles.ruleHeader, rtl && styles.rowReverse]}>
        <View style={styles.titleBlock}>
          <Text style={[styles.ruleTitle, rtl && styles.rtlText]}>
            {rule.name}
          </Text>
          <Text style={[styles.ruleStatus, rtl && styles.rtlText]}>
            {rule.enabled ? copy.enabled : copy.disabled}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={rule.enabled ? copy.disable : copy.enable}
          accessibilityRole="switch"
          accessibilityState={{checked: rule.enabled, disabled: busy}}
          disabled={busy}
          onPress={onToggle}
          style={({pressed}) => [
            styles.switchTrack,
            rule.enabled && styles.switchTrackOn,
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}
          testID={`alert-rule-toggle-${rule.id}`}>
          <View
            style={[styles.switchThumb, rule.enabled && styles.switchThumbOn]}
          />
        </Pressable>
      </View>
      <Text style={[styles.ruleCondition, rtl && styles.rtlText]}>
        {conditionText(locale, rule)}
      </Text>
      <Text style={[styles.ruleFact, rtl && styles.rtlText]}>
        {scheduleText(locale, rule)}
      </Text>
      <Text style={[styles.secondary, rtl && styles.rtlText]}>
        {rule.trend === 'any' ? copy.anyTrend : copy.trendLabels[rule.trend]}
        {' · '}
        {copy.repeat}
      </Text>
      <Text style={[styles.secondary, rtl && styles.rtlText]}>
        {rule.triggeredAtMs.length} {copy.recordedTriggers}
      </Text>
      {confirmingDelete ? (
        <View style={styles.confirmBox}>
          <Text style={[styles.confirmText, rtl && styles.rtlText]}>
            {copy.confirm}
          </Text>
          <View style={[styles.actions, rtl && styles.rowReverse]}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onConfirmDelete}
              style={({pressed}) => [
                styles.dangerButton,
                pressed && styles.pressed,
              ]}
              testID={`alert-rule-confirm-delete-${rule.id}`}>
              <Text style={styles.dangerButtonText}>{copy.confirmDelete}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onCancelDelete}
              style={({pressed}) => [
                styles.textButton,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.textButtonText}>{copy.cancelDelete}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.actions, rtl && styles.rowReverse]}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onEdit}
            style={({pressed}) => [
              styles.textButton,
              pressed && styles.pressed,
            ]}
            testID={`alert-rule-edit-${rule.id}`}>
            <Text style={styles.textButtonText}>{copy.edit}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onDelete}
            style={({pressed}) => [
              styles.textButton,
              pressed && styles.pressed,
            ]}
            testID={`alert-rule-delete-${rule.id}`}>
            <Text style={styles.deleteText}>{copy.remove}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

export const AlertRulesView = ({
  locale,
  repository,
  interpreter,
  deliveryMode = DEFAULT_ALERT_DELIVERY_MODE,
  deliveryModeReady = true,
  deliveryModeLoadError = false,
  retryDeliveryMode,
  setDeliveryMode,
}: AlertRulesViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const snapshot = useSyncExternalStore(
    repository.subscribe,
    repository.getSnapshot,
    repository.getSnapshot,
  );
  const [editor, setEditor] = useState<EditorState>({kind: 'closed'});
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(false);
  const [busyRuleId, setBusyRuleId] = useState<string | undefined>();
  const [deleteRuleId, setDeleteRuleId] = useState<string | undefined>();
  const [actionError, setActionError] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryError, setDeliveryError] = useState(false);
  const deliveryRunRef = useRef(0);
  const availableDeliveryModes =
    Platform.OS === 'ios'
      ? ALERT_DELIVERY_MODES.filter(mode => mode !== 'vibrate-only')
      : ALERT_DELIVERY_MODES;

  const refresh = () => {
    setActionError(false);
    repository.refresh().catch(() => undefined);
  };

  useEffect(() => {
    deliveryRunRef.current += 1;
    setDeliveryBusy(false);
    setDeliveryError(false);
    setEditor({kind: 'closed'});
    setDeleteRuleId(undefined);
    refresh();
    // The repository object is the runtime identity of the active Workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository]);

  const currentEditRule =
    editor.kind === 'edit' && snapshot.status === 'ready'
      ? snapshot.rules.find(rule => rule.id === editor.ruleId)
      : undefined;

  const save = async (input: AlertRuleInput) => {
    if (saveRef.current) {
      return;
    }
    saveRef.current = true;
    setSaving(true);
    setActionError(false);
    try {
      if (editor.kind === 'edit') {
        await repository.update(editor.ruleId, input);
      } else {
        await repository.add(input);
      }
      setEditor({kind: 'closed'});
    } catch {
      setActionError(true);
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  };

  const mutateRule = async (ruleId: string, action: () => Promise<void>) => {
    setBusyRuleId(ruleId);
    setActionError(false);
    try {
      await action();
    } catch {
      setActionError(true);
    } finally {
      setBusyRuleId(undefined);
    }
  };

  const chooseDeliveryMode = async (mode: AlertDeliveryMode) => {
    if (!setDeliveryMode || deliveryBusy || mode === deliveryMode) {
      return;
    }
    const run = deliveryRunRef.current + 1;
    deliveryRunRef.current = run;
    setDeliveryBusy(true);
    setDeliveryError(false);
    try {
      await setDeliveryMode(mode);
    } catch {
      if (deliveryRunRef.current === run) {
        setDeliveryError(true);
      }
    } finally {
      if (deliveryRunRef.current === run) {
        setDeliveryBusy(false);
      }
    }
  };

  return (
    <View
      style={[styles.root, rtl && styles.rtlRoot]}
      testID="alert-rules-view">
      <ProductPage
        locale={locale}
        subtitle={copy.subtitle}
        testID="alert-rules-page"
        title={copy.title}>
        <View style={styles.explanationCard}>
          <Text style={[styles.cardTitle, rtl && styles.rtlText]}>
            {copy.explanationTitle}
          </Text>
          <Text style={[styles.help, rtl && styles.rtlText]}>
            {copy.explanation}
          </Text>
          <Text style={[styles.exampleText, rtl && styles.rtlText]}>
            {copy.exactExample}
          </Text>
          <Text style={[styles.safetyText, rtl && styles.rtlText]}>
            {copy.safetyNote}
          </Text>
          {snapshot.status === 'ready' && editor.kind === 'closed' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setEditor({
                  kind: 'add',
                  draft: createBelow65NightAlertDraft(locale),
                })
              }
              style={({pressed}) => [
                styles.exampleButton,
                pressed && styles.pressed,
              ]}
              testID="alert-rule-preset-low-night">
              <Text style={styles.exampleButtonText}>{copy.useExample}</Text>
            </Pressable>
          ) : null}
        </View>

        {setDeliveryMode ? (
          <View style={styles.soundCard} testID="alert-delivery-settings">
            <Text style={[styles.cardTitle, rtl && styles.rtlText]}>
              {copy.soundTitle}
            </Text>
            <Text style={[styles.help, rtl && styles.rtlText]}>
              {copy.soundHelp}
            </Text>
            {deliveryModeLoadError ? (
              <View>
                <Text
                  accessibilityRole="alert"
                  style={[styles.error, rtl && styles.rtlText]}>
                  {copy.soundLoadError}
                </Text>
                {retryDeliveryMode ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={retryDeliveryMode}
                    style={({pressed}) => [
                      styles.secondaryButton,
                      styles.soundRetry,
                      pressed && styles.pressed,
                    ]}
                    testID="alert-delivery-retry">
                    <Text style={styles.secondaryButtonText}>
                      {copy.soundRetry}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : !deliveryModeReady ? (
              <Text style={[styles.noticeText, rtl && styles.rtlText]}>
                {copy.soundLoading}
              </Text>
            ) : (
              <View
                accessibilityLabel={copy.soundTitle}
                accessibilityRole="radiogroup"
                style={[styles.modeChoices, rtl && styles.rowReverse]}>
                {availableDeliveryModes.map(mode => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{selected: deliveryMode === mode}}
                    disabled={deliveryBusy}
                    key={mode}
                    onPress={() => {
                      chooseDeliveryMode(mode).catch(() => undefined);
                    }}
                    style={({pressed}) => [
                      styles.modeChoice,
                      deliveryMode === mode && styles.modeChoiceSelected,
                      deliveryBusy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID={`alert-delivery-mode-${mode}`}>
                    <Text
                      style={[
                        styles.modeChoiceText,
                        deliveryMode === mode && styles.modeChoiceTextSelected,
                      ]}>
                      {copy.soundModes[mode]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {deliveryError ? (
              <Text
                accessibilityRole="alert"
                style={[styles.error, rtl && styles.rtlText]}>
                {copy.soundError}
              </Text>
            ) : null}
          </View>
        ) : null}

        {snapshot.status === 'loading' ? (
          <View style={styles.stateCard} testID="alert-rules-loading">
            <ActivityIndicator color={productUiTokens.colors.action} />
            <Text style={[styles.stateText, rtl && styles.rtlText]}>
              {copy.loading}
            </Text>
          </View>
        ) : snapshot.status === 'error' ? (
          <View style={styles.stateCard} testID="alert-rules-error">
            <Text style={[styles.error, rtl && styles.rtlText]}>
              {copy.failed}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              style={({pressed}) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
              testID="alert-rules-retry">
              <Text style={styles.primaryButtonText}>{copy.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {editor.kind === 'closed' ? (
              <View style={[styles.createActions, rtl && styles.rowReverse]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setEditor({kind: 'ai'})}
                  style={({pressed}) => [
                    styles.primaryButton,
                    pressed && styles.pressed,
                  ]}
                  testID="alert-rule-add-ai">
                  <Text style={styles.primaryButtonText}>
                    {copy.createWithAi}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setEditor({kind: 'add'})}
                  style={({pressed}) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                  testID="alert-rule-add">
                  <Text style={styles.secondaryButtonText}>{copy.manual}</Text>
                </Pressable>
              </View>
            ) : editor.kind === 'ai' ? (
              <AiComposer
                {...(interpreter === undefined ? {} : {interpreter})}
                locale={locale}
                onCancel={() => setEditor({kind: 'closed'})}
                onDraft={draft => setEditor({kind: 'add', draft})}
              />
            ) : (
              <AlertRuleForm
                key={
                  editor.kind === 'edit'
                    ? `edit-${editor.ruleId}`
                    : `add-${editor.draft?.name ?? 'manual'}`
                }
                locale={locale}
                {...(currentEditRule ? {initialRule: currentEditRule} : {})}
                {...(editor.kind === 'add' && editor.draft
                  ? {initialDraft: editor.draft}
                  : {})}
                onCancel={() => setEditor({kind: 'closed'})}
                onSubmit={save}
                saving={saving}
              />
            )}
            {actionError ? (
              <Text
                accessibilityRole="alert"
                style={[
                  styles.error,
                  styles.actionError,
                  rtl && styles.rtlText,
                ]}>
                {copy.actionFailed}
              </Text>
            ) : null}
            <ProductSection locale={locale} title={copy.rules}>
              {snapshot.rules.length === 0 ? (
                <View style={styles.stateCard} testID="alert-rules-empty">
                  <Text style={[styles.stateText, rtl && styles.rtlText]}>
                    {copy.empty}
                  </Text>
                </View>
              ) : (
                snapshot.rules.map(rule => (
                  <RuleCard
                    busy={busyRuleId === rule.id}
                    confirmingDelete={deleteRuleId === rule.id}
                    key={rule.id}
                    locale={locale}
                    onCancelDelete={() => setDeleteRuleId(undefined)}
                    onConfirmDelete={() => {
                      mutateRule(rule.id, async () => {
                        await repository.delete(rule.id);
                        setDeleteRuleId(undefined);
                      }).catch(() => undefined);
                    }}
                    onDelete={() => setDeleteRuleId(rule.id)}
                    onEdit={() => setEditor({kind: 'edit', ruleId: rule.id})}
                    onToggle={() => {
                      mutateRule(rule.id, () =>
                        repository.setEnabled(rule.id, !rule.enabled),
                      ).catch(() => undefined);
                    }}
                    rule={rule}
                  />
                ))
              )}
            </ProductSection>
          </>
        )}
      </ProductPage>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  rtlRoot: {direction: 'rtl'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  inline: {alignItems: 'center', flexDirection: 'row', gap: 8},
  pressed: {opacity: productUiTokens.opacity.pressed},
  disabled: {opacity: productUiTokens.opacity.disabled},
  explanationCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderColor: '#BFDBFE',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.lg,
  },
  soundCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  aiCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: '#93C5FD',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 2,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.lg,
  },
  cardTitle: {
    color: productUiTokens.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  help: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  exampleText: {
    color: '#134E77',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 10,
  },
  safetyText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  exampleButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 8,
  },
  exampleButtonText: {color: productUiTokens.colors.action, fontWeight: '800'},
  modeChoices: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 12},
  modeChoice: {
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 8,
    marginEnd: 8,
    minHeight: 42,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  modeChoiceSelected: {
    backgroundColor: productUiTokens.colors.action,
    borderColor: productUiTokens.colors.action,
  },
  modeChoiceText: {
    color: productUiTokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  modeChoiceTextSelected: {color: productUiTokens.colors.actionText},
  soundRetry: {marginTop: productUiTokens.spacing.sm},
  createActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: productUiTokens.spacing.xl,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  primaryButtonText: {
    color: productUiTokens.colors.actionText,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  secondaryButtonText: {
    color: productUiTokens.colors.action,
    fontWeight: '800',
  },
  cancelButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 8,
  },
  cancelText: {color: productUiTokens.colors.action, fontWeight: '700'},
  label: {color: productUiTokens.colors.text, fontSize: 14, fontWeight: '700'},
  aiLabel: {marginTop: productUiTokens.spacing.lg},
  aiInput: {
    borderColor: productUiTokens.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: productUiTokens.colors.text,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6,
    minHeight: 112,
    padding: productUiTokens.spacing.md,
  },
  noticeText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.xl,
  },
  stateText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  error: {
    color: productUiTokens.colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
  },
  actionError: {marginTop: productUiTokens.spacing.md},
  ruleCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginBottom: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  ruleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleBlock: {flex: 1, marginEnd: productUiTokens.spacing.md},
  ruleTitle: {
    color: productUiTokens.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  ruleStatus: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  switchTrack: {
    backgroundColor: '#CBD5E1',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    padding: 3,
    width: 54,
  },
  switchTrackOn: {backgroundColor: '#16A34A'},
  switchThumb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    height: 26,
    width: 26,
  },
  switchThumbOn: {alignSelf: 'flex-end'},
  ruleCondition: {
    color: productUiTokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 12,
  },
  ruleFact: {
    color: productUiTokens.colors.text,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  secondary: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  actions: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8},
  textButton: {
    justifyContent: 'center',
    marginEnd: productUiTokens.spacing.lg,
    minHeight: 44,
  },
  textButtonText: {color: productUiTokens.colors.action, fontWeight: '700'},
  deleteText: {color: productUiTokens.colors.danger, fontWeight: '700'},
  confirmBox: {
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    marginTop: 12,
    padding: 12,
  },
  confirmText: {color: '#881337', fontWeight: '700'},
  dangerButton: {
    backgroundColor: productUiTokens.colors.danger,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginEnd: 12,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  dangerButtonText: {color: '#FFFFFF', fontWeight: '700'},
});
