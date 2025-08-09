import React, { useContext } from 'react';
import { InsulinDataEntry } from 'app/types/insulin.types';
import { GraphStyleContext } from '../../contextStores/GraphStyleContext';
import { BolusItem } from './index';

interface Props {
  insulinData: InsulinDataEntry[];
}

const BolusRenderer: React.FC<Props> = ({ insulinData }) => {
  const [focusedBolus, setFocusedBolus] = React.useState<InsulinDataEntry | null>(null);
  
  // Filter for only bolus events with valid timestamp and amount
  const bolusEvents = insulinData?.filter(
    (item) => item.type === 'bolus' && item.amount && item.timestamp
  ) || [];

  // Debug logging
  React.useEffect(() => {
    if (bolusEvents.length > 0) {
      console.log(`[BolusRenderer] Rendering ${bolusEvents.length} bolus events:`, 
        bolusEvents.map(b => `${b.amount}U at ${new Date(b.timestamp!).toLocaleTimeString()}`));
    }
  }, [bolusEvents]);

  if (!bolusEvents.length) {
    console.log('[BolusRenderer] No bolus events to display');
    return <></>;
  }

  return (
    <>
      {bolusEvents.map((bolus, index) => (
        <BolusItem
          key={`${bolus.timestamp}-${index}`}
          bolusEvent={bolus}
          isFocused={focusedBolus?.timestamp === bolus.timestamp}
          setFocusedBolus={setFocusedBolus}
        />
      ))}
    </>
  );
};

export default BolusRenderer;
