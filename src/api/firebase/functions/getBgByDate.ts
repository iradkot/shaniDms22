import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
} from '@react-native-firebase/firestore';
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
import {BgSample} from 'app/types/day_bgs.types';

function isBgSample(value: unknown): value is BgSample {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const sample = value as Record<string, unknown>;
  return (
    typeof sample.sgv === 'number' &&
    typeof sample.date === 'number' &&
    typeof sample.dateString === 'string' &&
    typeof sample.trend === 'number' &&
    typeof sample.direction === 'string' &&
    typeof sample.device === 'string' &&
    typeof sample.type === 'string'
  );
}

function parseBgSamples(serialized: string): BgSample[] {
  const parsed: unknown = JSON.parse(serialized);
  return Array.isArray(parsed) ? parsed.filter(isBgSample) : [];
}

const getCachedBgData = async (
  cacheKey: string,
): Promise<BgSample[] | null> => {
  const cachedData = await AsyncStorage.getItem(cacheKey);
  if (!cachedData) {
    return null;
  }

  try {
    return parseBgSamples(cachedData);
  } catch {
    return null;
  }
};

const cacheBgData = async (
  cacheKey: string,
  bgData: readonly BgSample[],
): Promise<void> => {
  await AsyncStorage.setItem(cacheKey, JSON.stringify(bgData));
};

const getBgDataFromFirestore = async (
  utcStart: Date,
  utcEnd: Date,
): Promise<BgSample[][]> => {
  const db = getFirestore();
  const q = query(
    collection(db, 'day_bgs'),
    where('timestamp', '>=', utcStart.getTime()),
    where('timestamp', '<=', utcEnd.getTime()),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc: {data(): unknown}) => {
    const value = doc.data();
    if (!value || typeof value !== 'object') {
      return [];
    }

    const serialized = (value as Record<string, unknown>).data;
    if (typeof serialized !== 'string') {
      return [];
    }

    try {
      return parseBgSamples(serialized);
    } catch {
      return [];
    }
  });
};

export const getBgDataByDate = async ({
  startDate,
  endDate,
  getWholeDays = false,
}: {
  startDate?: Date;
  endDate: Date;
  getWholeDays?: boolean;
}): Promise<BgSample[]> => {
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

  const cacheKey =
    `bgData-${localStart.getTime()}-${localEnd.getTime()}-` +
    String(getWholeDays);

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
    await cacheBgData(cacheKey, localData);
  }
  return localData;
};
