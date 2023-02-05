import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import {BgSample} from 'src/types/day_bgs';
import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
import {FoodItemDTO} from 'app/types/foodItems';
import {
  getLocalEndOfTheDay,
  getLocalStartOfTheDay,
  getUtcEndOfTheDay,
  getUtcStartOfTheDay,
} from 'app/utils/datetime.utils';
import setDate from 'date-fns/setDate';
import subMilliseconds from 'date-fns/subMilliseconds';
import {AuthService} from './services/AuthService';

// FirestoreManager class is responsible for all the interactions with the FirestoreManager database
export class FirebaseService {
  private authService: AuthService;

  constructor() {
    // inject the firebase service
    // this is the firebase service
    this.authService = new AuthService();
  }

  async getBgDataByDateFS(endDate: Date, startDate?: number | Date) {
    if (!startDate) {
      // set utc start date to the local start of the endDate day
      const localStartDate = setDate(endDate, endDate.getDate());
      startDate = subMilliseconds(localStartDate, 1);
    }
    const localStartDateStartOfDay = getLocalStartOfTheDay(startDate);
    // get data for day before and day after
    const localEndDateEndOfDay = getLocalEndOfTheDay(endDate);

    const utcStartDateStartOfDay = getUtcStartOfTheDay(
      localStartDateStartOfDay,
    );
    const utcEndDateEndOfDay = getUtcEndOfTheDay(localEndDateEndOfDay);

    // Retrieve documents from the day_bgs collection with timestamps between the start and end of the day in UTC time
    const snapshot = await firestore()
      .collection('day_bgs')
      .where('timestamp', '>=', utcStartDateStartOfDay.getTime())
      .where('timestamp', '<=', utcEndDateEndOfDay.getTime())
      .get();

    const dayBgs = snapshot.docs.map(doc => doc.data());
    const bgParsedData = dayBgs.reduce<BgSample[]>((acc, dayBg) => {
      return [...acc, ...JSON.parse(dayBg.data)];
    }, []);
    console.log({dayBgs});

    const localDateBgs = bgParsedData.filter((bg: BgSample) => {
      const bgDate = new Date(bg.date);
      if (
        bgDate.getTime() <= localEndDateEndOfDay.getTime() &&
        bgDate.getTime() >= localStartDateStartOfDay.getTime()
      ) {
        return true;
      }
    });
    return localDateBgs;
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
    } catch (error) {
      console.error('Error getting image from storage', error);
    }
  }

  // Define a function that returns a list of food items, and write in ts that it returns a list of food items
  async getFoodItems(
    date: Date,
  ): Promise<FirebaseFirestoreTypes.DocumentData[]> {
    // FoodItemDTO[]
    const dayBefore = new Date(date);
    dayBefore.setDate(dayBefore.getDate());
    const dayAfter = new Date(date);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const snapshot = await firestore().collection('food_items').get();
    // .where('timestamp', '>=', dayBefore.setHours(0, 0, 0, 0))
    // .where('timestamp', '<=', dayAfter.setHours(0, 0, 0, 0))

    const foodItems = snapshot.docs.map(doc => doc.data());
    return foodItems;
  }

  async getFoodItemBgData(foodItem: FoodItemDTO): Promise<BgSample[]> {
    // get the bg data and pull 12 hours of bg data before the food item timestamp
    const startDate = new Date(foodItem.timestamp);
    startDate.setHours(startDate.getHours() - 4);
    const endDate = new Date(foodItem.timestamp);
    const bgData = await this.getBgDataByDateFS(endDate, startDate);
    return bgData;
  }
}
