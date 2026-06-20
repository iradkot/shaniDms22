import type {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import type {BgSample} from 'app/types/day_bgs.types';
import type {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';

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
  maxWidthPx?: number;
};

export type StackedHomeChartsProps = {
  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];
  basalProfileData?: BasalProfile;

  width: number;

  /**
   * Height (px) of the CGM graph.
   */
  cgmHeight: number;

  /**
   * Height (px) of each mini chart (basal + active insulin).
   */
  miniChartHeight: number;

  /**
   * Optional override for the x-axis time domain.
   *
   * When not provided, the domain is derived from the BG sample extent.
   */
  xDomain?: [Date, Date] | null;

  /**
   * Optional time used when there is no active touch.
   *
   * Home uses this to anchor the tooltip to the latest BG.
   */
  fallbackAnchorTimeMs?: number;

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
  testID?: string;

  /**
   * Controls where the unified tooltip is positioned.
   *
   * - `above` (default): renders above the CGM chart (absolute, overflows upward).
   * - `inside`: renders inside the CGM chart area (useful for fullscreen screens that
   *   clip overflow).
   * - `top`: renders above the chart in **normal document flow** (no absolute positioning,
   *   takes up layout space — ideal for inline expanded cards like the FoodTracker).
   * - `none`: suppresses tooltip rendering inside this component. Use `onTooltipModelChange`
   *   to render the tooltip externally (e.g., as a Home-level overlay).
   */
  tooltipPlacement?: 'above' | 'inside' | 'top' | 'none';

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
  tooltipMaxWidthPx?: number;

  /**
   * Controls how mini charts are displayed.
   *
   * - `separate` (default): Three distinct mini charts stacked vertically.
   * - `mixed`: Single overlaid area chart combining basal, IOB, and COB.
   */
  chartMode?: 'separate' | 'mixed';

  /**
   * Called whenever the tooltip model changes.
   * Use with `tooltipPlacement="none"` to render the tooltip externally.
   */
  onTooltipModelChange?: (model: StackedChartsTooltipModel) => void;
};
