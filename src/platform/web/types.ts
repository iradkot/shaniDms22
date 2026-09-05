import type {JournalFirestoreGateway} from '../native/journal/firebaseJournalRemoteAdapter';
import type {PersonalizationFirestoreGateway} from '../native/personalization/firebaseProductPersonalizationRemoteAdapter';

export type ReturnTypeOfFirestoreRestGateway = JournalFirestoreGateway &
  PersonalizationFirestoreGateway;
