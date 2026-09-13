import React, {useEffect, useMemo, useState} from 'react';
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
import {
  productUiTokens,
  ResponsiveGrid,
  useProductGridColumnCount,
} from '../ui';
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
  background: productUiTokens.colors.page,
  surface: productUiTokens.colors.surface,
  surfaceMuted: '#F0F3F7',
  text: productUiTokens.colors.text,
  secondaryText: productUiTokens.colors.textMuted,
  border: productUiTokens.colors.border,
  accent: productUiTokens.colors.action,
  accentSoft: productUiTokens.colors.surfaceInfo,
  attention: '#8A4B00',
  attentionSoft: '#FFF1D6',
  warning: productUiTokens.colors.danger,
  warningSoft: '#FCE9E7',
};

const COPY = {
  en: {
    hub: 'Hub',
    customize: 'Customize',
    snapshot: 'Current snapshot',
    favorites: 'Favorites',
    recents: 'Recent',
    quickAccess: 'Quick access',
    quickAccessHintCollapsed: 'Show quick access',
    quickAccessHintExpanded: 'Hide quick access',
    allModules: 'All modules',
    allModulesSubtitle: 'Choose a category, then open a module.',
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
    quickAccess: 'גישה מהירה',
    quickAccessHintCollapsed: 'הצגת הגישה המהירה',
    quickAccessHintExpanded: 'הסתרת הגישה המהירה',
    allModules: 'כל המודולים',
    allModulesSubtitle: 'בחרו קטגוריה ופתחו את המודול הרצוי.',
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

const formatFavoriteCount = (
  count: number,
  locale: HubViewModel['locale'],
) => {
  if (locale === 'he') {
    return count === 1 ? 'מועדף אחד' : `${count} מועדפים`;
  }
  return count === 1 ? '1 favorite' : `${count} favorites`;
};

const formatRecentCount = (
  count: number,
  locale: HubViewModel['locale'],
) => {
  if (locale === 'he') {
    return count === 1 ? 'פריט אחרון אחד' : `${count} פריטים אחרונים`;
  }
  return count === 1 ? '1 recent item' : `${count} recent items`;
};

const formatModuleCount = (
  count: number,
  locale: HubViewModel['locale'],
) => {
  if (locale === 'he') {
    return count === 1 ? 'מודול אחד' : `${count} מודולים`;
  }
  return count === 1 ? '1 module' : `${count} modules`;
};

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
  const accessibilityLabel = [
    item.title,
    item.description,
    unavailable ? unavailableLabel : item.operationalBadge?.label,
  ]
    .filter((part): part is string => Boolean(part))
    .join('. ');
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
      accessibilityLabel={accessibilityLabel}
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
            size={27}
            testID={`${tileTestID}-icon-glyph`}
          />
        </View>
        <Text
          numberOfLines={3}
          style={[styles.tileTitle, directionalText(rtl)]}>
          {item.title}
        </Text>
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
  countLabel,
  count,
  group,
  onPress,
  rtl,
  selected,
  styles,
  testID,
  title,
}: {
  readonly countLabel: string;
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
      accessibilityLabel={`${title}. ${countLabel}`}
      accessibilityRole="button"
      accessibilityState={{selected}}
      aria-pressed={selected}
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

type QuickAccessId = 'favorites' | 'recents';

interface QuickAccessDescriptor {
  readonly id: QuickAccessId;
  readonly label: string;
  readonly countLabel: string;
  readonly iconName: 'star' | 'history';
  readonly items: readonly HubItem[];
  readonly emptyLabel: string;
  readonly tabTestID: string;
  readonly panelTestID: string;
  readonly sectionTestID: string;
  readonly gridTestID: string;
  readonly emptyTestID: string;
}

const initialQuickAccessId = (
  showRecents: boolean,
  favoriteCount: number,
  recentCount: number,
): QuickAccessId =>
  showRecents && favoriteCount === 0 && recentCount > 0
    ? 'recents'
    : 'favorites';

const normalizeQuickAccessId = (
  current: QuickAccessId,
  showRecents: boolean,
  favoriteCount: number,
  recentCount: number,
): QuickAccessId => {
  if (!showRecents) {
    return 'favorites';
  }

  if (current === 'favorites' && favoriteCount === 0 && recentCount > 0) {
    return 'recents';
  }
  if (current === 'recents' && recentCount === 0 && favoriteCount > 0) {
    return 'favorites';
  }
  return current;
};

const QuickAccess = ({
  model,
  palette,
  showRecents,
  styles,
  onOpenDestination,
  onUnavailableDestination,
  onCustomize,
}: {
  readonly model: HubViewModel;
  readonly palette: HubPalette;
  readonly showRecents: boolean;
  readonly styles: HubStyles;
  readonly onOpenDestination: HubViewProps['onOpenDestination'];
  readonly onUnavailableDestination?: HubViewProps['onUnavailableDestination'];
  readonly onCustomize?: HubViewProps['onCustomize'];
}) => {
  const columns = useProductGridColumnCount();
  const rtl = model.direction === 'rtl';
  const copy = COPY[model.locale];
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<QuickAccessId>(() =>
    initialQuickAccessId(
      showRecents,
      model.favorites.length,
      model.recents.length,
    ),
  );
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);

  useEffect(() => {
    setSelectedId(current =>
      normalizeQuickAccessId(
        current,
        showRecents,
        model.favorites.length,
        model.recents.length,
      ),
    );
  }, [model.favorites.length, model.recents.length, showRecents]);

  const descriptors: readonly [
    QuickAccessDescriptor,
    QuickAccessDescriptor,
  ] = [
    {
      id: 'favorites',
      label: copy.favorites,
      countLabel: formatFavoriteCount(model.favorites.length, model.locale),
      iconName: 'star',
      items: favoritesExpanded
        ? model.favorites
        : model.favorites.slice(0, columns),
      emptyLabel: copy.noFavorites,
      tabTestID: 'hub-quick-access-tab-favorites',
      panelTestID: 'hub-quick-access-panel-favorites',
      sectionTestID: 'hub-section-favorites',
      gridTestID: 'hub-grid-favorites',
      emptyTestID: 'hub-quick-access-empty-favorites',
    },
    {
      id: 'recents',
      label: copy.recents,
      countLabel: formatRecentCount(model.recents.length, model.locale),
      iconName: 'history',
      items: model.recents.slice(0, columns),
      emptyLabel: copy.noRecents,
      tabTestID: 'hub-quick-access-tab-recents',
      panelTestID: 'hub-quick-access-panel-recents',
      sectionTestID: 'hub-section-recents',
      gridTestID: 'hub-grid-recents',
      emptyTestID: 'hub-quick-access-empty-recents',
    },
  ];
  const visibleDescriptors = showRecents ? descriptors : descriptors.slice(0, 1);
  const activeId = showRecents ? selectedId : 'favorites';
  const activeDescriptor =
    descriptors.find(descriptor => descriptor.id === activeId) ?? descriptors[0];
  const summary = visibleDescriptors
    .map(descriptor => descriptor.countLabel)
    .join(' · ');
  const hasMoreFavorites = model.favorites.length > columns;

  const panelContent =
    activeDescriptor.items.length > 0 ? (
      <TileGrid
        customizeHint={copy.customizeHint}
        items={activeDescriptor.items}
        locale={model.locale}
        onOpen={onOpenDestination}
        onCustomize={onCustomize}
        onUnavailable={onUnavailableDestination}
        rtl={rtl}
        styles={styles}
        testID={activeDescriptor.gridTestID}
        unavailableLabel={copy.unavailable}
      />
    ) : (
      <Text
        style={[styles.emptyText, directionalText(rtl)]}
        testID={activeDescriptor.emptyTestID}>
        {activeDescriptor.emptyLabel}
      </Text>
    );

  return (
    <View
      style={[styles.section, styles.quickAccessCard]}
      testID="hub-section-quick-access">
      <Pressable
        accessibilityHint={
          expanded
            ? copy.quickAccessHintExpanded
            : copy.quickAccessHintCollapsed
        }
        accessibilityLabel={`${copy.quickAccess}. ${summary}`}
        accessibilityRole="button"
        accessibilityState={{expanded}}
        aria-expanded={expanded}
        hitSlop={4}
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [
          styles.quickAccessHeader,
          directionalRow(rtl),
          pressed && styles.pressed,
        ]}
        testID="hub-quick-access-toggle">
        <View
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.quickAccessIcon}>
          <MaterialIcons color={palette.accent} name="bolt" size={24} />
        </View>
        <View style={styles.quickAccessHeading}>
          <Text
            style={[styles.quickAccessTitle, directionalText(rtl)]}
            testID="hub-section-quick-access-title">
            {copy.quickAccess}
          </Text>
          <Text
            style={[styles.quickAccessSummary, directionalText(rtl)]}
            testID="hub-quick-access-summary">
            {summary}
          </Text>
        </View>
        <MaterialIcons
          accessibilityElementsHidden
          color={palette.secondaryText}
          importantForAccessibility="no-hide-descendants"
          name={expanded ? 'expand-less' : 'expand-more'}
          size={26}
          testID="hub-quick-access-toggle-icon"
        />
      </Pressable>

      {expanded ? (
        <View style={styles.quickAccessBody} testID="hub-quick-access-content">
          {showRecents ? (
            <View
              style={[styles.quickAccessTabs, directionalRow(rtl)]}
              testID="hub-quick-access-tabs">
              {visibleDescriptors.map(descriptor => {
                const selected = descriptor.id === activeId;
                return (
                  <Pressable
                    accessibilityLabel={`${descriptor.label}. ${descriptor.countLabel}`}
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    aria-pressed={selected}
                    key={descriptor.id}
                    onPress={() => setSelectedId(descriptor.id)}
                    style={({pressed}) => [
                      styles.quickAccessTab,
                      directionalRow(rtl),
                      selected && styles.quickAccessTabSelected,
                      pressed && styles.pressed,
                    ]}
                    testID={descriptor.tabTestID}>
                    <MaterialIcons
                      color={
                        selected ? palette.accent : palette.secondaryText
                      }
                      name={descriptor.iconName}
                      size={18}
                    />
                    <Text
                      style={[
                        styles.quickAccessTabText,
                        selected && styles.quickAccessTabTextSelected,
                      ]}>
                      {descriptor.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View
            style={styles.quickAccessPanel}
            testID={activeDescriptor.panelTestID}>
            {activeDescriptor.id === 'favorites' ? (
              <View testID={activeDescriptor.sectionTestID}>
                <View
                  style={[styles.sectionHeader, directionalRow(rtl)]}>
                  {!showRecents ? (
                    <SectionTitle
                      rtl={rtl}
                      styles={styles}
                      testID="hub-section-favorites-title">
                      {activeDescriptor.label}
                    </SectionTitle>
                  ) : (
                    <View />
                  )}
                  {hasMoreFavorites ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{expanded: favoritesExpanded}}
                      aria-expanded={favoritesExpanded}
                      hitSlop={8}
                      onPress={() =>
                        setFavoritesExpanded(value => !value)
                      }
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
                {panelContent}
              </View>
            ) : (
              <View testID={activeDescriptor.sectionTestID}>
                {panelContent}
              </View>
            )}
          </View>
        </View>
      ) : null}
    </View>
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
  const rtl = model.direction === 'rtl';
  const copy = COPY[model.locale];
  const colors = useMemo(() => ({...DEFAULT_PALETTE, ...palette}), [palette]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedGroupId, setSelectedGroupId] = useState<
    HubModuleGroup['id'] | undefined
  >(model.groups[0]?.id);

  useEffect(() => {
    setSelectedGroupId(current =>
      model.groups.some(group => group.id === current)
        ? current
        : model.groups[0]?.id,
    );
  }, [model.groups]);

  const selectedGroup =
    model.groups.find(group => group.id === selectedGroupId) ?? model.groups[0];

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

      <View style={styles.section} testID="hub-section-all-modules">
        <View style={styles.modulesHeading}>
          <SectionTitle
            rtl={rtl}
            styles={styles}
            testID="hub-section-all-modules-title">
            {copy.allModules}
          </SectionTitle>
          <Text
            style={[styles.sectionSubtitle, directionalText(rtl)]}
            testID="hub-section-all-modules-subtitle">
            {copy.allModulesSubtitle}
          </Text>
        </View>
        <View style={styles.categoryPicker} testID="hub-category-picker">
          <ResponsiveGrid locale={model.locale} testID="hub-category-grid">
            {model.groups.map(group => (
              <CategoryCard
                countLabel={formatModuleCount(
                  group.items.length,
                  model.locale,
                )}
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
        </View>
        {selectedGroup ? (
          <View
            style={styles.selectedModuleGroup}
            testID={`hub-module-group-${selectedGroup.id}`}>
            <View style={[styles.moduleGroupHeader, directionalRow(rtl)]}>
              <Text
                accessibilityRole="header"
                style={[styles.moduleGroupTitle, directionalText(rtl)]}
                testID="hub-selected-group-title">
                {selectedGroup.title}
              </Text>
              <Text
                style={[styles.moduleGroupCount, directionalText(rtl)]}
                testID="hub-selected-group-count">
                {formatModuleCount(selectedGroup.items.length, model.locale)}
              </Text>
            </View>
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

      <QuickAccess
        model={model}
        onCustomize={onCustomize}
        onOpenDestination={onOpenDestination}
        onUnavailableDestination={onUnavailableDestination}
        palette={colors}
        showRecents={showRecents}
        styles={styles}
      />
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
      maxWidth: productUiTokens.layout.contentMaxWidth,
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
      marginBottom: 24,
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
      marginBottom: 6,
    },
    modulesHeading: {
      marginBottom: 14,
    },
    sectionSubtitle: {
      color: palette.secondaryText,
      fontSize: 14,
      lineHeight: 20,
    },
    categoryPicker: {
      marginBottom: 16,
    },
    selectedModuleGroup: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 1,
      padding: 12,
      shadowColor: '#17202A',
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.06,
      shadowRadius: 10,
    },
    moduleGroupHeader: {
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 2,
    },
    moduleGroupTitle: {
      color: palette.text,
      flexShrink: 1,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    moduleGroupCount: {
      color: palette.secondaryText,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 18,
      marginHorizontal: 8,
    },
    surface: {
      backgroundColor: palette.surface,
    },
    categoryCard: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 15,
      borderWidth: 1,
      justifyContent: 'space-between',
      minHeight: 62,
      paddingHorizontal: 10,
      paddingVertical: 9,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0,
      shadowRadius: 4,
      width: '100%',
    },
    categoryCardSelected: {
      borderWidth: 2,
      elevation: 2,
      shadowOpacity: 0.12,
    },
    categoryIcon: {
      alignItems: 'center',
      borderRadius: 10,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    groupTitle: {
      flex: 1,
      color: palette.text,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
      marginHorizontal: 6,
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
      minHeight: 140,
      width: '100%',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 20,
      elevation: 2,
      padding: 14,
      paddingTop: 16,
      justifyContent: 'flex-start',
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.09,
      shadowRadius: 10,
    },
    tileUnavailable: {
      backgroundColor: palette.surfaceMuted,
      borderColor: palette.border,
    },
    tileAccent: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
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
      borderRadius: 15,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    tileTitle: {
      flex: 1,
      color: palette.text,
      fontSize: 17,
      fontWeight: '700',
      lineHeight: 22,
      marginHorizontal: 10,
    },
    tileDescription: {
      color: palette.secondaryText,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 10,
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
    quickAccessCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 1,
      overflow: 'hidden',
      shadowColor: '#17202A',
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.06,
      shadowRadius: 9,
    },
    quickAccessHeader: {
      alignItems: 'center',
      minHeight: 72,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    quickAccessIcon: {
      alignItems: 'center',
      backgroundColor: palette.accentSoft,
      borderRadius: 14,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    quickAccessHeading: {
      flex: 1,
      marginHorizontal: 12,
    },
    quickAccessTitle: {
      color: palette.text,
      fontSize: 17,
      fontWeight: '700',
      lineHeight: 22,
    },
    quickAccessSummary: {
      color: palette.secondaryText,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    quickAccessBody: {
      borderTopColor: palette.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      padding: 12,
      paddingTop: 10,
    },
    quickAccessTabs: {
      backgroundColor: palette.surfaceMuted,
      borderRadius: 13,
      flexDirection: 'row',
      padding: 3,
    },
    quickAccessTab: {
      alignItems: 'center',
      borderRadius: 10,
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      minHeight: 42,
      paddingHorizontal: 10,
    },
    quickAccessTabSelected: {
      backgroundColor: palette.surface,
      elevation: 1,
      shadowColor: '#17202A',
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.1,
      shadowRadius: 3,
    },
    quickAccessTabText: {
      color: palette.secondaryText,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
      marginHorizontal: 6,
    },
    quickAccessTabTextSelected: {
      color: palette.accent,
      fontWeight: '700',
    },
    quickAccessPanel: {
      marginTop: 12,
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
