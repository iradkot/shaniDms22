import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {KeyManagementServiceClient} from '@google-cloud/kms';
import {onRequest} from 'firebase-functions/v2/https';

import {createShaniApiHandler} from './api';
import {FirestoreVaultRepository} from './firestoreVaultRepository';
import {FirestoreNightscoutVaultRepository} from './firestoreNightscoutVaultRepository';
import {GoogleKmsEnvelopeCipher} from './kmsEnvelopeCipher';
import {EncryptedNightscoutCredentialVault} from './nightscoutVault';
import {NightscoutUpstream} from './nightscoutUpstream';
import {OpenAiUpstream} from './openAiUpstream';
import {EncryptedCredentialVault} from './vault';

const app = initializeApp();

const commaSeparatedSet = (value: string | undefined): ReadonlySet<string> =>
  new Set(
    (value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  );

const kmsKeyName = process.env.KMS_KEY_NAME?.trim() ?? '';
const allowedModels = commaSeparatedSet(process.env.ALLOWED_LLM_MODELS);
if (!kmsKeyName) {
  throw new Error('KMS_KEY_NAME must be configured for shaniApi');
}
if (allowedModels.size === 0) {
  throw new Error('ALLOWED_LLM_MODELS must contain at least one model');
}

const envelopeCipher = new GoogleKmsEnvelopeCipher(
  new KeyManagementServiceClient(),
  kmsKeyName,
);
const firestore = getFirestore(app);
const vault = new EncryptedCredentialVault(
  new FirestoreVaultRepository(firestore),
  envelopeCipher,
);
const nightscoutVault = new EncryptedNightscoutCredentialVault(
  new FirestoreNightscoutVaultRepository(firestore),
  envelopeCipher,
);

const handler = createShaniApiHandler({
  auth: {
    verify: async token => {
      const decoded = await getAuth(app).verifyIdToken(token, true);
      return {uid: decoded.uid};
    },
  },
  vault,
  nightscoutVault,
  nightscoutUpstream: new NightscoutUpstream(),
  upstream: new OpenAiUpstream(),
  allowedModels,
  allowedOrigins: commaSeparatedSet(process.env.ALLOWED_CORS_ORIGINS),
});

export const shaniApi = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 90,
    memory: '512MiB',
    maxInstances: 20,
    concurrency: 40,
    invoker: 'public',
  },
  handler,
);
