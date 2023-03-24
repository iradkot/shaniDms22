import React from 'react';
import styled from 'styled-components/native';
import {Theme} from 'app/types/theme';

export const Container = styled.View<{theme: Theme}>`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

export const Separator = styled.View<{theme: Theme}>`
  height: 10px;
  width: 100%;
  //background-color: #eee;
`;

export const BackgroundImage = styled.ImageBackground<{theme: Theme}>`
  position: absolute;
  top: 0;
  left: 0;
  flex: 1;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
`;

export const EmptyListText = styled.Text<{theme: Theme}>`
  color: ${props => props.theme.white};
  font-size: ${props => props.theme.textSize * 1.5}px;
  font-weight: bold;
  text-align: center;
`;

export const SectionHeader = styled.Text`
  font-size: 18px;
  font-weight: bold;
  margin-top: 16px;
  margin-bottom: 8px;
  padding-left: 16px;
  color: #fff;
`;
