// SportItemsContext.tsx
import React, {createContext, useContext, useState, useEffect} from 'react';
import {SportItemsByRelativeDate} from 'app/types/sport.types';
import useGetSportItems from 'app/hooks/sport/useGetSportItems';

interface SportItemsContextValue {
  sportItems: SportItemsByRelativeDate;
  setSportItems: (items: SportItemsByRelativeDate) => void;
  isLoading: boolean;
  isError: boolean;
}

const SportItemsContext = createContext<SportItemsContextValue>({
  sportItems: {},
  setSportItems: () => {},
  isLoading: false,
  isError: false,
});

export const useSportItems = () => {
  return useContext(SportItemsContext);
};

// Provide sport items context to children
export const SportItemsProvider = ({children}: {children: React.ReactNode}) => {
  const [sportItems, setSportItems] = useState<SportItemsByRelativeDate>({});
  const {
    sportItems: fetchedSportItems,
    isLoading,
    isError,
  } = useGetSportItems();
  useEffect(() => {
    if (fetchedSportItems) {
      setSportItems(fetchedSportItems);
    }
  }, [fetchedSportItems]);

  return (
    <SportItemsContext.Provider
      value={{sportItems, setSportItems, isLoading, isError}}>
      {children}
    </SportItemsContext.Provider>
  );
};

export default SportItemsContext;
