import React, {useEffect} from 'react';
import {FlatList, Text} from 'react-native';
import {FirestoreManager} from '../../../../services/FirestoreManager';
import styled from 'styled-components/native';
import {BgSample} from '../../../../types/day_bgs';
import {Timer} from './components/Timer';
import {ActionButton} from './components/ActionButton';
import {BgDataCard} from './components/BgDataCard';

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
  const bgDataKeyExtractor = (item: BgSample) => item.date.toString();
  return (
    <HomeContainer>
      <Text>Home</Text>
      <Timer bgData={bgData[0]} callback={getBgData} />
      <FlatList
        keyExtractor={bgDataKeyExtractor}
        // get last 100 bg data
        data={bgData}
        renderItem={({item, index}) => (
          <BgDataCard bgData={item} prevBgData={bgData[index + 1]} />
        )}
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
