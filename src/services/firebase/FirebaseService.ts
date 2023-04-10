import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import {BgSample} from 'src/types/day_bgs';
import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
import {FoodItemDTO} from 'app/types/food.types';
import {
  getLocalEndOfTheDay,
  getLocalStartOfTheDay,
  getUtcEndOfTheDay,
  getUtcStartOfTheDay,
} from 'app/utils/datetime.utils';
import setDate from 'date-fns/setDate';
import subMilliseconds from 'date-fns/subMilliseconds';
import {AuthService} from './services/AuthService';
import {SportItemDTO} from 'app/types/sport.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getBgDataByDate} from 'app/services/firebase/functions/getBgByDate';

// FirestoreManager class is responsible for all the interactions with the FirestoreManager database
export class FirebaseService {
  private authService = new AuthService();
  getBgDataByDate = getBgDataByDate;

  async getCurrentUserFSData() {
    const firebaseUser = await this.authService.getCurrentUser();
    const userId = firebaseUser?.uid;
    const user = await firestore().collection('users').doc(userId).get();
    if (user.exists) {
      return user.data();
    } else {
      // get phone token
      const phoneToken = await messaging().getToken();
      const email = auth().currentUser?.email;
      // create user
      this.createUserFSData(userId, phoneToken, email);

      const user = await firestore().collection('users').doc(userId).get();
      return user.data();
    }
  }

  createUserFSData(
    userId: string | undefined,
    phoneToken: string,
    email?: string | null | undefined,
  ) {
    firestore().collection('users').doc(userId).set({
      userId,
      createdAt: firestore.FieldValue.serverTimestamp(),
      phoneToken,
      email,
    });
  }

  // make a private js function that returns an image from the google storage bucket
  // It should get an id and return the image from google cloud storage

  /**
   * Get the image url from the storage bucket
   * @param {string} imageName
   * @returns {Promise<string>} url of the image in the storage bucket
   */
  async getFoodItemImage(imageName: string | undefined) {
    try {
      // Check if the image URL is already cached
      const cachedUrl = await AsyncStorage.getItem(`image-${imageName}`);
      if (cachedUrl) {
        return cachedUrl;
      }

      // If not, download the image and cache the URL
      const imageRef = storage().ref(imageName);
      const url = await imageRef.getDownloadURL();
      await AsyncStorage.setItem(`image-${imageName}`, url);
      return url;
    } catch (error) {
      // Handle errors
    }
  }

  // Define a function that returns a list of food items, and write in ts that it returns a list of food items
  async getFoodItems(date: Date): Promise<FoodItemDTO[]> {
    // FoodItemDTO[]
    const dayBefore = new Date(date);
    dayBefore.setDate(dayBefore.getDate());
    const dayAfter = new Date(date);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const snapshot = await firestore().collection('food_items').get();

    const foodItems = snapshot.docs.map(doc => doc.data() as FoodItemDTO);
    return foodItems;
  }

  async getFoodItemBgData(foodItem: FoodItemDTO): Promise<BgSample[]> {
    const currentTime = new Date();
    const startDate = new Date(foodItem.timestamp);
    startDate.setHours(startDate.getHours() - 1);
    const endDate = new Date(foodItem.timestamp);
    endDate.setHours(endDate.getHours() + 4);

    if (currentTime >= endDate) {
      const cacheKey = `bgData-${foodItem.timestamp}`;
      const cachedBgData = await AsyncStorage.getItem(cacheKey);
      if (cachedBgData) {
        return JSON.parse(cachedBgData);
      } else {
        const bgData = await this.getBgDataByDate({startDate, endDate});
        return bgData;
      }
    } else {
      const bgData = await this.getBgDataByDate({startDate, endDate});
      return bgData;
    }
  }

  async getSportItems(
    startDate?: Date,
    endDate?: Date,
  ): Promise<SportItemDTO[]> {
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Set default values for startDate and endDate if not provided
    startDate = startDate || twoWeeksAgo;
    endDate = endDate || now;

    // Set start and end times for the given dates
    const startOfStartDate = new Date(startDate);
    startOfStartDate.setHours(0, 0, 0, 0);
    const endOfEndDate = new Date(endDate);
    endOfEndDate.setHours(23, 59, 59, 999);

    const snapshot = await firestore()
      .collection('sport_items')
      .where('timestamp', '>=', startOfStartDate.getTime())
      .where('timestamp', '<=', endOfEndDate.getTime())
      .get();

    const sportItems = snapshot.docs.map(doc => doc.data() as SportItemDTO);
    return sportItems;
  }
}
