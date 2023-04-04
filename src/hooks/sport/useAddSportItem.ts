import { useState } from 'react';
import firestore from '@react-native-firebase/firestore';
import { SportItemDTO } from "app/types/sport.types";

const useAddSportItem = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const addSportItem = async (sportItemDTO: SportItemDTO) => {
    setIsLoading(true);
    setError(null);

    try {
      await firestore().collection('sport_items').add(sportItemDTO);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    addSportItem,
    isLoading,
    error,
  };
};

export default useAddSportItem;
