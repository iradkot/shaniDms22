// useInsulinData.ts
import {useEffect, useReducer} from 'react';
import {
  getInsulinDataFromNightscout,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {InsulinDataState, InsulinDataAction} from 'app/types/insulin.types';
import extractDailyBasalInsulinPlan from 'app/utils/insulin.utils/extractDailyBasalInsulinPlan';

// Assuming the initialState structure matches your needs
const initialState: InsulinDataState = {
  todayInsulinData: [],
  insulinData: [],
  basalProfileData: [],
  isLoading: false,
  error: null,
};

const reducer = (
  state: InsulinDataState,
  action: InsulinDataAction,
): InsulinDataState => {
  switch (action.type) {
    case 'setTodayInsulinData':
    case 'setInsulinData':
      return {...state, ...action.payload, isLoading: false};
    case 'setIsLoading':
      return {...state, isLoading: action.payload};
    case 'setError':
      return {...state, isLoading: false, error: action.payload};
    default:
      return state;
  }
};

// Placeholder for the assumed getBasalProfileFromNightscout function
// Replace with your actual implementation
async function getBasalProfileFromNightscout(dateStr: string): Promise<number> {
  const userProfile = await getUserProfileFromNightscout(dateStr);
  // Assuming the userProfile has a property 'store' which contains the basal profile
  const basalProfile = userProfile.store.basal;

  // Assuming the basalProfile is an array of TimeValueEntry
  const startDate = new Date(dateStr);
  const endDate = new Date(dateStr);
  endDate.setDate(endDate.getDate() + 1); // Add one day to the start date

  const totalBasal = extractDailyBasalInsulinPlan(
    basalProfile,
    startDate,
    endDate,
  );

  return totalBasal;
}

export const useInsulinData = (
  currentDate: Date,
): InsulinDataState & {refreshData: () => Promise<void>} => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setIsLoading = (isLoading: boolean) =>
    dispatch({type: 'setIsLoading', payload: isLoading});

  const fetchData = async () => {
    setIsLoading(true);
    const dateStr = currentDate.toISOString().split('T')[0]; // Ensure date is in the correct format for querying
    try {
      const insulinData = await getInsulinDataFromNightscout(dateStr);
      const basalProfileData = await getBasalProfileFromNightscout(dateStr);

      dispatch({
        type:
          new Date().toDateString() === currentDate.toDateString()
            ? 'setTodayInsulinData'
            : 'setInsulinData',
        payload: {insulinData, basalProfileData},
      });
    } catch (error) {
      dispatch({
        type: 'setError',
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  return {
    ...state,
    refreshData: fetchData,
  };
};
