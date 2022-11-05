import React, {useEffect} from 'react';
import {Text} from 'react-native';
import styled from 'styled-components/native';
import {FirestoreManager} from 'app/services/FirestoreManager';
import {BgSample} from 'app/types/day_bgs';
import CgmCardListDisplay from 'app/components/CgmCardListDisplay/CgmCardListDisplay';
import {Timer} from './components/Timer';
import {ActionButton} from './components/ActionButton';

const HomeContainer = styled.View`
  flex: 1;
  background-color: #fff;
`;
// create dummy home component with typescript
const Home: React.FC = () => {
  const [bgData, setBgData] = React.useState<BgSample[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const getBgData: () => void = async () => {
    setIsLoading(true);
    const firestoreManager = new FirestoreManager();
    const bgData = await firestoreManager.getLatestDayBgs();
    const sortFunction = (a: BgSample, b: BgSample) => {
      return b.date - a.date;
    };
    const sortedBgData = bgData.sort(sortFunction);
    setBgData(sortedBgData.slice(0, 100));
    setIsLoading(false);
  };
  useEffect(() => {
    getBgData();
  }, []);

  return (
    <HomeContainer>
      <Text>Home</Text>
      <Timer bgData={bgData[0]} callback={getBgData} />
      <CgmCardListDisplay
        onPullToRefreshRefresh={getBgData}
        isLoading={isLoading}
        bgData={bgData}
      />
      <ActionButton
        onPress={getBgData}
        text={'Refresh'}
        isLoading={isLoading}
      />
    </HomeContainer>
  );
};

export default Home;
