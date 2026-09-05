import {getApp} from '@react-native-firebase/app';
import {
  Timestamp,
  collection,
  doc,
  documentId,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAt,
  where,
} from '@react-native-firebase/firestore';
import type {
  JournalFirestoreCommitTime,
  JournalFirestoreGateway,
} from './firebaseJournalRemoteAdapter';

const commitTime = (value: unknown): JournalFirestoreCommitTime => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    'nanoseconds' in value &&
    typeof value.seconds === 'number' &&
    typeof value.nanoseconds === 'number'
  ) {
    return {seconds: value.seconds, nanoseconds: value.nanoseconds};
  }
  return {seconds: Number.NaN, nanoseconds: Number.NaN};
};

interface OperationDocumentSnapshot {
  readonly id: string;
  data(): Readonly<Record<string, unknown>>;
}

/** The only module that knows the React Native Firebase Firestore API. */
export const createReactNativeFirebaseJournalGateway =
  (): JournalFirestoreGateway => {
    const firestore = getFirestore(getApp());
    return {
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
            serverTimestamp,
          }),
        ),
      async listOperations(input) {
        const operations = collection(firestore, input.collectionPath);
        const ordered =
          input.entryId !== undefined
            ? query(operations, where('entryId', '==', input.entryId))
            : input.after === undefined
            ? query(
                operations,
                orderBy('committedAt', 'asc'),
                orderBy(documentId(), 'asc'),
              )
            : query(
                operations,
                orderBy('committedAt', 'asc'),
                orderBy(documentId(), 'asc'),
                startAt(
                  new Timestamp(
                    input.after.committedAt.seconds,
                    input.after.committedAt.nanoseconds,
                  ),
                ),
              );
        const snapshot = await getDocs(ordered);
        const documents =
          snapshot.docs as unknown as readonly OperationDocumentSnapshot[];
        return documents
          .map(operationDocument => {
            const data = operationDocument.data();
            return {
              operationId: operationDocument.id,
              committedAt: commitTime(data.committedAt),
              data,
            };
          })
          .sort((left, right) => {
            if (left.committedAt.seconds !== right.committedAt.seconds) {
              return left.committedAt.seconds - right.committedAt.seconds;
            }
            if (
              left.committedAt.nanoseconds !== right.committedAt.nanoseconds
            ) {
              return (
                left.committedAt.nanoseconds - right.committedAt.nanoseconds
              );
            }
            return left.operationId.localeCompare(right.operationId);
          });
      },
    };
  };
