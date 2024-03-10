import firestore from '@react-native-firebase/firestore';
import {SportItemDTO} from 'app/types/sport.types';
import {
  getLocalStartOfTheDay,
  getLocalEndOfTheDay,
} from 'app/utils/datetime.utils';

export class SportService {
  /**
   * Fetch sport items within a specified date range.
   *
   * @param startDate The start date of the range.
   * @param endDate The end date of the range.
   * @returns A promise that resolves to an array of SportItemDTO.
   */
  async getSportItems(
    startDate?: Date,
    endDate?: Date,
  ): Promise<SportItemDTO[]> {
    // Define the start and end dates if they are not provided
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    startDate = startDate || twoWeeksAgo;
    endDate = endDate || now;

    // Convert start and end dates to the beginning of the start date and the end of the end date
    const startOfStartDate = getLocalStartOfTheDay(startDate);
    const endOfEndDate = getLocalEndOfTheDay(endDate);

    // Fetch sport items from Firestore
    const snapshot = await firestore()
      .collection('sport_items')
      .where('timestamp', '>=', startOfStartDate)
      .where('timestamp', '<=', endOfEndDate)
      .get();

    // Map over the documents and cast them to SportItemDTO
    const sportItems = snapshot.docs.map(doc => doc.data() as SportItemDTO);

    return sportItems;
  }
}
