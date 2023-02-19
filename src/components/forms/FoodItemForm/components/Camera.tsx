import {NavigationProp, useNavigation} from '@react-navigation/native';
import {PhotoFile} from 'react-native-vision-camera';
import {CAMERA_SCREEN} from 'app/constants/SCREEN_NAMES';

interface Props {
  onTakePhoto: (photo: PhotoFile | undefined) => void;
}

const Camera = ({onTakePhoto}: Props) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const openCamera = () => {
    navigation.navigate(CAMERA_SCREEN, {onTakePhoto});
  };
  return {openCamera};
};

export default Camera;
