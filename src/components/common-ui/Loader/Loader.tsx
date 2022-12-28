import React from 'react';
import {Text} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import styled from 'styled-components/native';

const LoaderContainer = styled.View`
  padding: 0 10px;
`;

const Loader = () => {
  return (
    <LoaderContainer>
      <Text>
        <Icon name="circle-o-notch" size={24} />
      </Text>
    </LoaderContainer>
  );
};

export default Loader;
