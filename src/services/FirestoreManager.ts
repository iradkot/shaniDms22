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
      .limit(2)
      .get();
    const dayBgs = snapshot.docs.map(doc => doc.data());
    // log keys
    const bgParsedData = dayBgs.reduce<BgSample[]>((acc, dayBg) => {
      return [...acc, ...JSON.parse(dayBg.data)];
    }, []);
    return bgParsedData;
  };

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
      console.log('creating user');
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
