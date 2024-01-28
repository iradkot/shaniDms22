import {useEffect, useReducer} from 'react';
import {bgSortFunction} from 'app/utils/bg.utils';
import { nightscoutInstance } from 'app/api/shaniNightscoutInstances';
import { getFormattedStartEndOfDay } from 'app/utils/datetime.utils';


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
  setIsLoading: (arg0: boolean) => void,
) => {
  setIsLoading(true);

  const { formattedStartDate, formattedEndDate } = getFormattedStartEndOfDay(date);
  const maxCount = 288; // 5-minute intervals for 24 hours
  const apiUrl = `/api/v1/entries?find[dateString][$gte]=${formattedStartDate}&find[dateString][$lte]=${formattedEndDate}&count=${maxCount}`;

  try {
    const response = await nightscoutInstance.get(apiUrl);
    return response.data; // Process this data if needed
  } catch (error) {
    console.error('Error fetching data from Nightscout:', error);
    return [];
  }
};
const getBgDataByDate = async (
  date: any,
  dispatch: {(value: any): void; (arg0: {type: string; payload: any}): void},
  setIsLoading: {(value: any): void; (arg0: boolean): void},
  isToday: boolean,
) => {
  setIsLoading(true);
  const bgData = await getBgDataFromNightscout(date, setIsLoading);

  const sortedBgData = bgData.sort(bgSortFunction(false)); // Assuming bgSortFunction is defined elsewhere

  if (isToday) {
    dispatch({type: 'setTodayBgData', payload: sortedBgData});
  } else {
    dispatch({type: 'setBgData', payload: sortedBgData});
  }
};

export const useBgData = (currentDate: unknown) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {todayBgData, bgData} = state;
  const isLoading = state.isLoading;
  const setIsLoading = (value: any) =>
    dispatch({type: 'setIsLoading', payload: value});

  const getBgData = async (date: any) => {
    const isToday =
      new Date().getFullYear() === currentDate.getFullYear() &&
      new Date().getMonth() === currentDate.getMonth() &&
      new Date().getDate() === currentDate.getDate();

    await getBgDataByDate(date, dispatch, setIsLoading, isToday);
  };

  const getBgDataForToday = async () => {
    await getBgData(currentDate);
  };

  useEffect(() => {
    getBgDataForToday();
  }, [currentDate]);

  const latestBgSample = todayBgData[0];
  const latestPrevBgSample = todayBgData[1];

  return {
    bgData,
    todayBgData,
    isLoading,
    getBgData,
    latestBgSample,
    latestPrevBgSample,
    getUpdatedBgData: getBgDataForToday,
  };
};
