import { MaterialIcons } from '@expo/vector-icons';
import React, {useEffect, useRef, useState} from 'react';
import { Text } from 'react-native';
import { Camera, CameraType, CameraCapturedPicture } from 'expo-camera';
import styled from 'styled-components/native';
import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';

type CameraScreenNavigationProp = RouteProp<{
  CameraScreen: { onTakePhoto: (photo: CameraCapturedPicture | undefined) => void };
}>;

type Props = {
  navigation: CameraScreenNavigationProp;
};

const CameraScreen: React.FC<Props> = () => {
  const camera = useRef<Camera>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const navigation = useNavigation();
  const route = useRoute<CameraScreenNavigationProp>();
  const {params} = route;

  if (!params || !params.onTakePhoto) {
    throw new Error(
      'The "onTakePhoto" parameter is missing in the navigation route.',
    );
  }

  const {onTakePhoto} = params;

  const getCameraPermission = async () => {
    const status = await Camera.getCameraPermissionStatus();
    if (status !== 'authorized') {
      const newStatus = await Camera.requestCameraPermission();
      if (newStatus !== 'authorized') {
        console.log('Camera permission not granted');
        setHasCameraPermission(false);
      } else {
        console.log('Camera permission granted');
        setHasCameraPermission(true);
      }
    } else {
      setHasCameraPermission(true);
    }
  };

  useEffect(() => {
    getCameraPermission();
  }, []);

  if (hasCameraPermission === null) {
    return <Text>No permission or not supported device</Text>;
  }
  if (hasCameraPermission === false) {
    return <Text>No permission to camera</Text>;
  }

  const takePicture = async () => {
    const photo = await camera.current?.takePictureAsync({ quality: 0.8 });
    onTakePhoto && onTakePhoto(photo);
    navigation.goBack();
  };

  return (
    <Container>
      <Camera
        style={{flex: 1}}
        type={CameraType.back}
        ref={camera}
      />
      <CameraControls>
        <TakePictureButton onPress={takePicture}>
          <MaterialIcons name="photo-camera" size={30} color="#fff" />
        </TakePictureButton>
      </CameraControls>
    </Container>
  );
};

const Container = styled.View`
  flex: 1;
  background: #00008b;
  height: 100%;
  width: 100%;
`;

const CameraControls = styled.View`
  width: 100%;
  background-color: transparent;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 10px;
  position: absolute;
  bottom: 0;
`;

const TakePictureButton = styled.TouchableOpacity`
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50px;
  width: 60px;
  height: 60px;
  align-items: center;
  justify-content: center;
`;

export default CameraScreen;
