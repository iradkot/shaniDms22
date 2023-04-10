import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import isToday from 'date-fns/isToday';
import {
  getLocalEndOfTheDay,
  getLocalStartOfTheDay,
  getUtcEndOfTheDay,
  getUtcStartOfTheDay,
} from 'app/utils/datetime.utils';
import setDate from 'date-fns/setDate';
import subMilliseconds from 'date-fns/subMilliseconds';

const getCachedBgData = async (cacheKey: string) => {
  const cachedData = await AsyncStorage.getItem(cacheKey);
  return cachedData ? JSON.parse(cachedData) : null;
};

const cacheBgData = (cacheKey: string, bgData: any) => {
  AsyncStorage.setItem(cacheKey, JSON.stringify(bgData));
};

const getBgDataFromFirestore = async (utcStart: Date, utcEnd: Date) => {
  const snapshot = await firestore()
    .collection('day_bgs')
    .where('timestamp', '>=', utcStart.getTime())
    .where('timestamp', '<=', utcEnd.getTime())
    .get();
  return snapshot.docs.map(doc => JSON.parse(doc.data().data));
};

export const getBgDataByDate = async ({
  startDate,
  endDate,
  getWholeDays = false,
}: {
  startDate?: Date;
  endDate: Date;
  getWholeDays?: boolean;
}) => {
  if (!startDate) {
    startDate = subMilliseconds(setDate(endDate, endDate.getDate()), 1);
  }

  let localStart = startDate,
    localEnd = endDate;
  if (getWholeDays) {
    localStart = getLocalStartOfTheDay(startDate);
    localEnd = getLocalEndOfTheDay(endDate);
  }

  const utcStart = getUtcStartOfTheDay(localStart);
  const utcEnd = getUtcEndOfTheDay(localEnd);

  const cacheKey = `bgData-${localStart.getTime()}-${localEnd.getTime()}-${getWholeDays}`;

  if (!isToday(endDate)) {
    const cachedData = await getCachedBgData(cacheKey);
    if (cachedData) {
      return cachedData;
    }
  }

  const bgData = await getBgDataFromFirestore(utcStart, utcEnd);
  const localData = bgData.flat().filter(bg => {
    const date = new Date(bg.date);
    return date >= localStart && date <= localEnd;
  });

  if (!isToday(endDate)) {
    cacheBgData(cacheKey, localData);
  }
  return localData;
};
