import {Platform} from 'react-native';

/** Keep connection checks and data requests on the same authentication path. */
export const getNightscoutRequestAuthentication = (
  apiSecretSha1?: string,
  accessToken?: string,
): {headers: Record<string, string>; params: Record<string, string>} => {
  const credential = accessToken || apiSecretSha1;
  if (!credential) {
    return {headers: {}, params: {}};
  }
  return Platform.OS === 'web'
    ? {headers: {}, params: {[accessToken ? 'token' : 'secret']: credential}}
    : {headers: {'api-secret': credential}, params: {}};
};
