import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {ResolvedDestinationTarget} from '../destinations';
import {ResponsiveGrid, useProductGridColumnCount} from '../ui';
import {
  CurrentSnapshotViewModel,
  HubItem,
  HubModuleGroup,
  HubViewModel,
  OperationalBadgeTone,
} from './types';
import {resolveHubGroupVisual, resolveHubItemVisual} from './visuals';

export interface HubPalette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly text: string;
  readonly secondaryText: string;
  readonly border: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly attention: string;
  readonly attentionSoft: string;
  readonly warning: string;
  readonly warningSoft: string;
}

const DEFAULT_PALETTE: HubPalette = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F3F7',
  text: '#17202A',
  secondaryText: '#5C6875',
  border: '#DCE2E8',
  accent: '#1769AA',
  accentSoft: '#E7F1FA',
  attention: '#8A4B00',
  attentionSoft: '#FFF1D6',
  warning: '#9F2D27',
  warningSoft: '#FCE9E7',
};

const COPY = {
  en: {
    hub: 'Hub',
    customize: 'Customize',
    snapshot: 'Current snapshot',
    favorites: 'Favorites',
    recents: 'Recent',
    allModules: 'All modules',
    showAll: 'Show all',
    showLess: 'Show less',
    noFavorites: 'Pin the destinations you want to reach fastest.',
    noRecents: 'Modules you open will appear here.',
    unavailable: 'Unavailable',
    stale: 'Stale data',
    offline: 'Offline',
    noData: 'No current data',
    loading: 'Loading current data',
    open: 'Open',
    customizeHint: 'Long press to customize Modules.',
  },
  he: {
    hub: 'המרכז שלי',
    customize: 'התאמה אישית',
    snapshot: 'תמונת מצב נוכחית',
    favorites: 'מועדפים',
    recents: 'אחרונים',
    allModules: 'כל המודולים',
    showAll: 'הצגת הכול',
    showLess: 'הצגת פחות',
    noFavorites: 'אפשר להצמיד לכאן את היעדים שחשוב להגיע אליהם מהר.',
    noRecents: 'מודולים שייפתחו יופיעו כאן.',
    unavailable: 'לא זמין',
    stale: 'מידע לא עדכני',
    offline: 'אין חיבור',
    noData: 'אין מידע נוכחי',
    loading: 'המידע הנוכחי נטען',
    open: 'פתיחה',
    customizeHint: 'לחיצה ארוכה פותחת את התאמת המודולים.',
  },
} as const;

type HubCopy = {
  readonly [Key in keyof (typeof COPY)['en']]: string;
};

interface HubViewProps {
  readonly model: HubViewModel;
  readonly currentSnapshot?: CurrentSnapshotViewModel;
  readonly showRecents?: boolean;
  readonly title?: string;
  readonly palette?: Partial<HubPalette>;
  readonly onOpenDestination: (
    destination: Extract<ResolvedDestinationTarget, {status: 'available'}>,
  ) => void;
  readonly onUnavailableDestination?: (
    destination: Extract<ResolvedDestinationTarget, {status: 'unavailable'}>,
  ) => void;
  readonly onCustomize?: (initialStage?: 'quick-access') => void;
}

type HubStyles = ReturnType<typeof createStyles>;

const directionalText = (rtl: boolean): TextStyle => ({
  textAlign: rtl ? 'right' : 'left',
  writingDirection: rtl ? 'rtl' : 'ltr',
});

const directionalRow = (rtl: boolean): ViewStyle => ({
  flexDirection: rtl ? 'row-reverse' : 'row',
});

const badgeStyle = (
  tone: OperationalBadgeTone | undefined,
  styles: HubStyles,
) => {
  if (tone === 'warning') {
    return [styles.badge, styles.badgeWarning];
  }
  if (tone === 'attention') {
    return [styles.badge, styles.badgeAttention];
  }
  return [styles.badge, styles.badgeNeutral];
};

const ModuleTile = ({
  item,
  rtl,
  styles,
  unavailableLabel,
  tileTestID,
  onOpen,
  onUnavailable,
  onCustomize,
  customizeHint,
}: {
  readonly item: HubItem;
  readonly rtl: boolean;
  readonly styles: HubStyles;
  readonly unavailableLabel: string;
  readonly tileTestID: string;
  readonly onOpen: HubViewProps['onOpenDestination'];
  readonly onUnavailable?: HubViewProps['onUnavailableDestination'];
  readonly onCustomize?: HubViewProps['onCustomize'];
  readonly customizeHint: string;
}) => {
  const unavailable = item.resolved.status === 'unavailable';
  const canPress = !unavailable || !!onUnavailable;
  const visual = resolveHubItemVisual(item);
  const onPress = () => {
    if (item.resolved.status === 'available') {
      onOpen(item.resolved);
    } else {
      onUnavailable?.(item.resolved);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: !canPress}}
      accessibilityLabel={`${item.title}. ${item.description}`}
      {...(onCustomize === undefined ? {} : {accessibilityHint: customizeHint})}
      disabled={!canPress}
      delayLongPress={400}
      hitSlop={6}
      {...(onCustomize === undefined
        ? {}
        : {onLongPress: () => onCustomize('quick-access')})}
      onPress={onPress}
      style={({pressed}) => [
        styles.tile,
        {
          backgroundColor: visual.surface,
          borderColor: visual.border,
          shadowColor: visual.accent,
        },
        unavailable && styles.tileUnavailable,
        pressed && canPress && styles.pressed,
      ]}
      testID={tileTestID}>
      <View
        accessibilityElementsHidden
        accessible={false}
        pointerEvents="none"
        style={[styles.tileAccent, {backgroundColor: visual.accent}]}
        testID={`${tileTestID}-accent`}
      />

      <View style={[styles.tileHeader, directionalRow(rtl)]}>
        <View
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.tileIcon, {backgroundColor: visual.iconBackground}]}
          testID={`${tileTestID}-icon`}>
          <MaterialIcons
            color={visual.accent}
            name={visual.iconName}
            size={22}
            testID={`${tileTestID}-icon-glyph`}
          />
        </View>
        <Text
          numberOfLines={2}
          style={[styles.tileTitle, directionalText(rtl)]}>
          {item.title}
        </Text>
        <MaterialIcons
          accessibilityElementsHidden
          color={visual.accent}
          importantForAccessibility="no-hide-descendants"
          name={rtl ? 'chevron-left' : 'chevron-right'}
          size={23}
          style={styles.chevron}
        />
      </View>

      <Text
        numberOfLines={2}
        style={[styles.tileDescription, directionalText(rtl)]}>
        {item.description}
      </Text>

      {unavailable ? (
        <View
          style={[styles.badge, styles.badgeWarning, rtl && styles.alignEnd]}>
          <Text style={[styles.badgeText, styles.badgeWarningText]}>
            {unavailableLabel}
          </Text>
        </View>
      ) : item.operationalBadge ? (
        <View
          style={[
            badgeStyle(item.operationalBadge.tone, styles),
            rtl && styles.alignEnd,
          ]}>
          <Text style={styles.badgeText}>{item.operationalBadge.label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
};

const TileGrid = ({
  items,
  locale,
  testID,
  rtl,
  styles,
  unavailableLabel,
  onOpen,
  onUnavailable,
  onCustomize,
  customizeHint,
}: {
  readonly items: readonly HubItem[];
  readonly locale: HubViewModel['locale'];
  readonly testID: string;
  readonly rtl: boolean;
  readonly styles: HubStyles;
  readonly unavailableLabel: string;
  readonly onOpen: HubViewProps['onOpenDestination'];
  readonly onUnavailable?: HubViewProps['onUnavailableDestination'];
  readonly onCustomize?: HubViewProps['onCustomize'];
  readonly customizeHint: string;
}) => {
  return (
    <ResponsiveGrid locale={locale} testID={testID}>
      {items.map(item => (
        <ModuleTile
          item={item}
          key={item.key}
          onOpen={onOpen}
          onCustomize={onCustomize}
          onUnavailable={onUnavailable}
          rtl={rtl}
          styles={styles}
          tileTestID={`${testID}-tile-${item.key}`}
          unavailableLabel={unavailableLabel}
          customizeHint={customizeHint}
        />
      ))}
    </ResponsiveGrid>
  );
};

const SectionTitle = ({
  children,
  rtl,
  styles,
  testID,
}: {
  readonly children: React.ReactNode;
  readonly rtl: boolean;
  readonly styles: HubStyles;
  readonly testID?: string;
}) => (
  <Text
    accessibilityRole="header"
    style={[styles.sectionTitle, directionalText(rtl)]}
    testID={testID}>
    {children}
  </Text>
);

const CategoryCard = ({
  count,
  group,
  onPress,
  rtl,
  selected,
  styles,
  testID,
  title,
}: {
  readonly count: number;
  readonly group: HubModuleGroup['id'];
  readonly onPress: () => void;
  readonly rtl: boolean;
  readonly selected: boolean;
  readonly styles: HubStyles;
  readonly testID: string;
  readonly title: string;
}) => {
  const visual = resolveHubGroupVisual(group);
  return (
    <Pressable
      accessibilityLabel={`${title}: ${count}`}
      accessibilityRole="tab"
      accessibilityState={{selected}}
      hitSlop={4}
      onPress={onPress}
      style={({pressed}) => [
        styles.categoryCard,
        directionalRow(rtl),
        {
          backgroundColor: selected ? visual.iconBackground : styles.surface.backgroundColor,
          borderColor: selected ? visual.accent : visual.border,
          shadowColor: visual.accent,
        },
        selected && styles.categoryCardSelected,
        pressed && styles.pressed,
      ]}
      testID={testID}>
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.categoryIcon, {backgroundColor: visual.iconBackground}]}>
        <MaterialIcons color={visual.accent} name={visual.iconName} size={21} />
      </View>
      <Text
        numberOfLines={2}
        style={[styles.groupTitle, directionalText(rtl)]}>
        {title}
      </Text>
      <View
        accessibilityElementsHidden
        accessible={false}
        style={[styles.categoryCount, {backgroundColor: visual.iconBackground}]}
        testID={`${testID}-count`}>
        <Text style={[styles.categoryCountText, {color: visual.accent}]}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
};

const CurrentSnapshot = ({
  value,
  rtl,
  styles,
  copy,
  onOpen,
  onUnavailable,
}: {
  readonly value: CurrentSnapshotViewModel;
  readonly rtl: boolean;
  readonly styles: HubStyles;
  readonly copy: HubCopy;
  readonly onOpen: HubViewProps['onOpenDestination'];
  readonly onUnavailable?: HubViewProps['onUnavailableDestination'];
}) => {
  const canPress = value.target.status === 'available' || !!onUnavailable;
  const statusLabel =
    value.status === 'stale'
      ? copy.stale
      : value.status === 'offline'
      ? copy.offline
      : value.status === 'empty'
      ? copy.noData
      : undefined;

  const onPress = () => {
    if (value.target.status === 'available') {
      onOpen(value.target);
    } else {
      onUnavailable?.(value.target);
    }
  };
  const accessibilityLabel = [
    copy.snapshot,
    value.status === 'loading' ? copy.loading : statusLabel,
    value.glucoseLabel,
    value.trendLabel,
    value.dataAgeLabel,
    value.iobLabel,
    value.cobLabel,
    value.message,
  ]
    .filter((part): part is string => Boolean(part))
    .join('. ');

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{
        busy: value.status === 'loading',
        disabled: !canPress,
      }}
      disabled={!canPress}
      hitSlop={6}
      onPress={onPress}
      style={({pressed}) => [
        styles.snapshot,
        pressed && canPress && styles.pressed,
      ]}
      testID="hub-current-snapshot">
      <View style={[styles.snapshotHeader, directionalRow(rtl)]}>
        <Text style={[styles.snapshotTitle, directionalText(rtl)]}>
          {copy.snapshot}
        </Text>
        {statusLabel ? (
          <View
            style={
              value.status === 'stale'
                ? [styles.badge, styles.badgeAttention]
                : [styles.badge, styles.badgeWarning]
            }>
            <Text style={styles.badgeText}>{statusLabel}</Text>
          </View>
        ) : null}
      </View>

      {value.status === 'loading' ? (
        <View style={[styles.loadingRow, directionalRow(rtl)]}>
          <ActivityIndicator color={styles.activityIndicator.color} />
          <Text style={[styles.snapshotMessage, directionalText(rtl)]}>
            {copy.loading}
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.snapshotValueRow, directionalRow(rtl)]}>
            {value.glucoseLabel ? (
              <Text style={[styles.glucose, directionalText(rtl)]}>
                {value.glucoseLabel}
              </Text>
            ) : null}
            {value.trendLabel ? (
              <Text style={styles.trend}>{value.trendLabel}</Text>
            ) : null}
            {value.dataAgeLabel ? (
              <Text style={[styles.dataAge, directionalText(rtl)]}>
                {value.dataAgeLabel}
              </Text>
            ) : null}
          </View>

          {value.iobLabel || value.cobLabel ? (
            <View style={[styles.snapshotFacts, directionalRow(rtl)]}>
              {value.iobLabel ? (
                <Text style={styles.fact}>{value.iobLabel}</Text>
              ) : null}
              {value.cobLabel ? (
                <Text style={styles.fact}>{value.cobLabel}</Text>
              ) : null}
            </View>
          ) : null}

          {value.message ? (
            <Text style={[styles.snapshotMessage, directionalText(rtl)]}>
              {value.message}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
};

export const HubView = ({
  model,
  currentSnapshot,
  showRecents = true,
  title,
  palette,
  onOpenDestination,
  onUnavailableDestination,
  onCustomize,
}: HubViewProps) => {
  const columns = useProductGridColumnCount();
  const rtl = model.direction === 'rtl';
  const copy = COPY[model.locale];
  const colors = useMemo(() => ({...DEFAULT_PALETTE, ...palette}), [palette]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<
    HubModuleGroup['id'] | undefined
  >(model.groups[0]?.id);
  const selectedGroup =
    model.groups.find(group => group.id === selectedGroupId) ?? model.groups[0];
  const visibleFavorites = favoritesExpanded
    ? model.favorites
    : model.favorites.slice(0, columns);
  const visibleRecents = model.recents.slice(0, columns);
  const hasMoreFavorites = model.favorites.length > columns;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
      testID="product-hub">
      <View style={[styles.pageHeader, directionalRow(rtl)]}>
        <Text
          accessibilityRole="header"
          style={[styles.pageTitle, directionalText(rtl)]}>
          {title ?? copy.hub}
        </Text>
        {onCustomize ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onCustomize()}
            style={({pressed}) => [
              styles.customizeButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.customizeText}>{copy.customize}</Text>
          </Pressable>
        ) : null}
      </View>

      {currentSnapshot ? (
        <View style={styles.section} testID="hub-section-snapshot">
          <CurrentSnapshot
            copy={copy}
            onOpen={onOpenDestination}
            onUnavailable={onUnavailableDestination}
            rtl={rtl}
            styles={styles}
            value={currentSnapshot}
          />
        </View>
      ) : null}

      <View style={styles.section} testID="hub-section-favorites">
        <View style={[styles.sectionHeader, directionalRow(rtl)]}>
          <SectionTitle
            rtl={rtl}
            styles={styles}
            testID="hub-section-favorites-title">
            {copy.favorites}
          </SectionTitle>
          {hasMoreFavorites ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{expanded: favoritesExpanded}}
              hitSlop={8}
              onPress={() => setFavoritesExpanded(value => !value)}
              style={({pressed}) => [
                styles.showAllButton,
                pressed && styles.pressed,
              ]}
              testID="hub-favorites-toggle">
              <Text style={styles.showAllText}>
                {favoritesExpanded ? copy.showLess : copy.showAll}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {visibleFavorites.length > 0 ? (
          <TileGrid
            customizeHint={copy.customizeHint}
            items={visibleFavorites}
            locale={model.locale}
            onOpen={onOpenDestination}
            onCustomize={onCustomize}
            onUnavailable={onUnavailableDestination}
            rtl={rtl}
            styles={styles}
            testID="hub-grid-favorites"
            unavailableLabel={copy.unavailable}
          />
        ) : (
          <Text style={[styles.emptyText, directionalText(rtl)]}>
            {copy.noFavorites}
          </Text>
        )}
      </View>

      {showRecents && visibleRecents.length > 0 ? (
        <View style={styles.section} testID="hub-section-recents">
          <SectionTitle
            rtl={rtl}
            styles={styles}
            testID="hub-section-recents-title">
            {copy.recents}
          </SectionTitle>
          <TileGrid
            customizeHint={copy.customizeHint}
            items={visibleRecents}
            locale={model.locale}
            onOpen={onOpenDestination}
            onCustomize={onCustomize}
            onUnavailable={onUnavailableDestination}
            rtl={rtl}
            styles={styles}
            testID="hub-grid-recents"
            unavailableLabel={copy.unavailable}
          />
        </View>
      ) : null}

      <View style={styles.section} testID="hub-section-all-modules">
        <SectionTitle
          rtl={rtl}
          styles={styles}
          testID="hub-section-all-modules-title">
          {copy.allModules}
        </SectionTitle>
        <ResponsiveGrid locale={model.locale} testID="hub-category-grid">
          {model.groups.map(group => (
            <CategoryCard
              count={group.items.length}
              group={group.id}
              key={group.id}
              onPress={() => setSelectedGroupId(group.id)}
              rtl={rtl}
              selected={group.id === selectedGroup?.id}
              styles={styles}
              testID={`hub-category-${group.id}`}
              title={group.title}
            />
          ))}
        </ResponsiveGrid>
        {selectedGroup ? (
          <View style={styles.selectedModuleGroup}>
            <TileGrid
              customizeHint={copy.customizeHint}
              items={selectedGroup.items}
              locale={model.locale}
              onOpen={onOpenDestination}
              onCustomize={onCustomize}
              onUnavailable={onUnavailableDestination}
              rtl={rtl}
              styles={styles}
              testID={`hub-grid-${selectedGroup.id}`}
              unavailableLabel={copy.unavailable}
            />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
};

const createStyles = (palette: HubPalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.background,
    },
    content: {
      width: '100%',
      maxWidth: 1040,
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 36,
    },
    pageHeader: {
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    pageTitle: {
      flexShrink: 1,
      color: palette.text,
      fontSize: 28,
      fontWeight: '700',
      lineHeight: 34,
    },
    customizeButton: {
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 22,
      paddingHorizontal: 16,
      backgroundColor: palette.accentSoft,
    },
    customizeText: {
      color: palette.accent,
      fontSize: 15,
      fontWeight: '700',
    },
    section: {
      marginBottom: 20,
    },
    sectionHeader: {
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: palette.text,
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 26,
      marginBottom: 10,
    },
    selectedModuleGroup: {
      marginTop: 14,
    },
    surface: {
      backgroundColor: palette.surface,
    },
    categoryCard: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      elevation: 1,
      justifyContent: 'space-between',
      minHeight: 66,
      paddingHorizontal: 11,
      paddingVertical: 10,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.08,
      shadowRadius: 5,
      width: '100%',
    },
    categoryCardSelected: {
      borderWidth: 2,
      elevation: 3,
      shadowOpacity: 0.16,
    },
    categoryIcon: {
      alignItems: 'center',
      borderRadius: 11,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    groupTitle: {
      flex: 1,
      color: palette.text,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
      marginHorizontal: 7,
    },
    categoryCount: {
      alignItems: 'center',
      backgroundColor: palette.accentSoft,
      borderRadius: 10,
      justifyContent: 'center',
      minHeight: 20,
      minWidth: 24,
      paddingHorizontal: 7,
    },
    categoryCountText: {
      color: palette.accent,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    tile: {
      alignSelf: 'flex-start',
      flexGrow: 1,
      minHeight: 116,
      width: '100%',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 18,
      elevation: 2,
      padding: 12,
      paddingTop: 14,
      justifyContent: 'flex-start',
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.1,
      shadowRadius: 8,
    },
    tileUnavailable: {
      backgroundColor: palette.surfaceMuted,
      borderColor: palette.border,
    },
    tileAccent: {
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      height: 4,
      left: -1,
      position: 'absolute',
      right: -1,
      top: -1,
    },
    tileHeader: {
      alignItems: 'center',
    },
    tileIcon: {
      alignItems: 'center',
      borderRadius: 12,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    tileTitle: {
      flex: 1,
      color: palette.text,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 20,
      marginHorizontal: 8,
    },
    chevron: {
      flexShrink: 0,
    },
    tileDescription: {
      color: palette.secondaryText,
      fontSize: 13,
      lineHeight: 17,
      marginTop: 8,
      marginBottom: 6,
    },
    badge: {
      alignSelf: 'flex-start',
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    alignEnd: {
      alignSelf: 'flex-end',
    },
    badgeNeutral: {
      backgroundColor: palette.accentSoft,
    },
    badgeAttention: {
      backgroundColor: palette.attentionSoft,
    },
    badgeWarning: {
      backgroundColor: palette.warningSoft,
    },
    badgeText: {
      color: palette.secondaryText,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    badgeWarningText: {
      color: palette.warning,
    },
    pressed: {
      opacity: 0.78,
      transform: [{scale: 0.985}],
    },
    emptyText: {
      color: palette.secondaryText,
      fontSize: 15,
      lineHeight: 22,
      paddingVertical: 8,
    },
    showAllButton: {
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      marginBottom: 4,
    },
    showAllText: {
      color: palette.accent,
      fontSize: 15,
      fontWeight: '700',
    },
    snapshot: {
      minHeight: 132,
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 18,
      padding: 18,
    },
    snapshotHeader: {
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    snapshotTitle: {
      flexShrink: 1,
      color: palette.secondaryText,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },
    snapshotValueRow: {
      alignItems: 'baseline',
      flexWrap: 'wrap',
    },
    glucose: {
      color: palette.text,
      fontSize: 34,
      fontWeight: '700',
      lineHeight: 42,
    },
    trend: {
      color: palette.accent,
      fontSize: 26,
      fontWeight: '700',
      lineHeight: 34,
      marginHorizontal: 10,
    },
    dataAge: {
      color: palette.secondaryText,
      fontSize: 14,
      lineHeight: 20,
    },
    snapshotFacts: {
      flexWrap: 'wrap',
      marginTop: 10,
    },
    fact: {
      color: palette.text,
      backgroundColor: palette.surfaceMuted,
      borderRadius: 10,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
      marginEnd: 8,
      marginBottom: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    snapshotMessage: {
      flexShrink: 1,
      color: palette.secondaryText,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
    },
    loadingRow: {
      alignItems: 'center',
      minHeight: 48,
    },
    activityIndicator: {
      color: palette.accent,
    },
  });
