// Components that shows timer until next bg reading ( 5 minutes since last reading)
// if there is no bg reading after 5 minutes, it will show a button to refresh the data
// and handle loading state
import React, {useEffect} from 'react';
import {BgSample} from '../../../../../types/day_bgs';
import {Text, View} from 'react-native';

export const Timer: React.FC<{bgData: BgSample; callback: () => void}> = ({
  bgData,
  callback,
}) => {
  const [timeLeft, setTimeLeft] = React.useState<number>(0);
  const [isTimerVisible, setIsTimerVisible] = React.useState<boolean>(false);
  const [isButtonVisible, setIsButtonVisible] = React.useState<boolean>(false);
  const [shouldRunCallback, setShouldRunCallback] =
    React.useState<boolean>(false);
  // get the time left until next bg reading
  const getTimeLeft: () => void = () => {
    setTimeout(() => {
      if (!bgData) {
        setIsButtonVisible(true);
        return;
      }
      const currentTime = new Date().getTime();
      const timeLeft = bgData.date + 300000 - currentTime;
      if (timeLeft > 0) {
        setIsTimerVisible(true);
        setTimeLeft(timeLeft);
      } else {
        /**
         * Time steps of running the callback function
         * 1. 0 - 1 minutes passed - make a request every 5 seconds
         * 2. 1 - 2 minutes passed - make a request every 10 seconds
         * 3. 2 - 5 minutes passed - make a request every 30 seconds
         * 4. 5 - 10 minutes passed - make a request every 1 minute
         * 5. 10 - 20 minutes passed - make a request every 2 minutes
         * 6. 20 - 30 minutes passed - make a request every 5 minutes
         * 7. 30 - 60 minutes passed - make a request every 10 minutes
         * 8. 60(1 hour) - 120(2 hours) minutes passed - make a request every 30 minutes
         * 9. 2 hours - 4 hours passed - make a request every 1 hour
         * 10. 4 hours - 8 hours passed - make a request every 2 hours
         * 11. 8 hours - 12 hours passed - make a request every 3 hours
         * 12. 12 hours - 24 hours passed - make a request every 6 hours
         * 13. 24(1 day) - 48(2 days) hours passed - make a request every 12 hours
         * 14. 2 days - 3 days passed - make a request every 1 day
         * 15. 3 days - 7 days passed - make a request every 2 days
         * 16. 7 days - 14 days passed - make a request every 3 days
         */
        const timePassedInSeconds = (timeLeft * -1) / 1000;
        const timePassedInMinutes = timePassedInSeconds / 60;
        if (timePassedInMinutes > 5 && timePassedInMinutes < 7) {
          callback();
        }
      }
    }, 1000);
  };
  useEffect(() => {
    getTimeLeft();
  }, [bgData, timeLeft]);
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        borderWidth: 1,
        borderColor: 'black',
        padding: 10,
      }}>
      {isTimerVisible && (
        <Text
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: 'red',
          }}>
          seconds left: {Math.floor(timeLeft / 1000)}
        </Text>
      )}
      {isButtonVisible && (
        <Text
          onPress={callback}
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: 'blue',
          }}>
          Refresh
        </Text>
      )}
    </View>
  );
};
