// Components that shows timer until next bg reading ( 5 minutes since last reading)
// if there is no bg reading after 5 minutes, it will show a button to refresh the data
// and handle loading state
import React, {useEffect} from 'react';
import {BgSample} from '../../../../../types/day_bgs';
import {Text, View} from 'react-native';

export const Timer: React.FC<{
  latestBgSample: BgSample;
  callback: () => void;
}> = ({latestBgSample, callback}) => {
  /**
   * @param {number} time - time in milliseconds
   */
  const [timeLeft, setTimeLeft] = React.useState<number>(0);
  const [callbackRuns, setCallbackRuns] = React.useState<number>(0);
  React.useState<boolean>(false);
  // get the time left until next bg reading
  const getTimeLeft: () => void = () => {
    setTimeout(() => {
      if (!latestBgSample) {
        return;
      }
      const commonTimeDiffBetweenBgReading = 5 * 60 * 1000;
      const delay = 40 * 1000;
      const timeLeft =
        latestBgSample.date +
        commonTimeDiffBetweenBgReading +
        delay -
        new Date().getTime();
      setTimeLeft(timeLeft);
    }, 1000);
  };
  useEffect(() => {
    getTimeLeft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestBgSample, timeLeft]);

  useEffect(() => {
    // callback shoud run once for every 1 minutes since time has passed
    if (timeLeft > 0 && callbackRuns > 0) {
      setCallbackRuns(0);
    } else {
      const expectedCallbackRuns = Math.floor(timeLeft / 60 / 1000) * -1;
      if (expectedCallbackRuns > callbackRuns) {
        setCallbackRuns(expectedCallbackRuns);
        callback();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, callbackRuns]);

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        borderWidth: 1,
        borderColor: 'black',
        padding: 10,
      }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: 'bold',
          color: 'red',
        }}>
        seconds left: {Math.floor(timeLeft / 1000)}
      </Text>
      <Text
        onPress={callback}
        style={{
          fontSize: 20,
          fontWeight: 'bold',
          color: 'blue',
        }}>
        Refresh
      </Text>
    </View>
  );
};
