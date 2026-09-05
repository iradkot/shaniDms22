import {Platform} from 'react-native';

/** Keep connection checks and data requests on the same authentication path. */
export const getNightscoutRequestAuthentication = (
  apiSecretSha1?: string,
): {headers: Record<string, string>; params: Record<string, string>} => {
  if (!apiSecretSha1) {
    return {headers: {}, params: {}};
  }
  return Platform.OS === 'web'
    ? {headers: {}, params: {secret: apiSecretSha1}}
    : {headers: {'api-secret': apiSecretSha1}, params: {}};
};
