import React, {createContext, useContext, useState} from 'react';
import {SportItemDTO} from './path/to/your/SportItemDTO';

interface SportItemsContextValue {
  sportItems: SportItemDTO[];
  setSportItems: (items: SportItemDTO[]) => void;
}

const SportItemsContext = createContext<SportItemsContextValue>({
  sportItems: [],
  setSportItems: () => {},
});

export const useSportItems = () => {
  return useContext(SportItemsContext);
};

export const SportItemsProvider: React.FC = ({children}) => {
  const [sportItems, setSportItems] = useState<SportItemDTO[]>([]);

  return (
    <SportItemsContext.Provider value={{sportItems, setSportItems}}>
      {children}
    </SportItemsContext.Provider>
  );
};

export default SportItemsContext;
