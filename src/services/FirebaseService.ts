import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import {BgSample} from '../types/day_bgs';
import messaging from '@react-native-firebase/messaging';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import {FoodItemDT} from 'app/types/foodItems';

// FirestoreManager class is responsible for all the interactions with the FirestoreManager database
export class FirebaseService {
  async getBgDataByDateFS(endDate: Date, startDate?: Date) {
    if (!startDate) {
      startDate = new Date(endDate);
      startDate.setHours(0, 0, 0, 0);
    }
    const utcStartDate = new Date(startDate || endDate);
    // get data for day before and day after
    const utcEndDate = new Date(endDate);

    // Retrieve documents from the day_bgs collection with timestamps between the start and end of the day in UTC time
    const snapshot = await firestore()
      .collection('day_bgs')
      .where('timestamp', '>=', utcStartDate.setHours(0, 0, 0, 0))
      .where('timestamp', '<=', utcEndDate.setHours(23, 59, 59, 999))
      .get();

    const dayBgs = snapshot.docs.map(doc => doc.data());
    const bgParsedData = dayBgs.reduce<BgSample[]>((acc, dayBg) => {
      return [...acc, ...JSON.parse(dayBg.data)];
    }, []);

    const localDateBgs = bgParsedData.filter((bg: BgSample) => {
      const bgDate = new Date(bg.date);
      if (
        bgDate.getTime() < endDate.getTime() &&
        // @ts-ignore
        bgDate.getTime() > startDate.getTime()
      ) {
        return true;
      }
      // return bgDate.getDate() === endDate.getDate();
    });
    return localDateBgs;
  }

  async getCurrentUserFSData() {
    const firebaseUser = await this.getCurrentUser();
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

  getCurrentUser: () => Promise<FirebaseAuthTypes.User | null> = async () => {
    const user = await auth().currentUser;
    return user;
  };

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
  async getFoodItems(date: Date): Promise<Array<FoodItemDT> | []> {
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

  async getFoodItemBgData(foodItem: FoodItemDT) {
    console.log('getFoodItemBgData', {foodItem});
    // get the bg data and pull 12 hours of bg data before the food item timestamp
    const startDate = new Date(foodItem.timestamp);
    startDate.setHours(startDate.getHours() - 12);
    const endDate = new Date(foodItem.timestamp);
    const bgData = await this.getBgDataByDateFS(endDate, startDate);
    return bgData;
  }
}
