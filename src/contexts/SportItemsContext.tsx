// SportItemsContext.tsx
import React, {createContext, useContext, useState, useEffect} from 'react';
import {SportItemDTO} from 'app/types/sport.types';
import useGetSportItems from 'app/hooks/sport/useGetSportItems';

interface SportItemsContextValue {
  sportItems: SportItemDTO[];
  setSportItems: (items: SportItemDTO[]) => void;
  isLoading: boolean;
  isError: boolean;
}

const SportItemsContext = createContext<SportItemsContextValue>({
  sportItems: [],
  setSportItems: () => {},
  isLoading: false,
  isError: false,
});

export const useSportItems = () => {
  return useContext(SportItemsContext);
};

export const SportItemsProvider: React.FC = ({ children }) => {
  const [sportItems, setSportItems] = useState<SportItemDTO[]>([]);
  const {
    sportItems: fetchedSportItems,
    isLoading,
    isError,
  } = useGetSportItems();
  console.log('SportItemsProvider: render, isLoading=', isLoading, 'isError=', isError);

  useEffect(() => {
    if (fetchedSportItems && Array.isArray(fetchedSportItems)) {
      setSportItems(fetchedSportItems as SportItemDTO[]);
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
