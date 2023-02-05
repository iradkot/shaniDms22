import {useWindowDimensions} from 'react-native';

const useIsLandscape = () => {
  const {width, height} = useWindowDimensions();
  const isHorizontal = width > height;
  return isHorizontal;
};

export default useIsLandscape;
