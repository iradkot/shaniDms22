import {fetchBgDataForDateRange} from 'app/api/apiRequests';
import {BgSample} from 'app/types/day_bgs.types';
import {getFormattedStartEndOfDay} from 'app/utils/datetime.utils';

/** Compatibility entry point; source isolation, decoding and caching have one owner. */
class BGDataService {
  static fetchBgDataForDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<BgSample[]> {
    return fetchBgDataForDateRange(startDate, endDate);
  }

  static fetchBgDataForDate(date: Date): Promise<BgSample[]> {
    const {formattedStartDate, formattedEndDate} =
      getFormattedStartEndOfDay(date);
    return this.fetchBgDataForDateRange(
      new Date(formattedStartDate),
      new Date(formattedEndDate),
    );
  }
}

export default BGDataService;
