import React, {useMemo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../destinations';
import type {
  AvailableDestinationTarget,
  DestinationLocale,
  DestinationRuntimeContext,
  ResolvedDestinationTarget,
} from '../destinations';
import {DestinationTileGroup, ProductPage, productUiTokens} from '../ui';

const INVESTIGATION_IDS = [
  CORE_DESTINATION_IDS.aiHypoSpecialist,
  CORE_DESTINATION_IDS.aiBehaviorSpecialist,
  CORE_DESTINATION_IDS.aiMealSpecialist,
] as const;

const IMPROVEMENT_IDS = [CORE_DESTINATION_IDS.aiLoopSpecialist] as const;

const COPY = {
  en: {
    title: 'AI analyst',
    subtitle:
      'Start with a simple chat, or choose a focused specialist when you need one.',
    chat: 'Chat about my data',
    chatDescription:
      'Ask in your own words. The assistant may suggest a focused investigation when useful.',
    investigations: 'Investigations',
    improvements: 'Improvements',
    advisory:
      'Suggestions are advisory. The AI does not directly change Loop, Nightscout, or therapy settings.',
    dashboard: 'Open the current AI tools',
  },
  he: {
    title: 'AI Analyst',
    subtitle: 'מתחילים בצ׳אט פשוט, או בוחרים מומחה ממוקד כשבאמת צריך אותו.',
    chat: 'שיחה על הנתונים שלי',
    chatDescription:
      'שואלים במילים שלכם. העוזר יכול להציע חקירה ממוקדת כשזה מתאים.',
    investigations: 'חקירות',
    improvements: 'שיפורים',
    advisory:
      'ההצעות הן לייעוץ בלבד. ה־AI לא משנה ישירות את Loop, את Nightscout או הגדרות טיפול.',
    dashboard: 'פתיחת כלי ה־AI הנוכחיים',
  },
} as const;

export interface AiAnalystLandingViewProps {
  readonly locale: DestinationLocale;
  readonly runtime: DestinationRuntimeContext;
  readonly onOpenDestination: (destination: AvailableDestinationTarget) => void;
  readonly onLaunchCurrent?: (destination: AvailableDestinationTarget) => void;
  readonly onOpenCurrentDashboard?: () => void;
}

const resolved = (
  id: string,
  runtime: DestinationRuntimeContext,
): ResolvedDestinationTarget =>
  resolveDestinationTarget(
    coreDestinationRegistry,
    createStoredDestinationTarget(id),
    undefined,
    runtime,
  );

export const AiAnalystLandingView = ({
  locale,
  runtime,
  onOpenDestination,
  onLaunchCurrent,
  onOpenCurrentDashboard,
}: AiAnalystLandingViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const chat = useMemo(
    () => resolved(CORE_DESTINATION_IDS.aiGeneralChat, runtime),
    [runtime],
  );
  const investigations = useMemo(
    () => INVESTIGATION_IDS.map(id => resolved(id, runtime)),
    [runtime],
  );
  const improvements = useMemo(
    () => IMPROVEMENT_IDS.map(id => resolved(id, runtime)),
    [runtime],
  );
  const open = (destination: AvailableDestinationTarget) => {
    if (onLaunchCurrent) {
      onLaunchCurrent(destination);
      return;
    }
    onOpenDestination(destination);
  };

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="ai-analyst-landing-view"
      title={copy.title}>
      {chat.status === 'available' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => open(chat)}
          style={({pressed}) => [styles.chatCard, pressed && styles.pressed]}
          testID="ai-general-chat">
          <Text style={[styles.chatTitle, rtl && styles.rtlText]}>
            {copy.chat}
          </Text>
          <Text style={[styles.chatDescription, rtl && styles.rtlText]}>
            {copy.chatDescription}
          </Text>
        </Pressable>
      ) : null}

      <DestinationTileGroup
        destinations={investigations}
        locale={locale}
        onOpen={open}
        testIDPrefix="ai-specialist"
        title={copy.investigations}
      />

      <DestinationTileGroup
        destinations={improvements}
        locale={locale}
        onOpen={open}
        testIDPrefix="ai-specialist"
        title={copy.improvements}
      />

      <View style={styles.advisoryCard}>
        <Text style={[styles.advisoryText, rtl && styles.rtlText]}>
          {copy.advisory}
        </Text>
        {onOpenCurrentDashboard ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenCurrentDashboard}
            style={({pressed}) => [
              styles.dashboardButton,
              rtl && styles.alignEnd,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.dashboardButtonLabel}>{copy.dashboard}</Text>
          </Pressable>
        ) : null}
      </View>
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  chatCard: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.featuredCard,
    padding: productUiTokens.spacing.lg,
    marginTop: productUiTokens.spacing.md,
  },
  chatTitle: {
    color: productUiTokens.colors.actionText,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  chatDescription: {
    color: productUiTokens.colors.actionTextMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.xs,
  },
  pressed: {opacity: productUiTokens.opacity.pressed},
  advisoryCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.md,
    marginTop: productUiTokens.spacing.md,
  },
  advisoryText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  dashboardButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    paddingHorizontal: productUiTokens.spacing.lg,
    marginTop: productUiTokens.spacing.sm,
  },
  alignEnd: {alignSelf: 'flex-end'},
  dashboardButtonLabel: {
    color: productUiTokens.colors.actionText,
    fontSize: 14,
    fontWeight: '700',
  },
});
