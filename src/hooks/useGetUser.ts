import {FirestoreManager} from 'app/services/FirestoreManager';
import {useEffect, useState} from 'react';

export const useGetUser = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);

  const getUserData = async () => {
    setIsLoading(true);
    const fsManager = new FirestoreManager();
    const userFSData = await fsManager.getCurrentUserFSData();
    setUserData(userFSData);
    setIsLoading(false);
  };

  useEffect(() => {
    getUserData();
  }, []);

  return {
    userData,
    isLoading,
    getUserData,
  };
};
