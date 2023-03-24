import {Theme} from 'app/types/theme';
import styled from 'styled-components/native';

export const ScrollContainer = styled.ScrollView`
  background-color: ${({theme}: {theme: Theme}) => theme.backgroundColor};
  flex: 1;
  max-height: 100%;
`;

export const Container = styled.View`
  background-color: ${({theme}: {theme: Theme}) => theme.backgroundColor};
  flex: 1;
  max-height: 100%;
`;

export const Section = styled.View``;
