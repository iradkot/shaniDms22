import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {BG_DATA_URL, INSULIN_DATA_URL} from './urls';
import {getFormattedStartEndOfDay} from 'app/utils/datetime.utils';

export const getInsulinData = async date => {
  const {formattedStartDate, formattedEndDate} =
    getFormattedStartEndOfDay(date);
  const maxCount = 1000;
  return `/api/v1/treatments?find[created_at][$gte]=${formattedStartDate}&find[created_at][$lte]=${formattedEndDate}&count=${maxCount}`;
};

export const getUserProfileFromNightscout = async (date) => {
  const formattedDate = new Date(date).toISOString();
  const apiUrl = `/api/v1/profile?find[date][$eq]=${formattedDate}`;
  try {
    const response = await nightscoutInstance.get(apiUrl);
    return response.data; // Filter or process as needed based on the response structure
  } catch (error) {
    console.error('Error fetching basal profile data from Nightscout:', error);
    return [];
  }
};


export const getBgData = async date => {
  try {
    const {formattedStartDate, formattedEndDate} =
      getFormattedStartEndOfDay(date);
    const maxCount = 288;
    return `/api/v1/entries?find[dateString][$gte]=${formattedStartDate}&find[dateString][$lte]=${formattedEndDate}&count=${maxCount}`;
  } catch (error) {
    console.error('Error fetching data from Nightscout:', error);
    return [];
  }
};
