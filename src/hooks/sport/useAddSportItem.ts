import {useState} from 'react';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {
  addDoc,
  collection,
  getFirestore,
} from '@react-native-firebase/firestore';
import {SportItemDTO} from 'app/types/sport.types';

const useAddSportItem = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const addSportItem = async (sportItemDTO: SportItemDTO) => {
    setIsLoading(true);
    setError(null);

    try {
      const app = getApp();
      const user = getAuth(app).currentUser;
      if (!user) {
        throw new Error('Sign in before saving an activity.');
      }
      await addDoc(
        collection(
          getFirestore(app),
          'users',
          user.uid,
          'legacySportItems',
        ),
        {
          ...sportItemDTO,
          schemaVersion: 1,
          ownerProductUserId: user.uid,
        },
      );
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
