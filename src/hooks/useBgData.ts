import {Dispatch, useEffect, useReducer} from 'react';
import {bgSortFunction} from 'app/utils/bg.utils';
import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {getFormattedStartEndOfDay} from 'app/utils/datetime.utils';

const initialState = {
  todayBgData: [],
  bgData: [],
  isLoading: false,
};

const reducer = (state: any, action: {type: any; payload: any}) => {
  switch (action.type) {
    case 'setTodayBgData':
      return {
        ...state,
        todayBgData: action.payload,
        bgData: action.payload,
        isLoading: false,
      };
    case 'setBgData':
      return {...state, bgData: action.payload, isLoading: false};
    case 'setIsLoading':
      return {...state, isLoading: action.payload};
    default:
      return state;
  }
};

const getBgDataFromNightscout = async (
  date: Date,
  setIsLoading: (loading: boolean) => void,
) => {
  setIsLoading(true);

  const {formattedStartDate, formattedEndDate} =
    getFormattedStartEndOfDay(date);
  const maxCount = 1000; // Assuming 5-minute intervals for 24 hours
  const apiUrl = `/api/v1/entries?find[dateString][$gte]=${formattedStartDate}&find[dateString][$lte]=${formattedEndDate}&count=${maxCount}`;

  try {
    const response = await nightscoutInstance.get(apiUrl);
    return response.data; // Adjust based on your actual API response structure
  } catch (error) {
    console.error('Error fetching data from Nightscout:', error);
    return [];
  }
};

// New function to encapsulate the fetching logic
async function fetchBgDataForDate(
  date: Date,
  dispatch: Dispatch<any>,
  setIsLoading: (loading: boolean) => void,
) {
  setIsLoading(true);
  const bgData = await getBgDataFromNightscout(date, setIsLoading);
  const sortedBgData = bgData.sort(bgSortFunction(false));
  dispatch({type: 'setBgData', payload: sortedBgData});
  setIsLoading(false);
}

export const useBgData = (currentDate: Date) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const setIsLoading = (loading: boolean) =>
    dispatch({type: 'setIsLoading', payload: loading});

  useEffect(() => {
    fetchBgDataForDate(currentDate, dispatch, setIsLoading).catch(error =>
      console.error('Error fetching BG data:', error),
    );
  }, [currentDate]);

  return {
    bgData: state.bgData,
    todayBgData: state.todayBgData,
    isLoading: state.isLoading,
    getUpdatedBgData: () =>
      fetchBgDataForDate(currentDate, dispatch, setIsLoading),
  };
};
