import {getApp} from '@react-native-firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  runTransaction,
} from '@react-native-firebase/firestore';
import type {AlertFirestoreGateway} from '../../../modules/alerts';

/** The only Alert Sync module coupled to the native Firestore SDK. */
export const createReactNativeFirebaseAlertsGateway =
  (): AlertFirestoreGateway => {
    const firestore = getFirestore(getApp());
    return {
      async get(documentPath) {
        const snapshot = await runTransaction(firestore, transaction =>
          transaction.get(doc(firestore, documentPath)),
        );
        const data = snapshot.data();
        return snapshot.exists() && data !== undefined
          ? {exists: true, data}
          : {exists: false};
      },
      async list(collectionPath) {
        const snapshot = await getDocs(collection(firestore, collectionPath));
        return snapshot.docs.map((candidate: {id: string; data(): unknown}) => ({
          id: candidate.id,
          data: candidate.data(),
        }));
      },
      runTransaction: operation =>
        runTransaction(firestore, transaction =>
          operation({
            get: async documentPath => {
              const snapshot = await transaction.get(
                doc(firestore, documentPath),
              );
              const data = snapshot.data();
              return snapshot.exists() && data !== undefined
                ? {exists: true, data}
                : {exists: false};
            },
            set: (documentPath, value) => {
              transaction.set(doc(firestore, documentPath), value);
            },
          }),
        ),
    };
  };
