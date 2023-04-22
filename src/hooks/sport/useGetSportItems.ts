// useGetSportItems.ts
import {useQuery} from 'react-query';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {formatSportItem} from 'app/utils/sportItems.utils';
import {getRelativeDateText} from 'app/utils/datetime.utils';

const useGetSportItems = () => {
  const fsManager = new FirebaseService();

  const fetchSportItems = async () => {
    const FSsportItems = await fsManager.getSportItems();
    const updatedSportItems = await Promise.all(
      FSsportItems.map(item => {
        return formatSportItem(item, fsManager);
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
  } = useQuery('sportItems', fetchSportItems);

  return {sportItems, isLoading, isError};
};

export default useGetSportItems;
