import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

export const HOME_SECTION_KEYS = {
  bgStats: 'bgStats',
  insulinStats: 'insulinStats',
  chart: 'chart',
} as const;

export type HomeSection =
  (typeof HOME_SECTION_KEYS)[keyof typeof HOME_SECTION_KEYS];

export type HomeSectionItem = {
  key: HomeSection;
  label: string;
  iconName: string;
  testID?: string;
};

export const HOME_SECTIONS: readonly HomeSectionItem[] = [
  {key: HOME_SECTION_KEYS.bgStats, label: 'BG Stats', iconName: 'chart-bar'},
  {key: HOME_SECTION_KEYS.insulinStats, label: 'Insulin', iconName: 'needle'},
  {
    key: HOME_SECTION_KEYS.chart,
    label: 'Chart',
    iconName: 'chart-line',
    testID: E2E_TEST_IDS.charts.cgmSection,
  },
] as const;
