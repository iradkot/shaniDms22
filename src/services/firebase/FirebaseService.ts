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

// FirestoreManager class is responsible for all the interactions with the FirestoreManager database
export class FirebaseService {
  private authService = new AuthService();

  async getBgDataByDate({
    startDate,
    endDate,
    getWholeDays = false,
  }: {
    startDate?: Date;
    endDate: Date;
    getWholeDays?: boolean;
  }) {
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

    const snapshot = await firestore()
      .collection('day_bgs')
      .where('timestamp', '>=', utcStart.getTime())
      .where('timestamp', '<=', utcEnd.getTime())
      .get();

    const bgData = snapshot.docs.map(doc => JSON.parse(doc.data().data));
    const localData = bgData.flat().filter(bg => {
      const date = new Date(bg.date);
      return date >= localStart && date <= localEnd;
    });
    return localData;
  }

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
    // get the bg data and pull 12 hours of bg data before the food item timestamp
    const startDate = new Date(foodItem.timestamp);
    startDate.setHours(startDate.getHours() - 1);
    const endDate = new Date(foodItem.timestamp);
    endDate.setHours(endDate.getHours() + 4);
    const bgData = await this.getBgDataByDate({startDate, endDate});
    return bgData;
  }

  async getSportItems(date: Date): Promise<SportItemDTO[]> {
    // FoodItemDTO[]
    // const dayBefore = new Date(date);
    // dayBefore.setDate(dayBefore.getDate());
    // const dayAfter = new Date(date);
    // dayAfter.setDate(dayAfter.getDate() + 2);
    //
    // const snapshot = await firestore().collection('sport_items').get();
    //
    // const sportItems = snapshot.docs.map(doc => doc.data() as SportItemDTO);
    // return sportItems;
    const dummyData = [
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 5,
        // 1st May 2021
        timestamp: 1620000000000,
      },
      {
        name: 'Fighting',
        durationMinutes: 30,
        intensity: 4,
        // 2nd May 2021
        timestamp: 1620086400000,
      },
      {
        name: 'Running',
        durationMinutes: 60,
        intensity: 3,
        // 3rd May 2021
        timestamp: 1620172800000,
      },
      {
        name: 'Swimming',
        durationMinutes: 30,
        intensity: 2,
        // 4th May 2021
        timestamp: 1620259200000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 1,
        // 5th May 2021
        timestamp: 1620345600000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 5,
        // 6th May 2021
        timestamp: 1620432000000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 4,
        // 7th May 2021
        timestamp: 1620518400000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 3,
        // 8th May 2021
        timestamp: 1620604800000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 2,
        // 9th May 2021
        timestamp: 1620691200000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 1,
        // 10th May 2021
        timestamp: 1620777600000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 5,
        // 11th May 2021
        timestamp: 1620864000000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 4,
        // 12th May 2021
        timestamp: 1620950400000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 3,
        // 13th May 2021
        timestamp: 1621036800000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 2,
        // 14th May 2021
        timestamp: 1621123200000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 1,
        // 15th May 2021
        timestamp: 1621209600000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 5,
        // 16th May 2021
        timestamp: 1621296000000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 4,
        // 17th May 2021
        timestamp: 1621382400000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 3,
        // 18th May 2021
        timestamp: 1621468800000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 2,
        // 19th May 2021
        timestamp: 1621555200000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 1,
        // 20th May 2021
        timestamp: 1621641600000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 5,
        // 21st May 2021
        timestamp: 1621728000000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 4,
        // 22nd May 2021
        timestamp: 1621814400000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 3,
        // 23rd May 2021
        timestamp: 1621900800000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 2,
        // 24th May 2021
        timestamp: 1621987200000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 1,
        // 25th May 2021
        timestamp: 1622073600000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 5,
        // 26th May 2021
        timestamp: 1622160000000,
      },
      {
        name: 'Running',
        durationMinutes: 30,
        intensity: 4,
        // 27th May 2021
        timestamp: 1622246400000,
      },
    ];
    return dummyData;
  }
}
