import React from 'react';
import {ActivityIndicator, Text} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import styled from 'styled-components/native';

const LoaderContainer = styled.View`
  padding: 0 10px;
  flex-direction: row;
  align-items: center;
`;

const Loader = () => {
  return (
    <LoaderContainer>
      <ActivityIndicator size="large" color="#000" />
    </LoaderContainer>
  );
};

export default Loader;
