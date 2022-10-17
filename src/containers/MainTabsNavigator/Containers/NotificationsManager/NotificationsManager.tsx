// create a screen with crud operations to manage notifications
//
// Language: typescript
// Path: src/containers/MainTabsNavigator/Containers/NotificationsManager/NotificationsManager.tsx
import React from 'react';
import {Text} from 'react-native';
import styled from 'styled-components/native';

const NotificationsManagerContainer = styled.View`
  flex: 1;
  background-color: #fff;
`;
// create dummy home component with typescript
const NotificationsManager: React.FC = () => {
  return (
    <NotificationsManagerContainer>
      <Text>Notifications Manager</Text>
    </NotificationsManagerContainer>
  );
};

export default NotificationsManager;
