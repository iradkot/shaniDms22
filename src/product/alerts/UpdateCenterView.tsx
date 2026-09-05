import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  UpdateCenterItem,
  UpdateCenterRepository,
  UpdateDeepLinkDescriptor,
} from '../../modules/alerts';
import {isUpdateDeepLinkDescriptor} from '../../modules/alerts';
import type {DestinationLocale} from '../destinations';
import {ProductPage, ProductSection, productUiTokens} from '../ui';

const COPY = {
  en: {
    title: 'Update center',
    subtitle:
      'Recent app alerts, reminders, and generated updates, available from local storage.',
    recent: 'Recent updates',
    loading: 'Loading updates…',
    failed: 'Updates could not be loaded.',
    retry: 'Try again',
    empty: 'There are no updates or reminders yet.',
    read: 'Read',
    unread: 'Unread',
    unknown: 'Read status unavailable',
    markRead: 'Mark as read',
    open: 'Open details',
    alert: 'Alert',
    reminder: 'Reminder',
    generated: 'Update',
    triggerFact:
      'The rule was recorded as triggered. Its glucose value and original notification text were not retained.',
    occurrence: (value: number, low: number, high: number) =>
      `Observed ${value} mg/dL outside the configured ${low}–${high} mg/dL range.`,
    actionFailed: 'The read status could not be saved.',
  },
  he: {
    title: 'מרכז עדכונים',
    subtitle: 'התראות, תזכורות ועדכונים אחרונים מהאחסון המקומי.',
    recent: 'עדכונים אחרונים',
    loading: 'טוען עדכונים…',
    failed: 'לא הצלחנו לטעון את העדכונים.',
    retry: 'ניסיון נוסף',
    empty: 'אין עדיין עדכונים או תזכורות.',
    read: 'נקרא',
    unread: 'לא נקרא',
    unknown: 'סטטוס הקריאה אינו זמין',
    markRead: 'סימון כנקרא',
    open: 'פתיחת פרטים',
    alert: 'התראה',
    reminder: 'תזכורת',
    generated: 'עדכון',
    triggerFact:
      'נשמר רק שהכלל הופעל. ערך הסוכר ותוכן ההתראה המקורי לא נשמרו.',
    occurrence: (value: number, low: number, high: number) =>
      `נמדד ${value} mg/dL מחוץ לטווח שהוגדר, ${low}–${high} mg/dL.`,
    actionFailed: 'לא הצלחנו לשמור את סטטוס הקריאה.',
  },
} as const;

const defaultTimestampFormatter = (
  locale: DestinationLocale,
  timestampMs: number,
): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));

export interface UpdateCenterViewProps {
  readonly locale: DestinationLocale;
  readonly repository: UpdateCenterRepository;
  readonly onOpenDeepLink?: (descriptor: UpdateDeepLinkDescriptor) => void;
  readonly formatTimestamp?: (timestampMs: number) => string;
  readonly focusedOccurrenceId?: string;
}

const itemText = (
  item: UpdateCenterItem,
  locale: DestinationLocale,
): {readonly title: string; readonly body?: string} => {
  if (item.content.kind === 'alert-rule-trigger') {
    return {title: item.content.ruleName, body: COPY[locale].triggerFact};
  }
  if (item.content.kind === 'alert-rule-occurrence') {
    return {
      title: item.content.rule.name,
      body: COPY[locale].occurrence(
        item.content.observation.valueMgDl,
        item.content.rule.lowerBoundMgDl,
        item.content.rule.upperBoundMgDl,
      ),
    };
  }
  return item.content.body === undefined
    ? {title: item.content.title}
    : {title: item.content.title, body: item.content.body};
};

export const UpdateCenterView = ({
  locale,
  repository,
  onOpenDeepLink,
  formatTimestamp,
  focusedOccurrenceId,
}: UpdateCenterViewProps) => {
  const rtl = locale === 'he';
  const copy = COPY[locale];
  const snapshot = useSyncExternalStore(
    repository.subscribe,
    repository.getSnapshot,
    repository.getSnapshot,
  );
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

  const markRead = (itemId: string) => {
    setActionError(false);
    repository.markRead(itemId).catch(() => setActionError(true));
  };

  const formatter =
    formatTimestamp ??
    ((timestampMs: number) => defaultTimestampFormatter(locale, timestampMs));

  return (
    <View
      style={[styles.root, rtl && styles.rtlRoot]}
      testID="update-center-view">
      <ProductPage
        locale={locale}
        subtitle={copy.subtitle}
        testID="update-center-page"
        title={copy.title}>
        {snapshot.status === 'loading' ? (
          <View style={styles.stateCard} testID="update-center-loading">
            <ActivityIndicator color={productUiTokens.colors.action} />
            <Text style={[styles.stateText, rtl && styles.rtlText]}>
              {copy.loading}
            </Text>
          </View>
        ) : snapshot.status === 'error' ? (
          <View style={styles.stateCard} testID="update-center-error">
            <Text style={[styles.errorText, rtl && styles.rtlText]}>
              {copy.failed}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              style={({pressed}) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
              testID="update-center-retry">
              <Text style={styles.primaryButtonText}>{copy.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <ProductSection locale={locale} title={copy.recent}>
            {actionError ? (
              <Text
                accessibilityRole="alert"
                style={[styles.errorText, rtl && styles.rtlText]}>
                {copy.actionFailed}
              </Text>
            ) : null}
            {snapshot.items.length === 0 ? (
              <View style={styles.stateCard} testID="update-center-empty">
                <Text style={[styles.stateText, rtl && styles.rtlText]}>
                  {copy.empty}
                </Text>
              </View>
            ) : (
              snapshot.items.map(item => {
                const text = itemText(item, locale);
                const typeLabel =
                  item.kind === 'alert'
                    ? copy.alert
                    : item.kind === 'reminder'
                    ? copy.reminder
                    : copy.generated;
                const readLabel =
                  item.readState === 'read'
                    ? copy.read
                    : item.readState === 'unread'
                    ? copy.unread
                    : copy.unknown;
                const canOpen =
                  item.deepLink !== undefined &&
                  isUpdateDeepLinkDescriptor(item.deepLink) &&
                  onOpenDeepLink !== undefined;

                return (
                  <View
                    accessibilityState={{
                      selected: item.id === focusedOccurrenceId,
                    }}
                    key={item.id}
                    style={[
                      styles.itemCard,
                      item.readState === 'unread' && styles.unreadCard,
                      item.id === focusedOccurrenceId && styles.focusedCard,
                    ]}
                    testID={`update-item-${item.id}`}>
                    <View style={[styles.badgeRow, rtl && styles.rowReverse]}>
                      <Text style={styles.kindBadge}>{typeLabel}</Text>
                      <Text
                        style={[
                          styles.readBadge,
                          item.readState === 'unread' && styles.unreadBadge,
                        ]}>
                        {readLabel}
                      </Text>
                    </View>
                    <Text style={[styles.itemTitle, rtl && styles.rtlText]}>
                      {text.title}
                    </Text>
                    {text.body ? (
                      <Text style={[styles.itemBody, rtl && styles.rtlText]}>
                        {text.body}
                      </Text>
                    ) : null}
                    <Text style={[styles.timestamp, rtl && styles.rtlText]}>
                      {formatter(item.occurredAtMs)}
                    </Text>
                    <View style={[styles.actions, rtl && styles.rowReverse]}>
                      {item.readState !== 'read' ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => markRead(item.id)}
                          style={({pressed}) => [
                            styles.textButton,
                            pressed && styles.pressed,
                          ]}
                          testID={`update-mark-read-${item.id}`}>
                          <Text style={styles.textButtonText}>
                            {copy.markRead}
                          </Text>
                        </Pressable>
                      ) : null}
                      {canOpen ? (
                        <Pressable
                          accessibilityRole="link"
                          onPress={() => {
                            markRead(item.id);
                            onOpenDeepLink(item.deepLink!);
                          }}
                          style={({pressed}) => [
                            styles.textButton,
                            pressed && styles.pressed,
                          ]}
                          testID={`update-open-${item.id}`}>
                          <Text style={styles.textButtonText}>{copy.open}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ProductSection>
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
  errorText: {
    color: productUiTokens.colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    marginTop: productUiTokens.spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  primaryButtonText: {
    color: productUiTokens.colors.actionText,
    fontWeight: '700',
  },
  itemCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginBottom: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  unreadCard: {borderColor: '#60A5FA', borderWidth: 2},
  focusedCard: {
    borderColor: productUiTokens.colors.action,
    borderWidth: 2,
  },
  badgeRow: {flexDirection: 'row', flexWrap: 'wrap'},
  kindBadge: {
    backgroundColor: '#E0F2FE',
    borderRadius: productUiTokens.radii.pill,
    color: '#075985',
    fontSize: 12,
    fontWeight: '700',
    marginEnd: productUiTokens.spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  readBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: productUiTokens.radii.pill,
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unreadBadge: {backgroundColor: '#DBEAFE', color: '#1D4ED8'},
  itemTitle: {
    color: productUiTokens.colors.text,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginTop: productUiTokens.spacing.md,
  },
  itemBody: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: productUiTokens.spacing.xs,
  },
  timestamp: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginTop: productUiTokens.spacing.sm,
  },
  actions: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8},
  textButton: {
    justifyContent: 'center',
    marginEnd: productUiTokens.spacing.lg,
    minHeight: 44,
  },
  textButtonText: {color: productUiTokens.colors.action, fontWeight: '700'},
});
