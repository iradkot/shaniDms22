import {Theme} from 'app/types/theme';
import styled from 'styled-components/native';
import gymImage from 'app/assets/woman_in_gym.png';
import runningImage from 'app/assets/woman_running_strong.png';

export const Container = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
`;

export const sportTypeBackground = {
  GYM: gymImage,
  RUNNING: runningImage,
};
