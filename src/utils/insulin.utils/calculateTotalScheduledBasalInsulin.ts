import {ProfileDataEntry, TimeValueEntry} from 'src/types/insulin.types';

export const calculateTotalScheduledBasalInsulin = (
  basalProfileData: ProfileDataEntry[],
): number => {
  let totalScheduledBasalInsulin = 0;

  basalProfileData.forEach(profile => {
    const basalRates: TimeValueEntry[] | undefined =
      profile.store?.[profile.defaultProfile]?.basal;
    if (basalRates) {
      basalRates.forEach(rate => {
        const duration =
          (rate.timeAsSeconds - (basalRates[0]?.timeAsSeconds || 0)) / 3600; // Convert seconds to hours
        totalScheduledBasalInsulin += rate.value * duration;
      });
    }
  });

  return totalScheduledBasalInsulin;
};
