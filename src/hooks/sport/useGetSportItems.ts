// useGetSportItems.ts
import {useQuery} from 'react-query';
import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import FirebaseService from 'app/api/firebase/FirebaseService';
import {formatSportItem} from 'app/utils/sportItems.utils';
import {getRelativeDateText} from 'app/utils/datetime.utils';

const useGetSportItems = () => {
  // Only log the authenticated UID to avoid verbose object dumps
  const authInstance = getAuth(getApp());
  console.log('useGetSportItems: UID=', authInstance.currentUser?.uid);
  const fetchSportItems = async () => {
    const FSsportItems = await FirebaseService.getSportItems();
    const updatedSportItems = await Promise.all(
      FSsportItems.map(item => {
        return formatSportItem(item);
      }),
    );
    const sortedSportItems = updatedSportItems.sort((a, b) => {
      return b.startTimestamp - a.startTimestamp;
    });
    const groupedSportItems = sortedSportItems.reduce((grouped, item) => {
      const relativeDateText = getRelativeDateText(
        new Date(item.startTimestamp),
      );
      if (!grouped[relativeDateText]) {
        grouped[relativeDateText] = [];
      }
      grouped[relativeDateText].push(item);
      return grouped;
    }, {});
    return groupedSportItems;
  };

  const {
    data: sportItems,
    isLoading,
    isError,
  } = useQuery('sportItems', fetchSportItems, {
    // Only fetch sport items when a user is authenticated
    enabled: Boolean(authInstance.currentUser),
  });

  return {sportItems, isLoading, isError};
};

export default useGetSportItems;
