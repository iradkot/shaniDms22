import {isE2E} from '../../utils/e2e';
import {isServerVaultCredentialMarker} from './shaniLlmProxy';

/** A pending replacement does not invalidate a previously confirmed key. */
export const isConfiguredAiCredential = (value: unknown): boolean =>
  isServerVaultCredentialMarker(value) ||
  (isE2E && typeof value === 'string' && value.startsWith('e2e-openai-'));
