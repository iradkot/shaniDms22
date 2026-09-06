import type {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import type {GestureResponderEvent, LayoutChangeEvent} from 'react-native';
import type {BgSample} from 'app/types/day_bgs.types';
import type {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import type {ChartLoadSample} from 'app/utils/chartLoadSeries.utils';
import type {ChartDataAvailability} from 'app/components/charts/miniChartData';

/** Tooltip state exposed to parent when `tooltipPlacement="none"`. */
export type StackedChartsTooltipModel = {
  visible: boolean;
  anchorTimeMs: number;
  bgSample: BgSample | null;
  activeInsulinU: number | null;
  activeInsulinBolusU: number | null;
  activeInsulinBasalU: number | null;
  cobG: number | null;
  basalRateUhr: number | null;
  bolusSummary: {count: number; totalU: number};
  carbsSummary: {count: number; totalG: number};
  bolusEvents: any[];
  carbEvents: any[];
  fullWidth: boolean;
  maxWidthPx?: number | undefined;
};

export type StackedChartsTouchSession = {
  handlePageTouchMove: (event: GestureResponderEvent) => void;
  handlePageTouchEnd: () => void;
  handlePageTouchCancel: () => void;
};

export type StackedHomeChartsProps = {
  /** Language used by the reusable chart labels and tooltip. */
  locale?: 'en' | 'he' | undefined;
  bgSamples: BgSample[];
  loadSamples?: readonly ChartLoadSample[] | undefined;
  dataAvailability?: ChartDataAvailability | undefined;
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[] | undefined;
  basalProfileData?: BasalProfile | undefined;

  width: number;

  /**
   * Height (px) of the CGM graph.
   */
  cgmHeight: number;

  /**
   * Height (px) of each mini chart (basal + active insulin).
   */
  miniChartHeight: number;
  /** Compact overview keeps every series visible; expanded details stay available. */
  compact?: boolean;
  onHeaderLayout?: ((event: LayoutChangeEvent) => void) | undefined;
  onInsulinLayout?: ((event: LayoutChangeEvent) => void) | undefined;

  /**
   * Optional override for the x-axis time domain.
   *
   * When not provided, the domain is derived from the BG sample extent.
   */
  xDomain?: [Date, Date] | null | undefined;

  /**
   * Optional time used when there is no active touch.
   *
   * Home uses this to anchor the tooltip to the latest BG.
   */
  fallbackAnchorTimeMs?: number | undefined;

  /**
   * Shared margin for stacked charts.
   *
   * Passing the same left/right margins ensures all charts map time -> x pixels identically.
   */
  margin?: ChartMargin;

  /**
   * Whether to show a fullscreen button overlay.
   */
  showFullScreenButton?: boolean;

  /**
   * Called when the fullscreen button is pressed.
   */
  onPressFullScreen?: () => void;

  /**
   * Optional E2E selector.
   */
  testID?: string | undefined;

  /**
   * Controls where the unified tooltip is positioned.
   *
   * - `above` (default): renders above the CGM chart (absolute, overflows upward).
   * - `inside`: renders inside the CGM chart area (useful for fullscreen screens that
   *   clip overflow).
   * - `top`: renders above the chart in **normal document flow** (no absolute positioning,
   *   takes up layout space — ideal for inline expanded cards like the FoodTracker).
   * - `panel`: a persistent compact inspector; selection never shifts the plots.
   * - `none`: suppresses tooltip rendering inside this component. Use `onTooltipModelChange`
   *   to render the tooltip externally (e.g., as a Home-level overlay).
   */
  tooltipPlacement?: 'above' | 'inside' | 'top' | 'panel' | 'none';

  /**
   * Controls horizontal alignment when `tooltipPlacement="inside"`.
   */
  tooltipAlign?: 'left' | 'right' | 'auto';

  /**
   * When false, the tooltip sizes to its content (useful for landscape).
   */
  tooltipFullWidth?: boolean;

  /**
   * Optional max width for the tooltip container (px).
   * Useful in fullscreen landscape to avoid covering charts.
   */
  tooltipMaxWidthPx?: number | undefined;

  /**
   * Controls how mini charts are displayed.
   *
   * - `separate` (default): Basal, active insulin and active carbs in distinct lanes.
   * - `mixed`: One time plot with labelled independent scales for these three series.
   * Delivered bolus doses retain their own lane in both modes.
   */
  chartMode?: 'separate' | 'mixed';

  /**
   * Called whenever the tooltip model changes.
   * Use with `tooltipPlacement="none"` to render the tooltip externally.
   */
  onTooltipModelChange?:
    | ((model: StackedChartsTooltipModel) => void)
    | undefined;

  /**
   * Registers a page-level touch session while a chart touch is active.
   *
   * Scrolling preserves this session. Released when the finger lifts or touch
   * cancels. Native paired chart surfaces observe the scroll gesture directly.
   */
  onTouchSessionChange?:
    | ((session: StackedChartsTouchSession | null) => void)
    | undefined;
};
