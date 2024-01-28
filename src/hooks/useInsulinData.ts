import { useEffect, useReducer } from 'react';
import { nightscoutInstance } from "app/api/shaniNightscoutInstances";
import { getFormattedStartEndOfDay } from "app/utils/datetime.utils";
import { getInsulinData, getUserProfileFromNightscout } from "app/api/apiRequests";

const initialState = {
  todayInsulinData: [],
  insulinData: [],
  basalProfileData: [],
  isLoading: false,
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'setTodayInsulinData':
      return {
        ...state,
        todayInsulinData: action.payload,
        ...action.payload,
        isLoading: false,
      };
    case 'setInsulinData':
      return { ...state, ...action.payload, isLoading: false };
    case 'setIsLoading':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
};

const getBasalProfileFromNightscout = async (date) => {
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

const getInsulinDataFromNightscout = async (date, setIsLoading) => {
  setIsLoading(true);

  const { formattedStartDate, formattedEndDate } = getFormattedStartEndOfDay(date);
  const maxCount = 1000; // 1000 insulin entries per day should be enough

  const apiUrl = `/api/v1/treatments?find[created_at][$gte]=${formattedStartDate}&find[created_at][$lte]=${formattedEndDate}&count=${maxCount}`;


  try {
    const response = await nightscoutInstance.get(apiUrl);
    return response.data; // Process this data if needed
  } catch (error) {
    console.error('Error fetching insulin data from Nightscout:', error);
    return [];
  }
};

const getInsulinDataByDate = async (date, dispatch, setIsLoading, isToday) => {
  setIsLoading(true);
  let insulinData: string = '';
  let basalProfileData = [];
  try {
    setIsLoading(true);
    insulinData = await getInsulinData(date);
    basalProfileData = await getUserProfileFromNightscout(date);
  } finally {
    setIsLoading(false);
  }
  if (isToday) {
    dispatch({ type: 'setTodayInsulinData', payload: { insulinData, basalProfileData } });
  } else {
    dispatch({ type: 'setInsulinData', payload: { insulinData, basalProfileData } });
  }
};

export const useInsulinData = (currentDate) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { todayInsulinData, insulinData, basalProfileData, isLoading } = state;
  const setIsLoading = (value) => dispatch({ type: 'setIsLoading', payload: value });

  const getInsulinData = async (date) => {
    const isToday = new Date().getFullYear() === currentDate.getFullYear() &&
      new Date().getMonth() === currentDate.getMonth() &&
      new Date().getDate() === currentDate.getDate();

    await getInsulinDataByDate(date, dispatch, setIsLoading, isToday);
  };

  const getInsulinDataForToday = async () => {
    await getInsulinData(currentDate);
  };

  useEffect(() => {
    getInsulinDataForToday();
  }, [currentDate]);

  // Additional logic or functions related to insulin data can be added here

  return {
    insulinData,
    basalProfileData,
    todayInsulinData,
    isLoading,
    getInsulinData,
    getUpdatedInsulinData: getInsulinDataForToday,
  };
};
