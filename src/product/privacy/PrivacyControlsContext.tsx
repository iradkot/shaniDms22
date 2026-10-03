import {createContext, useContext} from 'react';
export const PrivacyControlsContext = createContext<
  {readonly openPrivacy: () => void} | undefined
>(undefined);
export const usePrivacyControls = () => useContext(PrivacyControlsContext);
