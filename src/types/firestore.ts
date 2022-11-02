import {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';

export type FirestoreDocument =
  FirebaseFirestoreTypes.QueryDocumentSnapshot<FirebaseFirestoreTypes.DocumentData>;

export const docDTOConvert = (doc: FirestoreDocument) => {
  return {
    id: doc.id,
    ...doc.data(),
  };
};
