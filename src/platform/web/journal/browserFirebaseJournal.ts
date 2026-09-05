import {createFirebaseJournalRemoteAdapter} from '../../native/journal/firebaseJournalRemoteAdapter';
import type {JournalRemoteAdapter} from '../../../modules/journal';
import type {BrowserFirebaseAuth} from '../auth';
import type {ReturnTypeOfFirestoreRestGateway} from '../types';

export const createBrowserFirebaseJournalRemoteAdapter = (input: {
  readonly gateway: ReturnTypeOfFirestoreRestGateway;
  readonly auth: Pick<BrowserFirebaseAuth, 'getIdentity'>;
}): JournalRemoteAdapter =>
  createFirebaseJournalRemoteAdapter({
    gateway: input.gateway,
    authenticatedUid: () => input.auth.getIdentity()?.uid ?? null,
  });
