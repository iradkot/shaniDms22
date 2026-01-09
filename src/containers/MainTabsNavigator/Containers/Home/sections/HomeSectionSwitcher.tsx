import React from 'react';

import {Pressable} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

import {HOME_SECTIONS, type HomeSection} from 'app/containers/MainTabsNavigator/Containers/Home/homeSections';

const SectionSwitcherRow = styled.View.attrs({collapsable: false})`
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  padding: ${(props: {theme: ThemeType}) => props.theme.spacing.sm - 2}px
    ${(props: {theme: ThemeType}) => props.theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props: {theme: ThemeType}) =>
    addOpacity(props.theme.black, 0.08)};
`;

const SectionButton = styled(Pressable).attrs({collapsable: false})`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-vertical: ${(props: {theme: ThemeType}) => props.theme.spacing.xs / 2}px;
`;

const SectionButtonInner = styled.View.attrs({collapsable: false})<{active: boolean}>`
  width: 100%;
  align-items: center;
  justify-content: center;
  padding-vertical: ${(props: {theme: ThemeType}) => props.theme.spacing.xs}px;
  border-radius: ${(props: {theme: ThemeType}) => props.theme.borderRadius + 4}px;
  background-color: ${(props: {theme: ThemeType; active: boolean}) =>
    props.active ? addOpacity(props.theme.accentColor, 0.12) : 'transparent'};
  border-width: ${(props: {active: boolean}) => (props.active ? 1 : 0)};
  border-color: ${(props: {theme: ThemeType; active: boolean}) =>
    props.active ? addOpacity(props.theme.accentColor, 0.35) : 'transparent'};
`;

const LabelRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${(props: {theme: ThemeType}) => props.theme.spacing.xs}px;
`;

const SectionLabel = styled.Text<{active: boolean}>`
  font-size: ${(props: {theme: ThemeType}) => props.theme.typography.size.xs}px;
  font-weight: 700;
  color: ${(props: {theme: ThemeType; active: boolean}) =>
    props.active
      ? props.theme.textColor
      : addOpacity(props.theme.textColor, 0.55)};
`;

type Props = {
  selectedSection: HomeSection | null;
  onToggle: (section: HomeSection) => void;
};

export const HomeSectionSwitcher: React.FC<Props> = ({selectedSection, onToggle}) => {
  const theme = useTheme() as ThemeType;

  return (
    <SectionSwitcherRow>
      {HOME_SECTIONS.map(section => {
        const active = selectedSection === section.key;
        const iconColor = active ? theme.accentColor : addOpacity(theme.textColor, 0.55);
        const labelColor = active ? theme.textColor : addOpacity(theme.textColor, 0.55);
        const chevronName = active ? 'chevron-up' : 'chevron-down';

        return (
          <SectionButton
            key={section.key}
            testID={section.testID}
            onPress={() => onToggle(section.key)}
            accessibilityRole="button"
            accessibilityLabel={section.label}
            accessibilityHint={active ? 'Tap to collapse' : 'Tap to expand'}
            accessibilityState={{expanded: active}}>
            <SectionButtonInner active={active}>
              <Icon name={section.iconName} size={22} color={iconColor} />
              <LabelRow>
                <SectionLabel active={active}>{section.label}</SectionLabel>
                <Icon
                  name={chevronName}
                  size={16}
                  color={labelColor}
                  style={{marginLeft: 2}}
                />
              </LabelRow>
            </SectionButtonInner>
          </SectionButton>
        );
      })}
    </SectionSwitcherRow>
  );
};

export default HomeSectionSwitcher;
