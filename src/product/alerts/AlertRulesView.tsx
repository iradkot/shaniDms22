import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  AlertRule,
  AlertRuleInput,
  AlertRulesRepository,
} from '../../modules/alerts';
import {formatClockTime} from '../../modules/alerts';
import type {DestinationLocale} from '../destinations';
import {ProductPage, ProductSection, productUiTokens} from '../ui';
import {AlertRuleForm} from './AlertRuleForm';

const COPY = {
  en: {
    title: 'Alert rules',
    subtitle:
      'Choose which local glucose alerts you want and when they are active.',
    rules: 'Your rules',
    add: 'Add rule',
    loading: 'Loading alert rules…',
    failed: 'Alert rules could not be loaded.',
    retry: 'Try again',
    empty: 'No alert rules yet.',
    enabled: 'Enabled',
    disabled: 'Disabled',
    enable: 'Enable rule',
    disable: 'Disable rule',
    edit: 'Edit',
    remove: 'Delete',
    confirm: 'Delete this rule?',
    confirmDelete: 'Yes, delete',
    cancelDelete: 'Keep rule',
    anyTrend: 'Any trend',
    trendLabels: {
      'double-down': 'Falling very fast',
      'single-down': 'Falling',
      'forty-five-down': 'Falling slowly',
      'forty-five-up': 'Rising slowly',
      'single-up': 'Rising',
      'double-up': 'Rising very fast',
    },
    rangeOr: 'or',
    recordedTriggers: 'recorded triggers',
    actionFailed: 'The change could not be saved. Try again.',
  },
  he: {
    title: 'כללי התראות',
    subtitle: 'בחירת התראות הסוכר המקומיות והזמנים שבהם הן פעילות.',
    rules: 'הכללים שלך',
    add: 'הוספת כלל',
    loading: 'טוען כללי התראות…',
    failed: 'לא הצלחנו לטעון את כללי ההתראות.',
    retry: 'ניסיון נוסף',
    empty: 'עדיין אין כללי התראה.',
    enabled: 'פעיל',
    disabled: 'כבוי',
    enable: 'הפעלת הכלל',
    disable: 'כיבוי הכלל',
    edit: 'עריכה',
    remove: 'מחיקה',
    confirm: 'למחוק את הכלל?',
    confirmDelete: 'כן, למחוק',
    cancelDelete: 'להשאיר',
    anyTrend: 'כל מגמה',
    trendLabels: {
      'double-down': 'ירידה מהירה מאוד',
      'single-down': 'ירידה',
      'forty-five-down': 'ירידה מתונה',
      'forty-five-up': 'עלייה מתונה',
      'single-up': 'עלייה',
      'double-up': 'עלייה מהירה מאוד',
    },
    rangeOr: 'או',
    recordedTriggers: 'הפעלות שנשמרו',
    actionFailed: 'לא הצלחנו לשמור את השינוי. אפשר לנסות שוב.',
  },
} as const;

type EditorState =
  | {readonly kind: 'closed'}
  | {readonly kind: 'add'}
  | {readonly kind: 'edit'; readonly ruleId: string};

export interface AlertRulesViewProps {
  readonly locale: DestinationLocale;
  readonly repository: AlertRulesRepository;
}

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
            style={[
              styles.switchThumb,
              rule.enabled && styles.switchThumbOn,
            ]}
          />
        </Pressable>
      </View>
      <Text style={[styles.ruleFact, rtl && styles.rtlText]}>
        {`< ${rule.lowerBoundMgDl} ${copy.rangeOr} > ${rule.upperBoundMgDl} mg/dL`}
      </Text>
      <Text style={[styles.ruleFact, rtl && styles.rtlText]}>
        {`${formatClockTime(rule.activeFromMinute)}–${formatClockTime(
          rule.activeToMinute,
        )}`}
      </Text>
      <Text style={[styles.secondary, rtl && styles.rtlText]}>
        {rule.trend === 'any' ? copy.anyTrend : copy.trendLabels[rule.trend]} ·{' '}
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

export const AlertRulesView = ({locale, repository}: AlertRulesViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const snapshot = useSyncExternalStore(
    repository.subscribe,
    repository.getSnapshot,
    repository.getSnapshot,
  );
  const [editor, setEditor] = useState<EditorState>({kind: 'closed'});
  const [saving, setSaving] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | undefined>();
  const [deleteRuleId, setDeleteRuleId] = useState<string | undefined>();
  const [actionError, setActionError] = useState(false);

  const refresh = () => {
    setActionError(false);
    repository.refresh().catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    // The repository object is the runtime identity of the active Workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository]);

  const currentEditRule =
    editor.kind === 'edit' && snapshot.status === 'ready'
      ? snapshot.rules.find(rule => rule.id === editor.ruleId)
      : undefined;

  const save = async (input: AlertRuleInput) => {
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

  return (
    <View
      style={[styles.root, rtl && styles.rtlRoot]}
      testID="alert-rules-view">
      <ProductPage
        locale={locale}
        subtitle={copy.subtitle}
        testID="alert-rules-page"
        title={copy.title}>
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
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditor({kind: 'add'})}
                style={({pressed}) => [
                  styles.primaryButton,
                  styles.addButton,
                  pressed && styles.pressed,
                ]}
                testID="alert-rule-add">
                <Text style={styles.primaryButtonText}>{copy.add}</Text>
              </Pressable>
            ) : (
              <AlertRuleForm
                key={
                  editor.kind === 'edit' ? `edit-${editor.ruleId}` : 'add-rule'
                }
                locale={locale}
                {...(currentEditRule ? {initialRule: currentEditRule} : {})}
                onCancel={() => setEditor({kind: 'closed'})}
                onSubmit={save}
                saving={saving}
              />
            )}
            {actionError ? (
              <Text
                accessibilityRole="alert"
                style={[styles.error, styles.actionError, rtl && styles.rtlText]}>
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
  pressed: {opacity: productUiTokens.opacity.pressed},
  disabled: {opacity: productUiTokens.opacity.disabled},
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
    marginTop: productUiTokens.spacing.sm,
  },
  error: {
    color: productUiTokens.colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  actionError: {marginTop: productUiTokens.spacing.md},
  primaryButton: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginTop: productUiTokens.spacing.md,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  addButton: {alignSelf: 'flex-start', marginTop: productUiTokens.spacing.xl},
  primaryButtonText: {
    color: productUiTokens.colors.actionText,
    fontWeight: '700',
  },
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
  ruleFact: {
    color: productUiTokens.colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: productUiTokens.spacing.sm,
  },
  secondary: {
    color: productUiTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
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
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.md,
  },
  confirmText: {color: '#881337', fontWeight: '700'},
  dangerButton: {
    backgroundColor: productUiTokens.colors.danger,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginEnd: productUiTokens.spacing.md,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  dangerButtonText: {color: '#FFFFFF', fontWeight: '700'},
});
