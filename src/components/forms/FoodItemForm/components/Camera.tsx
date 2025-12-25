import {NavigationProp, useNavigation} from '@react-navigation/native';
import { CameraCapturedPicture } from 'expo-camera';
import {CAMERA_SCREEN} from 'app/constants/SCREEN_NAMES';

interface Props {
  onTakePhoto: (photo: CameraCapturedPicture | undefined) => void;
}

const Camera = ({onTakePhoto}: Props) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const openCamera = () => {
    navigation.navigate(CAMERA_SCREEN, { screen: CAMERA_SCREEN, params: { onTakePhoto } });
  };
  return {openCamera};
};

export default Camera;
