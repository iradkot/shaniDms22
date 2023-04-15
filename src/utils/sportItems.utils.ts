import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {
  formatDateToDateAndTimeString,
  getRelativeDateText,
} from 'app/utils/datetime.utils';
import {formattedSportItemDTO, SportItemDTO} from 'app/types/sport.types';

export const formatSportItem = async (
  item: SportItemDTO,
  fsManager: FirebaseService,
): Promise<formattedSportItemDTO> => {
  if (!item?.startTimestamp) {
    item.startTimestamp = item.timestamp;
  }
  const formattedItem = item as formattedSportItemDTO;
  const startDate = new Date(item.startTimestamp);
  startDate.setHours(startDate.getHours() - 1);
  const endDate = new Date(item.endTimestamp);
  endDate.setHours(endDate.getHours() + 3);
  formattedItem.bgData = await fsManager.getBgDataByDate({
    startDate,
    endDate,
  });
  formattedItem.localDateString = formatDateToDateAndTimeString(
    item.startTimestamp,
  );
  if (!item.durationMinutes) {
    formattedItem.durationMinutes = Math.round(
      (item.endTimestamp - item.startTimestamp) / 1000 / 60,
    );
  }
  return formattedItem;
};

export const fetchSportItems = async setSportItems => {
  const fsManager = new FirebaseService();
  const FSsportItems = await fsManager.getSportItems();
  const updatedSportItems = await Promise.all(
    FSsportItems.map((item: SportItemDTO) => {
      return formatSportItem(item, fsManager);
    }),
  );
  const sortedSportItems = updatedSportItems.sort((a, b) => {
    return b.startTimestamp - a.startTimestamp;
  });
  const groupedSportItems = sortedSportItems.reduce((grouped, item) => {
    const relativeDateText = getRelativeDateText(new Date(item.startTimestamp));
    if (!grouped[relativeDateText]) {
      grouped[relativeDateText] = [];
    }
    grouped[relativeDateText].push(item);
    return grouped;
  }, {});
  setSportItems(groupedSportItems);
};
