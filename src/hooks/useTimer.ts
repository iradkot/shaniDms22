// Custom hooks
import {BgSample} from 'app/types/day_bgs.types';
import {useEffect, useState} from 'react';

export const useTimer = (
  latestBgSample: BgSample | undefined,
  callback: {(): void; (): void},
) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [callbackRuns, setCallbackRuns] = useState(0);

  useEffect(() => {
    const getTimeLeft = () => {
      setTimeout(() => {
        if (!latestBgSample) {
          return;
        }
        const commonTimeDiffBetweenBgReading = 5 * 60 * 1000;
        const delay = 40 * 1000;
        const updatedTimeLeft =
          latestBgSample.date +
          commonTimeDiffBetweenBgReading +
          delay -
          new Date().getTime();
        setTimeLeft(updatedTimeLeft);
      }, 1000);
    };
    getTimeLeft();
  }, [latestBgSample, timeLeft]);

  useEffect(() => {
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

  return {timeLeft};
};
