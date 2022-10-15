import React, {useEffect} from 'react';
import {View, Text, FlatList} from 'react-native';
import {FirestoreManager} from '../services/FirestoreManager';
import styled from 'styled-components/native';
// create dummy home component with typescript
const Home: React.FC = () => {
  const [bgData, setBgData] = React.useState<BgSample[]>([]);
  const getBgData: () => void = async () => {
    const firestoreManager = new FirestoreManager();
    const bgData = await firestoreManager.getLatestDayBgs();
    const sortedBgData = bgData.sort((a, b) => {
      return b.date - a.date;
    });
    setBgData(sortedBgData);
  };
  useEffect(() => {
    getBgData();
  }, []);
  console.log('////////////////');
  console.log(bgData);
  return (
    <View>
      <Text>Home</Text>
      <FlatList
        data={bgData}
        renderItem={({item}) => <BgDataCard bgData={item} />}
      />
    </View>
  );
};

const DataRowContainer = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom-width: 1px;
  border-bottom-color: #ccc;
`;

const DataRowText = styled.Text`
  font-size: 16px;
`;

const BgDataCard = ({bgData}: {bgData: BgSample}) => {
  return (
    <DataRowContainer>
      <DataRowText>{bgData.sgv}</DataRowText>
      <DataRowText>{bgData.direction}</DataRowText>
      <DataRowText>{new Date(bgData.date).toLocaleString()}</DataRowText>
    </DataRowContainer>
  );
};

export default Home;
