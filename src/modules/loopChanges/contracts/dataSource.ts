import type {
  TrendsGlucoseSample,
  TrendsPeriod,
} from '../../trends';
import type {LoopSettingChange} from '../domain';

/**
 * Read-only source Seam for setting history and glucose observations.
 * No mutation or therapy-setting capability is exposed to this Module.
 */
export interface LoopChangesDataSource {
  loadChanges(
    period: TrendsPeriod,
  ): Promise<readonly LoopSettingChange[]>;
  loadGlucoseSamples(
    period: TrendsPeriod,
  ): Promise<readonly TrendsGlucoseSample[]>;
}
