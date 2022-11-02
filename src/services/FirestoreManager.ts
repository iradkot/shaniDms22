import firestore from '@react-native-firebase/firestore';
import {BgSample} from '../types/day_bgs';

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
    // Todo once we wimplement users collections use the following:
    // const user = await auth().currentUser;
    // if (user) {
    //   const uid = user.uid;
    //   const snapshot = await firestore()
    //     .collection('users')
    //     .doc(uid)
    //     .collection('bg')
    //     .orderBy('timestamp', 'desc')
    //     .limit(1)
    //     .get();
    //   const data = snapshot.docs.map(doc => doc.data());
    //   return data[0];
    // }
  };

  getNotifications() {}
}
