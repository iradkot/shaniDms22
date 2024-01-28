import React from 'react';
import styled, {useTheme} from 'styled-components/native';
import {InsulinDataType, BasalProfileDataType} from 'app/types/insulin.types'; // Assuming this is your insulin data type
import LinearGradient from 'react-native-linear-gradient';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  findHighestAndLowestIOB,
  calculateBasalBolusRatio,
  calculateAverageInsulinUsage,
  calculateTimeInRange,
  // ... other necessary imports for calculations
} from 'app/utils/insulin.utils';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';
import calculateTotalScheduledBasal from 'app/utils/insulin.utils/calculateTotalScheduledBasal';

const Container = styled.View`
  padding: 5px 10px;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  flex-wrap: wrap;
  background-color: ${props => props.theme.backgroundColor};
`;

const GradientColumn = styled(LinearGradient).attrs(({theme}) => ({
  colors: [
    'rgba(255, 255, 255, 0.1)',
    theme.primaryColor, // Replace with your theme's colors
    theme.secondaryColor, // Replace with your theme's colors
  ],
  // Add other props as needed
}))`
  flex-direction: column;
  align-items: center;
  padding: 10px;
  height: 100%;
  flex: 1;
  border-radius: 5px;
  margin: 2.5px;
`;

const ValueText = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: ${props => props.theme.textColor};
`;

const LabelText = styled.Text`
  font-size: 16px;
  color: #333;
  margin: 4px 0;
  font-family: Courier New;
  font-weight: bold;
`;

const TimeValueText = styled(ValueText)`
  font-size: 16px;
  font-family: Courier New;
`;

interface InsulinStatsRowProps {
  insulinData: InsulinDataType[];
  basalProfileData: BasalProfileDataType[];
}

export const InsulinStatsRow: React.FC<InsulinStatsRowProps> = ({
  insulinData,
  basalProfileData,
}) => {
  if (!insulinData || insulinData.length === 0) {
    return null;
  }

  const dateOfLatestInsulinData = new Date(
    insulinData[insulinData.length - 1].time,
  );
  const endOfDayForLatestInsulinData = new Date(
    dateOfLatestInsulinData.getFullYear(),
    dateOfLatestInsulinData.getMonth(),
    dateOfLatestInsulinData.getDate(),
    23,
    59,
    59,
    999,
  );
  const startOfDayForLatestInsulinData = new Date(
    dateOfLatestInsulinData.getFullYear(),
    dateOfLatestInsulinData.getMonth(),
    dateOfLatestInsulinData.getDate(),
    0,
    0,
    0,
    0,
  );
  console.log('basalProfileData[0].store', basalProfileData[0].store);
  const totalScheduledBasal = calculateTotalScheduledBasal(
    basalProfileData.basal,
    startOfDayForLatestInsulinData,
    endOfDayForLatestInsulinData,
  );
  const totalInsulin = calculateTotalInsulin(insulinData, basalProfileData);
  const {highestIOB, lowestIOB} = findHighestAndLowestIOB(insulinData);
  const basalBolusRatio = calculateBasalBolusRatio(insulinData);
  const averageInsulinUsage = calculateAverageInsulinUsage(
    insulinData,
    basalProfileData,
  );
  const timeInRange = calculateTimeInRange(insulinData);

  const theme = useTheme();

  return (
    <Container>
      <GradientColumn>
        <LabelText>Total Insulin</LabelText>
        <ValueText>{totalInsulin.toFixed(2)}</ValueText>
      </GradientColumn>
      <GradientColumn>
        <LabelText>Highest IOB</LabelText>
        <ValueText>{highestIOB.value.toFixed(2)}</ValueText>
        <TimeValueText>
          {formatDateToLocaleTimeString(highestIOB.time)}
        </TimeValueText>
      </GradientColumn>
      <GradientColumn>
        <LabelText>Lowest IOB</LabelText>
        <ValueText>{lowestIOB.value.toFixed(2)}</ValueText>
        <TimeValueText>
          {formatDateToLocaleTimeString(lowestIOB.time)}
        </TimeValueText>
      </GradientColumn>
      <GradientColumn>
        <LabelText>Total scheduled basal</LabelText>
        <ValueText>{totalScheduledBasal}</ValueText>
      </GradientColumn>
      {/* Additional stats as needed */}
    </Container>
  );
};

export default InsulinStatsRow;
