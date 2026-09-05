import React, {useMemo} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type {
  AvailableDestinationTarget,
  DestinationLocale,
  DestinationRegistry,
  DestinationRuntimeContext,
  UnavailableDestinationTarget,
} from '../destinations';
import {
  getProductShellLayout,
  resolveCurrentProductShellRoute,
  selectShellNavigationModel,
} from './selectors';
import {createDestinationRequest} from './request';
import type {
  ProductShellAction,
  DestinationRequest,
  ProductShellLayout,
  ProductShellState,
  ResolvedProductShellConfiguration,
  ShellNavigationModel,
  ShellShortcutControl,
} from './types';

export interface ProductShellPalette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceActive: string;
  readonly border: string;
  readonly text: string;
  readonly secondaryText: string;
  readonly accent: string;
  readonly disabled: string;
}

const DEFAULT_PALETTE: ProductShellPalette = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceActive: '#E7F1FA',
  border: '#DCE2E8',
  text: '#17202A',
  secondaryText: '#5C6875',
  accent: '#1769AA',
  disabled: '#929BA5',
};

const UNAVAILABLE_COPY = {
  en: {
    title: 'Destination unavailable',
    description:
      'This saved destination cannot be opened on this device right now.',
    returnHub: 'Return to Hub',
  },
  he: {
    title: 'היעד אינו זמין',
    description: 'לא ניתן לפתוח את היעד השמור במכשיר הזה כרגע.',
    returnHub: 'חזרה למרכז',
  },
} as const;

export interface ProductShellDestinationSlotProps {
  readonly destination: AvailableDestinationTarget;
  readonly request: DestinationRequest;
}

export interface ProductShellViewProps {
  readonly state: ProductShellState;
  readonly configuration: ResolvedProductShellConfiguration;
  readonly registry: DestinationRegistry;
  readonly runtime: DestinationRuntimeContext;
  readonly locale: DestinationLocale;
  readonly dispatch: (action: ProductShellAction) => void;
  readonly renderHub: () => React.ReactNode;
  readonly renderDestination: (
    props: ProductShellDestinationSlotProps,
  ) => React.ReactNode;
  readonly renderUnavailableDestination?: (
    destination: UnavailableDestinationTarget,
  ) => React.ReactNode;
  readonly palette?: Partial<ProductShellPalette>;
  readonly forceLayout?: ProductShellLayout;
  readonly wideBreakpoint?: number;
}

type ShellStyles = ReturnType<typeof createStyles>;

const directionText = (rtl: boolean): TextStyle => ({
  textAlign: 'center',
  writingDirection: rtl ? 'rtl' : 'ltr',
});

const directionLayout = (rtl: boolean): ViewStyle => ({
  flexDirection: rtl ? 'row-reverse' : 'row',
});

const NavigationButton = ({
  label,
  secondaryLabel,
  iconName,
  disabled,
  active,
  testID,
  rail,
  rtl,
  styles,
  onPress,
}: {
  readonly label: string;
  readonly secondaryLabel?: string;
  readonly iconName?: string;
  readonly disabled?: boolean;
  readonly active?: boolean;
  readonly testID: string;
  readonly rail: boolean;
  readonly rtl: boolean;
  readonly styles: ShellStyles;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityHint={secondaryLabel}
    accessibilityLabel={label}
    accessibilityRole="button"
    accessibilityState={{disabled: !!disabled, selected: !!active}}
    disabled={disabled}
    hitSlop={4}
    onPress={onPress}
    style={({pressed}) => [
      styles.navigationButton,
      rail ? styles.railButton : styles.phoneButton,
      active && styles.navigationButtonActive,
      disabled && styles.navigationButtonDisabled,
      pressed && !disabled && styles.navigationButtonPressed,
    ]}
    testID={testID}>
    {iconName ? (
      <MaterialIcons
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        name={iconName}
        size={20}
        style={[
          styles.navigationIcon,
          active && styles.navigationIconActive,
          disabled && styles.navigationIconDisabled,
        ]}
      />
    ) : null}
    <Text
      numberOfLines={rail ? 3 : 2}
      style={[
        styles.navigationLabel,
        directionText(rtl),
        active && styles.navigationLabelActive,
        disabled && styles.navigationLabelDisabled,
      ]}>
      {label}
    </Text>
    {secondaryLabel ? (
      <Text
        numberOfLines={1}
        style={[styles.navigationSecondary, directionText(rtl)]}>
        {secondaryLabel}
      </Text>
    ) : null}
  </Pressable>
);

const ShortcutButton = ({
  shortcut,
  rail,
  rtl,
  styles,
  dispatch,
}: {
  readonly shortcut: ShellShortcutControl;
  readonly rail: boolean;
  readonly rtl: boolean;
  readonly styles: ShellStyles;
  readonly dispatch: ProductShellViewProps['dispatch'];
}) => {
  const unavailable = shortcut.resolved.status === 'unavailable';
  return (
    <NavigationButton
      active={shortcut.active}
      disabled={unavailable}
      iconName={shortcut.iconName}
      label={shortcut.title}
      onPress={() => {
        if (shortcut.resolved.status === 'available') {
          dispatch({
            type: 'open-destination',
            request: createDestinationRequest(shortcut.resolved),
          });
        }
      }}
      rail={rail}
      rtl={rtl}
      {...(shortcut.unavailableLabel === undefined
        ? {}
        : {secondaryLabel: shortcut.unavailableLabel})}
      styles={styles}
      testID={`shell-shortcut-${shortcut.key}`}
    />
  );
};

const NavigationControls = ({
  model,
  layout,
  styles,
  dispatch,
}: {
  readonly model: ShellNavigationModel;
  readonly layout: ProductShellLayout;
  readonly styles: ShellStyles;
  readonly dispatch: ProductShellViewProps['dispatch'];
}) => {
  const rail = layout === 'wide';
  const rtl = model.direction === 'rtl';
  return (
    <View
      accessibilityRole="toolbar"
      style={[
        rail ? styles.rail : styles.phoneNavigation,
        !rail && directionLayout(rtl),
      ]}
      testID={rail ? 'product-shell-rail' : 'product-shell-phone-nav'}>
      <NavigationButton
        active={false}
        disabled={model.back.disabled}
        iconName={rtl ? 'arrow-forward' : 'arrow-back'}
        label={model.back.label}
        onPress={() => dispatch({type: 'back'})}
        rail={rail}
        rtl={rtl}
        styles={styles}
        testID="shell-control-back"
      />
      <NavigationButton
        active={model.hub.active}
        iconName="home"
        label={model.hub.label}
        onPress={() => dispatch({type: 'hub'})}
        rail={rail}
        rtl={rtl}
        styles={styles}
        testID="shell-control-hub"
      />
      <NavigationButton
        active={false}
        disabled={model.forward.disabled}
        iconName={rtl ? 'arrow-back' : 'arrow-forward'}
        label={model.forward.label}
        onPress={() => dispatch({type: 'forward'})}
        rail={rail}
        rtl={rtl}
        styles={styles}
        testID="shell-control-forward"
      />
      {model.shortcuts.map(shortcut => (
        <ShortcutButton
          dispatch={dispatch}
          key={shortcut.key}
          rail={rail}
          rtl={rtl}
          shortcut={shortcut}
          styles={styles}
        />
      ))}
    </View>
  );
};

const UnavailableContent = ({
  destination,
  locale,
  rtl,
  styles,
  dispatch,
}: {
  readonly destination: UnavailableDestinationTarget;
  readonly locale: DestinationLocale;
  readonly rtl: boolean;
  readonly styles: ShellStyles;
  readonly dispatch: ProductShellViewProps['dispatch'];
}) => {
  const copy = UNAVAILABLE_COPY[locale];
  return (
    <View style={styles.unavailableContent} testID="shell-unavailable-content">
      <Text
        accessibilityRole="header"
        style={[styles.unavailableTitle, directionText(rtl)]}>
        {destination.destination?.copy[locale].title ?? copy.title}
      </Text>
      <Text style={[styles.unavailableDescription, directionText(rtl)]}>
        {copy.description}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => dispatch({type: 'hub'})}
        style={({pressed}) => [
          styles.returnHubButton,
          pressed && styles.navigationButtonPressed,
        ]}>
        <Text style={styles.returnHubLabel}>{copy.returnHub}</Text>
      </Pressable>
    </View>
  );
};

export const ProductShellView = ({
  state,
  configuration,
  registry,
  runtime,
  locale,
  dispatch,
  renderHub,
  renderDestination,
  renderUnavailableDestination,
  palette,
  forceLayout,
  wideBreakpoint = 760,
}: ProductShellViewProps) => {
  const {width} = useWindowDimensions();
  const layout = forceLayout ?? getProductShellLayout(width, wideBreakpoint);
  const navigation = selectShellNavigationModel(state, configuration, locale);
  const current = resolveCurrentProductShellRoute(state, registry, runtime);
  const rtl = locale === 'he';
  const colors = useMemo(() => ({...DEFAULT_PALETTE, ...palette}), [palette]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const content =
    current.kind === 'hub' ? (
      renderHub()
    ) : current.resolved.status === 'available' ? (
      renderDestination({
        destination: current.resolved,
        request: {
          destination: current.resolved,
          ...(current.request.workspaceId === undefined
            ? {}
            : {workspaceId: current.request.workspaceId}),
          ...(current.request.focus === undefined
            ? {}
            : {focus: current.request.focus}),
        },
      })
    ) : renderUnavailableDestination ? (
      renderUnavailableDestination(current.resolved)
    ) : (
      <UnavailableContent
        destination={current.resolved}
        dispatch={dispatch}
        locale={locale}
        rtl={rtl}
        styles={styles}
      />
    );

  if (layout === 'wide') {
    return (
      <View style={[styles.shell, directionLayout(rtl)]} testID="product-shell">
        <NavigationControls
          dispatch={dispatch}
          layout={layout}
          model={navigation}
          styles={styles}
        />
        <View style={styles.content}>{content}</View>
      </View>
    );
  }

  return (
    <View style={styles.shell} testID="product-shell">
      <View style={styles.content}>{content}</View>
      <NavigationControls
        dispatch={dispatch}
        layout={layout}
        model={navigation}
        styles={styles}
      />
    </View>
  );
};

const createStyles = (palette: ProductShellPalette) =>
  StyleSheet.create({
    shell: {
      flex: 1,
      backgroundColor: palette.background,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    phoneNavigation: {
      minHeight: 76,
      alignItems: 'stretch',
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 8,
      paddingBottom: 8,
      paddingTop: 7,
    },
    rail: {
      width: 124,
      flexShrink: 0,
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderEndWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      paddingVertical: 14,
    },
    navigationButton: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      paddingHorizontal: 7,
      paddingVertical: 7,
    },
    phoneButton: {
      flex: 1,
      minHeight: 58,
      minWidth: 60,
      marginHorizontal: 2,
    },
    railButton: {
      width: '100%',
      minHeight: 64,
      marginBottom: 8,
    },
    navigationButtonActive: {
      backgroundColor: palette.surfaceActive,
    },
    navigationButtonDisabled: {
      opacity: 0.62,
    },
    navigationButtonPressed: {
      opacity: 0.72,
    },
    navigationLabel: {
      color: palette.text,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 17,
    },
    navigationIcon: {
      color: palette.text,
      marginBottom: 2,
    },
    navigationIconActive: {
      color: palette.accent,
    },
    navigationIconDisabled: {
      color: palette.disabled,
    },
    navigationLabelActive: {
      color: palette.accent,
    },
    navigationLabelDisabled: {
      color: palette.disabled,
    },
    navigationSecondary: {
      color: palette.disabled,
      fontSize: 10,
      fontWeight: '600',
      lineHeight: 13,
      marginTop: 2,
    },
    unavailableContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    unavailableTitle: {
      color: palette.text,
      fontSize: 24,
      fontWeight: '700',
      lineHeight: 31,
      marginBottom: 10,
    },
    unavailableDescription: {
      maxWidth: 440,
      color: palette.secondaryText,
      fontSize: 16,
      lineHeight: 23,
      marginBottom: 22,
    },
    returnHubButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accent,
      borderRadius: 24,
      paddingHorizontal: 22,
    },
    returnHubLabel: {
      color: palette.surface,
      fontSize: 15,
      fontWeight: '700',
    },
  });
