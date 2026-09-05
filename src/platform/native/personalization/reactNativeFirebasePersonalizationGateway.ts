import {getApp} from '@react-native-firebase/app';
import {
  doc,
  getDoc,
  getFirestore,
  runTransaction,
} from '@react-native-firebase/firestore';
import type {PersonalizationFirestoreGateway} from './firebaseProductPersonalizationRemoteAdapter';

/** The only personalization module coupled to the native Firestore SDK. */
export const createReactNativeFirebasePersonalizationGateway =
  (): PersonalizationFirestoreGateway => {
    const firestore = getFirestore(getApp());
    return {
      async get(documentPath) {
        const snapshot = await getDoc(doc(firestore, documentPath));
        const data = snapshot.data();
        return snapshot.exists() && data !== undefined
          ? {exists: true, data}
          : {exists: false};
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
