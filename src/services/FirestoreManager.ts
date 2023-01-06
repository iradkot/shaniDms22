import firestore from '@react-native-firebase/firestore';
import {BgSample} from '../types/day_bgs';
import messaging from '@react-native-firebase/messaging';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';

// FirestoreManager class is responsible for all the interactions with the FirestoreManager database
export class FirestoreManager {
  getLatestDayBgs: () => any = async () => {
    const snapshot = await firestore()
      .collection('day_bgs')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    const dayBgs = snapshot.docs.map(doc => doc.data());
    const lastDayBgs = dayBgs[0];
    const todayBgs = JSON.parse(lastDayBgs.data).filter(
      (bg: BgSample) => bg.date > new Date().setHours(0, 0, 0, 0),
    );
    // const bgParsedData = dayBgs.reduce<BgSample[]>((acc, dayBg) => {
    //   return [...acc, ...JSON.parse(dayBg.data)];
    // }, []);
    return todayBgs;
  };

  async getBgDataByDateFS(date: Date) {
    // get data for day before and day after
    const dayBefore = new Date(date);
    dayBefore.setDate(dayBefore.getDate());
    const dayAfter = new Date(date);
    dayAfter.setDate(dayAfter.getDate() + 2);

    // Retrieve documents from the day_bgs collection with timestamps between the start and end of the day in UTC time
    const snapshot = await firestore()
      .collection('day_bgs')
      .where('timestamp', '>=', dayBefore.setHours(0, 0, 0, 0))
      .where('timestamp', '<=', dayAfter.setHours(0, 0, 0, 0))
      .get();

    const dayBgs = snapshot.docs.map(doc => doc.data());
    const bgParsedData = dayBgs.reduce<BgSample[]>((acc, dayBg) => {
      return [...acc, ...JSON.parse(dayBg.data)];
    }, []);

    const localDateBgs = bgParsedData.filter((bg: BgSample) => {
      const bgDate = new Date(bg.date);
      return bgDate.getDate() === date.getDate();
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
}
