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
  async getFoodItemImage(imageName: string) {
    try {
      const imageRef = storage().ref(imageName);
      const url = await imageRef.getDownloadURL();
      return url;
    } catch (error: any) {
      // Error getting image from storage [Error: [storage/object-not-found] No object exists at the desired reference.]
      const expectedErrors = ['storage/object-not-found'];
      if (expectedErrors.includes(error.code)) {
        // exmple image name: https://firebasestorage.googleapis.com:443/v0/b/shanidms-3a065.appspot.com/o/food_item_images%2FzZHMiF29YzFcVo1yN8GW?alt=media&token=da6c9f54-a330-48ca-b954-7f5052f7c1bc
        // we need the
        console.log('Image not found in storage', {imageName});
        return null;
      }
      console.error('Error getting image from storage', error);
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
    ];
    return dummyData;
  }
}
