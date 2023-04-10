import {useEffect, useReducer} from 'react';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {bgSortFunction} from 'app/utils/bg.utils';

const initialState = {
  todayBgData: [],
  bgData: [],
  isLoading: false,
};
const reducer = (state, action) => {
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
const createFirebaseService = () => {
  return new FirebaseService();
};

const getBgDataByDate = async (
  date: Date,
  dispatch: any,
  setIsLoading: any,
  isToday: boolean,
) => {
  setIsLoading(true);
  const fsManager = createFirebaseService();
  const startTimestamp = new Date().getTime();
  const bgData = await fsManager.getBgDataByDate({
    endDate: date,
    getWholeDays: true,
  });
  const duration = (new Date().getTime() - startTimestamp) / 1000;
  console.log('duration of getting bg data in seconds: ', duration);

  const sortedBgData = bgData.sort(bgSortFunction(false));

  if (isToday) {
    dispatch({type: 'setTodayBgData', payload: sortedBgData});
  } else {
    dispatch({type: 'setBgData', payload: sortedBgData});
  }
  console.log('getBgDataByDate duration in seconds: ', duration);
};

export const useBgData = (currentDate: Date) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {todayBgData, bgData} = state;
  const isLoading = state.isLoading;
  const setIsLoading = (value: boolean) =>
    dispatch({type: 'setIsLoading', payload: value});

  const getBgData = async (date: Date) => {
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
