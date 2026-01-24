import {BgSample} from 'app/types/day_bgs.types';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {InsulinDataEntry} from 'app/types/insulin.types';

export type ChartMargin = {top: number; right: number; bottom: number; left: number};

/**
 * Payload emitted by `CgmGraph` when `tooltipMode="external"`.
 *
 * Timestamps are in epoch milliseconds.
 *
 * Notes:
 * - `touchTimeMs` is the raw time derived from the finger position.
 * - `anchorTimeMs` is reserved for parent-level snapping/normalization.
 *   Today we emit them equal and let parents decide how to anchor across charts.
 */
export type CGMGraphExternalTooltipPayload = {
  touchTimeMs: number;
  anchorTimeMs: number;
};

export interface CgmGraphProps {
  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];
  width: number;
  height: number;

  /** Optional margin override so stacked charts can share exact x-axis alignment. */
  margin?: ChartMargin;

  /**
   * Optional override for the x-axis time domain.
   *
   * When not provided, the domain is derived from the BG sample extent.
   */
  xDomain?: [Date, Date] | null;

  /**
   * Optional formatter for x-axis tick labels.
   *
   * When not provided, ticks default to locale time strings.
   */
  xTickLabelFormatter?: ((date: Date) => string) | null;

  /** Whether to show the date labels row at the top of the plot. Defaults to true. */
  showDateLabels?: boolean;

  /**
   * Optional E2E selector.
   *
   * We keep this optional so the chart can be reused in lists/cards without forcing unique IDs.
   */
  testID?: string;

  /** Whether to show the fullscreen button. Defaults to true. */
  showFullScreenButton?: boolean;

  /**
   * Tooltip rendering mode.
   * - `internal`: render tooltips inside this chart (default)
   * - `external`: suppress internal tooltips; emit tooltip info via `onTooltipChange`
   */
  tooltipMode?: 'internal' | 'external';

  /**
   * When `tooltipMode="external"`, emits tooltip timing info so a parent can render
   * a single unified tooltip for multiple charts.
   */
  onTooltipChange?: (payload: CGMGraphExternalTooltipPayload | null) => void;

  /**
   * Optional external cursor time (ms).
   *
   * When provided together with `tooltipMode="external"`, this becomes the single
   * source of truth for the vertical focus line.
   */
  cursorTimeMs?: number | null;
}
