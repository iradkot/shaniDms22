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
  useWindowDimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {ResolvedDestinationTarget} from '../destinations';
import {productUiTokens} from '../ui';
import {HUB_RECENT_LIMIT} from './selectors';
import {
  CurrentSnapshotViewModel,
  HubItem,
  HubModuleGroup,
  HubViewModel,
} from './types';
import {resolveHubItemVisual} from './visuals';

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
    hub: 'All tools',
    customize: 'Customize',
    snapshot: 'Current snapshot',
    favorites: 'Favorites',
    recents: 'Recently used',
    allModules: 'All screens',
    alphabetical: 'A–Z',
    filter: 'Filter',
    closeFilter: 'Close filters',
    all: 'All',
    noFavorites: 'Your pinned screens will appear here.',
    noScreens: 'No screens to show.',
    unavailable: 'Unavailable',
    stale: 'Stale data',
    offline: 'Offline',
    noData: 'No current data',
    loading: 'Loading current data',
    customizeHint: 'Long press to customize your tools.',
  },
  he: {
    hub: 'כל הכלים',
    customize: 'התאמה אישית',
    snapshot: 'תמונת מצב נוכחית',
    favorites: 'מועדפים',
    recents: 'בשימוש לאחרונה',
    allModules: 'כל המסכים',
    alphabetical: 'א–ת',
    filter: 'סינון',
    closeFilter: 'סגירת הסינון',
    all: 'הכול',
    noFavorites: 'המסכים שהצמדת יופיעו כאן.',
    noScreens: 'אין מסכים להצגה.',
    unavailable: 'לא זמין',
    stale: 'מידע לא עדכני',
    offline: 'אין חיבור',
    noData: 'אין מידע נוכחי',
    loading: 'המידע הנוכחי נטען',
    customizeHint: 'לחיצה ארוכה פותחת את התאמת הכלים.',
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
type HubFilter = 'closed' | 'all' | 'favorites' | HubModuleGroup['id'];

const directionalText = (rtl: boolean): TextStyle => ({
  textAlign: rtl ? 'right' : 'left',
  writingDirection: rtl ? 'rtl' : 'ltr',
});

const directionalRow = (rtl: boolean): ViewStyle => ({
  flexDirection: rtl ? 'row-reverse' : 'row',
});

/** An app-sized launch target; descriptions and status remain available to readers. */
const AppTile = ({
  item,
  rtl,
  styles,
  palette,
  copy,
  testID,
  onOpen,
  onUnavailable,
  onCustomize,
}: {
  readonly item: HubItem;
  readonly rtl: boolean;
  readonly styles: HubStyles;
  readonly palette: HubPalette;
  readonly copy: HubCopy;
  readonly testID: string;
  readonly onOpen: HubViewProps['onOpenDestination'];
  readonly onUnavailable?: HubViewProps['onUnavailableDestination'];
  readonly onCustomize?: HubViewProps['onCustomize'];
}) => {
  const unavailable = item.resolved.status === 'unavailable';
  const canPress = !unavailable || !!onUnavailable;
  const visual = resolveHubItemVisual(item);
  const badgeColor =
    unavailable || item.operationalBadge?.tone === 'warning'
      ? palette.warning
      : item.operationalBadge?.tone === 'attention'
      ? palette.attention
      : palette.accent;
  const accessibilityLabel = [
    item.title,
    item.description,
    unavailable ? copy.unavailable : item.operationalBadge?.label,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled: !canPress}}
      disabled={!canPress}
      delayLongPress={400}
      {...(onCustomize === undefined
        ? {}
        : {
            accessibilityHint: copy.customizeHint,
            onLongPress: () => onCustomize('quick-access'),
          })}
      onPress={() => {
        if (item.resolved.status === 'available') {
          onOpen(item.resolved);
        } else {
          onUnavailable?.(item.resolved);
        }
      }}
      style={({pressed}) => [
        styles.tile,
        unavailable && styles.tileUnavailable,
        pressed && canPress && styles.pressed,
      ]}
      testID={testID}>
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.tileIcon,
          {
            backgroundColor: unavailable
              ? palette.surfaceMuted
              : visual.iconBackground,
            borderColor: unavailable ? palette.border : visual.border,
            shadowColor: visual.accent,
          },
        ]}
        testID={`${testID}-icon`}>
        <MaterialIcons
          color={unavailable ? palette.secondaryText : visual.accent}
          name={visual.iconName}
          size={28}
          testID={`${testID}-icon-glyph`}
        />
        {unavailable || item.operationalBadge ? (
          <View
            style={[
              styles.statusDot,
              {backgroundColor: badgeColor},
              rtl ? styles.statusDotLeft : styles.statusDotRight,
            ]}
            testID={`${testID}-badge`}
          />
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        style={[styles.tileTitle, rtl ? styles.rtlLabel : styles.ltrLabel]}
        testID={`${testID}-title`}>
        {item.title}
      </Text>
    </Pressable>
  );
};

/** Separate from content-card grids: launcher cells are compact and name-only. */
const AppGrid = ({
  items,
  model,
  styles,
  palette,
  copy,
  testID,
  onOpen,
  onUnavailable,
  onCustomize,
}: {
  readonly items: readonly HubItem[];
  readonly model: HubViewModel;
  readonly styles: HubStyles;
  readonly palette: HubPalette;
  readonly copy: HubCopy;
  readonly testID: string;
  readonly onOpen: HubViewProps['onOpenDestination'];
  readonly onUnavailable?: HubViewProps['onUnavailableDestination'];
  readonly onCustomize?: HubViewProps['onCustomize'];
}) => {
  const {width, fontScale} = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  const availableWidth =
    measuredWidth ??
    Math.min(width - 32, productUiTokens.layout.contentMaxWidth - 32);
  const baseColumns = availableWidth >= 900 ? 8 : availableWidth >= 600 ? 6 : 4;
  const columns = Math.max(2, Math.floor(baseColumns / Math.max(1, fontScale)));
  const rtl = model.direction === 'rtl';

  return (
    <View
      onLayout={event => setMeasuredWidth(event.nativeEvent.layout.width)}
      style={[styles.grid, directionalRow(rtl)]}
      testID={testID}>
      {items.map((item, index) => (
        <View
          key={item.key}
          style={[styles.gridCell, {width: `${100 / columns}%`}]}
          testID={`${testID}-item-${index}`}>
          <AppTile
            copy={copy}
            item={item}
            onCustomize={onCustomize}
            onOpen={onOpen}
            onUnavailable={onUnavailable}
            palette={palette}
            rtl={rtl}
            styles={styles}
            testID={`${testID}-tile-${item.key}`}
          />
        </View>
      ))}
    </View>
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
  const rtl = model.direction === 'rtl';
  const copy = COPY[model.locale];
  const colors = useMemo(() => ({...DEFAULT_PALETTE, ...palette}), [palette]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [filter, setFilter] = useState<HubFilter>('closed');
  const expanded = filter !== 'closed';
  const group = model.groups.find(value => value.id === filter);
  const activeFilter =
    filter === 'favorites' ? 'favorites' : group?.id ?? 'all';

  useEffect(() => {
    if (expanded && filter !== 'all' && filter !== 'favorites' && !group) {
      setFilter('all');
    }
  }, [expanded, filter, group]);

  const items = useMemo(() => {
    const source =
      activeFilter === 'favorites'
        ? model.favorites
        : group?.items ?? model.groups.flatMap(value => value.items);
    const unique = [...new Map(source.map(item => [item.key, item])).values()];
    return unique.sort((left, right) =>
      left.title.localeCompare(right.title, model.locale, {
        sensitivity: 'base',
        numeric: true,
      }),
    );
  }, [activeFilter, group, model.favorites, model.groups, model.locale]);
  const recents = showRecents ? model.recents.slice(0, HUB_RECENT_LIMIT) : [];
  const filters = [
    {id: 'all' as const, title: copy.all},
    {id: 'favorites' as const, title: copy.favorites},
    ...model.groups,
  ];
  const gridProps = {
    model,
    styles,
    palette: colors,
    copy,
    onOpen: onOpenDestination,
    onUnavailable: onUnavailableDestination,
    onCustomize,
  };
  const libraryTitle =
    activeFilter === 'favorites'
      ? copy.favorites
      : group?.title ?? copy.allModules;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
      testID="product-hub">
      <View style={[styles.header, directionalRow(rtl)]}>
        <Text
          accessibilityRole="header"
          style={[styles.pageTitle, directionalText(rtl)]}>
          {title ?? copy.hub}
        </Text>
        <View style={[styles.headerActions, directionalRow(rtl)]}>
          <Pressable
            accessibilityLabel={expanded ? copy.closeFilter : copy.filter}
            accessibilityRole="button"
            accessibilityState={{expanded}}
            aria-expanded={expanded}
            onPress={() => setFilter(expanded ? 'closed' : 'all')}
            style={({pressed}) => [
              styles.filterButton,
              directionalRow(rtl),
              expanded && styles.filterButtonActive,
              pressed && styles.pressed,
            ]}
            testID="hub-filter-toggle">
            <MaterialIcons
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              color={expanded ? colors.accent : colors.secondaryText}
              name={expanded ? 'close' : 'filter-list'}
              size={20}
            />
            <Text
              style={[
                styles.filterLabel,
                expanded && styles.filterLabelActive,
              ]}>
              {copy.filter}
            </Text>
          </Pressable>
          {onCustomize ? (
            <Pressable
              accessibilityLabel={copy.customize}
              accessibilityRole="button"
              onPress={() => onCustomize()}
              style={({pressed}) => [
                styles.iconButton,
                pressed && styles.pressed,
              ]}
              testID="hub-customize">
              <MaterialIcons
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                color={colors.secondaryText}
                name="tune"
                size={20}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {expanded ? (
        <View style={styles.filterPanel} testID="hub-category-picker">
          <View
            style={[styles.filterChoices, directionalRow(rtl)]}
            testID="hub-category-grid">
            {filters.map(option => {
              const selected = activeFilter === option.id;
              return (
                <Pressable
                  accessibilityLabel={option.title}
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  aria-pressed={selected}
                  key={option.id}
                  onPress={() => setFilter(option.id)}
                  style={({pressed}) => [
                    styles.filterChip,
                    selected && styles.filterChipSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`hub-category-${option.id}`}>
                  <Text
                    style={[
                      styles.filterChipText,
                      selected && styles.filterChipTextSelected,
                    ]}>
                    {option.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {recents.length > 0 ? (
        <View style={styles.recentsSection} testID="hub-section-recents">
          <Text
            accessibilityRole="header"
            style={[styles.sectionLabel, directionalText(rtl)]}
            testID="hub-section-recents-title">
            {copy.recents}
          </Text>
          <AppGrid {...gridProps} items={recents} testID="hub-grid-recents" />
        </View>
      ) : null}

      <View style={styles.librarySection} testID="hub-section-all-modules">
        <View style={[styles.libraryHeading, directionalRow(rtl)]}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionLabel, directionalText(rtl)]}
            testID="hub-section-all-modules-title">
            {libraryTitle}
          </Text>
          <Text style={styles.sortLabel}>{copy.alphabetical}</Text>
        </View>
        {items.length > 0 ? (
          <AppGrid
            {...gridProps}
            items={items}
            testID={`hub-grid-${activeFilter}`}
          />
        ) : (
          <Text
            style={[styles.emptyText, directionalText(rtl)]}
            testID="hub-empty">
            {activeFilter === 'favorites' ? copy.noFavorites : copy.noScreens}
          </Text>
        )}
      </View>

      {currentSnapshot ? (
        <View style={styles.snapshotSection} testID="hub-section-snapshot">
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
    </ScrollView>
  );
};

const createStyles = (palette: HubPalette) =>
  StyleSheet.create({
    screen: {flex: 1, backgroundColor: palette.background},
    content: {
      width: '100%',
      maxWidth: productUiTokens.layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 32,
    },
    header: {
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: 8,
    },
    pageTitle: {
      color: palette.text,
      flexShrink: 1,
      fontSize: 19,
      fontWeight: '700',
      lineHeight: 26,
    },
    headerActions: {alignItems: 'center', gap: 4},
    filterButton: {
      minHeight: 44,
      paddingHorizontal: 10,
      gap: 5,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
    },
    filterButtonActive: {backgroundColor: palette.accentSoft},
    filterLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.secondaryText,
    },
    filterLabelActive: {color: palette.accent},
    iconButton: {
      width: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
    },
    filterPanel: {marginBottom: 16},
    filterChoices: {flexWrap: 'wrap', gap: 6},
    filterChip: {
      minHeight: 40,
      paddingHorizontal: 14,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    filterChipSelected: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    filterChipText: {
      fontSize: 13,
      lineHeight: 20,
      color: palette.secondaryText,
    },
    filterChipTextSelected: {
      color: productUiTokens.colors.actionText,
      fontWeight: '600',
    },
    recentsSection: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
      marginBottom: 20,
      paddingBottom: 12,
    },
    sectionLabel: {
      color: palette.secondaryText,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
      marginBottom: 14,
    },
    librarySection: {paddingBottom: 4},
    libraryHeading: {alignItems: 'baseline', justifyContent: 'space-between'},
    sortLabel: {fontSize: 11, lineHeight: 16, color: palette.secondaryText},
    grid: {flexWrap: 'wrap', alignItems: 'flex-start', rowGap: 12},
    gridCell: {alignSelf: 'stretch'},
    tile: {
      alignItems: 'center',
      paddingHorizontal: 3,
      paddingVertical: 6,
      minHeight: 108,
    },
    tileUnavailable: {opacity: 0.62},
    tileIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 1,
    },
    tileTitle: {
      color: palette.text,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
      textAlign: 'center',
      marginTop: 9,
      width: '100%',
    },
    rtlLabel: {writingDirection: 'rtl'},
    ltrLabel: {writingDirection: 'ltr'},
    statusDot: {
      position: 'absolute',
      top: -3,
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: palette.background,
    },
    statusDotLeft: {left: -3},
    statusDotRight: {right: -3},
    pressed: {opacity: 0.65, transform: [{scale: 0.97}]},
    emptyText: {
      color: palette.secondaryText,
      fontSize: 14,
      lineHeight: 20,
      paddingVertical: 24,
    },
    snapshotSection: {marginTop: 20},
    badge: {
      alignSelf: 'flex-start',
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    badgeAttention: {backgroundColor: palette.attentionSoft},
    badgeWarning: {backgroundColor: palette.warningSoft},
    badgeText: {color: palette.secondaryText, fontSize: 12, fontWeight: '700'},
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
    snapshotValueRow: {alignItems: 'baseline', flexWrap: 'wrap'},
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
    dataAge: {color: palette.secondaryText, fontSize: 14, lineHeight: 20},
    snapshotFacts: {flexWrap: 'wrap', marginTop: 10},
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
    loadingRow: {alignItems: 'center', minHeight: 48},
    activityIndicator: {color: palette.accent},
  });
