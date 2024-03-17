import {useEffect, useReducer, Dispatch} from 'react';
import {bgSortFunction} from 'app/utils/bg.utils';
import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {getFormattedStartEndOfDay} from 'app/utils/datetime.utils';
import {BgSample} from 'app/types/day_bgs.types';
import BGDataService from 'app/api/firebase/services/BGDataService';

interface State {
  todayBgData: BgSample[];
  bgData: BgSample[];
  isLoading: boolean;
  latestBgSample: BgSample | null;
  latestPrevBgSample: BgSample | null;
}

type Action =
  | {type: 'setBgData'; payload: BgSample[]; isToday: boolean}
  | {type: 'setIsLoading'; payload: boolean}
  | {
      type: 'setLatestSamples';
      payload: {latest: BgSample | null; previous: BgSample | null};
    };

const initialState: State = {
  todayBgData: [],
  bgData: [],
  isLoading: false,
  latestBgSample: null,
  latestPrevBgSample: null,
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'setBgData':
      const isToday = action.isToday;
      if (isToday) {
        const latest = action.payload[0] || null;
        const previous = action.payload[1] || null;
        return {
          ...state,
          bgData: action.payload,
          todayBgData: action.payload,
          latestBgSample: latest,
          latestPrevBgSample: previous,
          isLoading: false,
        };
      }
      return {...state, bgData: action.payload, isLoading: false};
    case 'setIsLoading':
      return {...state, isLoading: action.payload};
    default:
      return state;
  }
};
async function fetchBgDataForDate(
  date: Date,
  dispatch: Dispatch<Action>,
  setIsLoading: Dispatch<boolean>,
) {
  setIsLoading(true);
  const bgData = await BGDataService.fetchBgDataForDate(date);
  const sortedBgData = bgData.sort(bgSortFunction(false));

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  setIsLoading(false);
  dispatch({type: 'setBgData', payload: sortedBgData, isToday: isToday});
}

export const useBgData = (currentDate: Date) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const setIsLoading = (loading: boolean) =>
    dispatch({type: 'setIsLoading', payload: loading});

  useEffect(() => {
    fetchBgDataForDate(currentDate, dispatch, setIsLoading).catch(error => {
      console.error('Error fetching bg data:', error);
    });
  }, [currentDate]);

  return {
    ...state,
    getUpdatedBgData: () =>
      fetchBgDataForDate(currentDate, dispatch, setIsLoading),
  };
};
