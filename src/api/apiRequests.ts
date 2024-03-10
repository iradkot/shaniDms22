import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {BG_DATA_URL, INSULIN_DATA_URL} from './urls';
import {getFormattedStartEndOfDay} from 'app/utils/datetime.utils';
import {
  ProfileDataType,
  TempBasalInsulinDataEntry,
} from 'app/types/insulin.types';

export const getInsulinData = async date => {
  const {formattedStartDate, formattedEndDate} =
    getFormattedStartEndOfDay(date);
  const maxCount = 1000;
  return `/api/v1/treatments?find[created_at][$gte]=${formattedStartDate}&find[created_at][$lte]=${formattedEndDate}&count=${maxCount}`;
};

export const getInsulinDataFromNightscout = async (
  dateStr: string,
  setIsLoading: (isLoading: boolean) => void = () => {},
): Promise<TempBasalInsulinDataEntry[]> => {
  // Adjusted return type to match expected data structure
  try {
    setIsLoading(true);
    const response = await fetch(
      `https://shani-cgm.herokuapp.com/api/v1/treatments?find[created_at][$gte]=${dateStr}T00:00:00Z&find[created_at][$lte]=${dateStr}T23:59:59Z&count=10`,
    );
    if (!response.ok) throw new Error('Failed to fetch insulin data');
    const data: TempBasalInsulinDataEntry[] = await response.json(); // Ensure the type matches what you expect based on the API response
    setIsLoading(false);
    return data; // Ensure this data is in the format your application expects
  } catch (error) {
    setIsLoading(false);
    console.error('Error fetching insulin data:', error);
    throw error; // Propagate error up for handling elsewhere
  }
};

export const getUserProfileFromNightscout = async (
  date: string,
): Promise<ProfileDataType> => {
  // Date conversion if needed
  const formattedDate = date.split('T')[0]; // Assuming you need just the date part in YYYY-MM-DD format

  // Constructing the API URL with the formatted date
  const apiUrl = `/api/v1/profiles?find[startDate][$lt]=${formattedDate}T23:59:59.999Z&find[startDate][$gt]=${formattedDate}T00:00:00.000Z&sort[startDate]=-1&count=10`;

  try {
    // Using the nightscoutInstance to perform the GET request
    const response = await nightscoutInstance.get(apiUrl);
    if (response.status !== 200) {
      throw new Error('Failed to fetch profile data');
    }
    // Assuming the response data directly matches the ProfileDataType structure
    return response.data as ProfileDataType;
  } catch (error) {
    console.error('Error fetching basal profile data from Nightscout:', error);
    throw error; // Propagate the error for handling elsewhere
  }
};
