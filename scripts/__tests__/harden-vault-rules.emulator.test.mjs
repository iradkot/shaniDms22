import {after, before, test} from 'node:test';
import {assertFails, assertSucceeds, initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection, deleteDoc, doc, getDoc, getDocs, setDoc} from 'firebase/firestore';
import {LEGACY_FIRESTORE_RULES, protectVaultRules} from '../harden-vault-rules.mjs';

let legacy;
let hardened;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Run this test through the Firestore emulator.');
  const [host, port] = address.split(':');
  legacy = await initializeTestEnvironment({projectId: 'demo-vault-legacy', firestore: {host, port: Number(port), rules: LEGACY_FIRESTORE_RULES}});
  hardened = await initializeTestEnvironment({projectId: 'demo-vault-hardened', firestore: {host, port: Number(port), rules: protectVaultRules(LEGACY_FIRESTORE_RULES)}});
  for (const environment of [legacy, hardened]) {
    await environment.withSecurityRulesDisabled(async context => {
      for (const path of ['privateCredentialVault/owner', 'privateCredentialVault/owner/secrets/llm-openai',
        'users/owner', 'users/owner/legacyFoodItems/meal', 'notifications/item']) {
        await setDoc(doc(context.firestore(), path), {marker: 'synthetic'});
      }
    });
  }
});
after(async () => { await legacy?.cleanup(); await hardened?.cleanup(); });

test('reproduces broad authenticated access to another users vault in legacy production rules', async () => {
  const database = legacy.authenticatedContext('other-user').firestore();
  await assertSucceeds(getDoc(doc(database, 'privateCredentialVault/owner/secrets/llm-openai')));
  await assertSucceeds(setDoc(doc(database, 'privateCredentialVault/owner/secrets/llm-openai'), {marker: 'overwrite'}));
});

test('blocks own and other vault roots, nested documents, lists, updates and deletes', async () => {
  for (const context of [hardened.authenticatedContext('owner'), hardened.authenticatedContext('other-user'), hardened.unauthenticatedContext()]) {
    const database = context.firestore();
    for (const path of ['privateCredentialVault/owner', 'privateCredentialVault/owner/secrets/llm-openai', 'privateCredentialVault/owner/secrets/new']) {
      await assertFails(getDoc(doc(database, path)));
      await assertFails(setDoc(doc(database, path), {marker: 'denied'}));
      await assertFails(deleteDoc(doc(database, path)));
    }
    await assertFails(getDocs(collection(database, 'privateCredentialVault')));
    await assertFails(getDocs(collection(database, 'privateCredentialVault/owner/secrets')));
  }
});

test('preserves authenticated legacy reads and writes outside the vault', async () => {
  const database = hardened.authenticatedContext('any-existing-user').firestore();
  for (const path of ['users/owner', 'users/owner/legacyFoodItems/meal', 'notifications/item']) {
    await assertSucceeds(getDoc(doc(database, path)));
    await assertSucceeds(setDoc(doc(database, path), {marker: 'legacy'}));
    await assertSucceeds(deleteDoc(doc(database, path)));
  }
  await assertFails(getDoc(doc(hardened.unauthenticatedContext().firestore(), 'users/owner')));
});
