import FirebaseService from 'app/api/firebase/FirebaseService';
import {
  formatDateToDateAndTimeString,
  getRelativeDateText,
} from 'app/utils/datetime.utils';
import {
  formattedSportItemDTO,
  SportItemDTO,
  SportItemsByRelativeDate,
} from 'app/types/sport.types';
import {getBgDataByDate} from 'app/api/firebase/functions/getBgByDate';

export const formatSportItem = async (
  item: SportItemDTO,
): Promise<formattedSportItemDTO> => {
  const legacyTimestamp = (item as SportItemDTO & {timestamp?: number})
    .timestamp;
  const startTimestamp = Number.isFinite(item.startTimestamp)
    ? item.startTimestamp
    : Number.isFinite(legacyTimestamp)
      ? (legacyTimestamp as number)
      : item.endTimestamp - Math.max(0, item.durationMinutes) * 60_000;
  const startDate = new Date(startTimestamp);
  startDate.setHours(startDate.getHours() - 1);
  const endDate = new Date(item.endTimestamp);
  endDate.setHours(endDate.getHours() + 3);
  const bgData = await getBgDataByDate({
    startDate,
    endDate,
  });
  const durationMinutes = item.durationMinutes > 0
    ? item.durationMinutes
    : Math.max(0, Math.round((item.endTimestamp - startTimestamp) / 60_000));

  return {
    ...item,
    startTimestamp,
    durationMinutes,
    bgData,
    localDateString: formatDateToDateAndTimeString(startTimestamp),
  };
};

export const fetchSportItems = async (
  setSportItems: (items: SportItemsByRelativeDate) => void,
): Promise<void> => {
  const FSsportItems = await FirebaseService.getSportItems();
  const updatedSportItems = await Promise.all(
    FSsportItems.map((item: SportItemDTO) => {
      return formatSportItem(item);
    }),
  );
  const sortedSportItems = updatedSportItems.sort((a, b) => {
    return b.startTimestamp - a.startTimestamp;
  });
  const groupedSportItems = sortedSportItems.reduce<SportItemsByRelativeDate>((grouped, item) => {
    const relativeDateText = getRelativeDateText(new Date(item.startTimestamp));
    const itemsForDate = grouped[relativeDateText] ?? [];
    itemsForDate.push(item);
    grouped[relativeDateText] = itemsForDate;
    return grouped;
  }, {});
  setSportItems(groupedSportItems);
};
