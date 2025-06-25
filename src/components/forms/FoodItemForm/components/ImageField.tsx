import * as S from 'app/components/forms/FoodItemForm/FoodItemForm.styles';
import React, {useMemo} from 'react';
import {NavigationProp} from '@react-navigation/native';
import { CameraCapturedPicture } from 'expo-camera';
import {CAMERA_SCREEN} from 'app/constants/SCREEN_NAMES';
import {imagePathToUri} from 'app/utils/image.utils';
import styled from 'styled-components/native';
import { MaterialIcons } from '@expo/vector-icons';
import {ThemeType} from 'app/types/theme';

interface ImageFieldProps {
  photo: CameraCapturedPicture | {uri: string} | undefined;
  navigation: NavigationProp<any>;
  onTakePhoto: (photo: CameraCapturedPicture) => void;
  initialSource?: {uri: string};
}

const ImageField = ({
  photo,
  onTakePhoto,
  navigation,
  initialSource,
}: ImageFieldProps) => {
  const openCamera = () => {
    navigation.navigate(CAMERA_SCREEN, {
      onTakePhoto,
    });
  };

  // Type guard to check if the photo is a CameraCapturedPicture
  const isPhotoFile = (
    photo: CameraCapturedPicture | {uri: string} | undefined,
  ): photo is CameraCapturedPicture => {
    return (photo as CameraCapturedPicture)?.uri !== undefined;
  };

  const photoPath = isPhotoFile(photo) ? photo.uri : undefined;
  const source = useMemo(() => {
    return (photoPath && {uri: imagePathToUri(photoPath)}) || initialSource;
  }, [photoPath, initialSource]);

  return (
    <Container>
      {source ? (
        <>
          <Image source={source} />
          <RetakeButtonContainer>
            <RetakeButton onPress={openCamera}>
              <MaterialIcons name="camera-alt" size={25} color="#ffffff" />
              <RetakeButtonText>Retake</RetakeButtonText>
            </RetakeButton>
          </RetakeButtonContainer>
        </>
      ) : (
        <TakePictureContainer>
          <TakePictureButton onPress={openCamera}>
            <MaterialIcons name="camera-alt" size={40} color="#ffffff" />
          </TakePictureButton>
          <TakePictureText>Take a picture</TakePictureText>
        </TakePictureContainer>
      )}
    </Container>
  );
};

const Container = styled.View<{theme: ThemeType}>`
  flex: 1;
  height: 200px;
  width: 100%;
  background: ${props => props.theme.backgroundColor};
  align-items: center;
  justify-content: center;
`;

const TakePictureContainer = styled.View<{theme: ThemeType}>`
  align-items: center;
  justify-content: center;
`;

const TakePictureButton = styled.TouchableOpacity<{theme: ThemeType}>`
  background-color: ${props => props.theme.accentColor};
  border-radius: 50px;
  width: 60px;
  height: 60px;
  align-items: center;
  justify-content: center;
`;

const TakePictureText = styled.Text<{theme: ThemeType}>`
  color: ${props => props.theme.textColor};
  font-size: 18px;
  margin-top: 10px;
`;

const Image = styled.Image`
  width: 100%;
  height: 100%;
`;

const RetakeButtonContainer = styled.View`
  position: absolute;
  bottom: 0;
  right: 0;
`;

const RetakeButton = styled.TouchableOpacity`
  background-color: #3f51b5;
  border-radius: 25px;
  padding: 5px;
  margin: 10px;
  width: 100px;
  height: 50px;
  justify-content: center;
  align-items: center;
  flex-direction: row;
`;

const RetakeButtonText = styled.Text`
  font-size: 18px;
  color: white;
`;

export default ImageField;
