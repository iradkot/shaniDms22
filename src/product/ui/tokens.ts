/**
 * Stable visual decisions shared by the rebuilt Product experience.
 *
 * Keep semantic names here. Screen-specific layout and typography belong to
 * the screen that owns them.
 */
export const productUiTokens = {
  colors: {
    page: '#F5F7FA',
    surface: '#FFFFFF',
    surfaceInfo: '#E7F1FA',
    border: '#DCE2E8',
    text: '#17202A',
    textMuted: '#5C6875',
    action: '#1769AA',
    actionText: '#FFFFFF',
    actionTextMuted: '#EAF3FA',
    danger: '#9F2D27',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    pageBottom: 48,
  },
  radii: {
    card: 16,
    featuredCard: 18,
    pill: 22,
  },
  opacity: {
    disabled: 0.55,
    pressed: 0.72,
  },
  layout: {
    contentMaxWidth: 1040,
    threeColumnMinViewportWidth: 760,
    twoColumnItemWidth: '47.5%',
    threeColumnItemWidth: '31.5%',
  },
} as const;
