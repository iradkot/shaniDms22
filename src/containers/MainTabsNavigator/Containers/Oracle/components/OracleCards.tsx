import React from 'react';
import {Pressable, View} from 'react-native';
import styled from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

export const Card = styled.View<{theme: ThemeType}>`
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => p.theme.borderColor};
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
`;

export const CardTitle = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.lg}px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

export const CardSubtle = styled.Text<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.7)};
`;

export const Spacer = styled.View<{h: number}>`
  height: ${(p: {h: number}) => p.h}px;
`;

const BannerWrap = styled.View<{theme: ThemeType; $tone: 'info' | 'warn' | 'error'}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType; $tone: 'info' | 'warn' | 'error'}) =>
    p.$tone === 'error'
      ? addOpacity(p.theme.accentColor, 0.55)
      : addOpacity(p.theme.borderColor, 0.9)};
  background-color: ${(p: {theme: ThemeType; $tone: 'info' | 'warn' | 'error'}) =>
    p.$tone === 'error'
      ? addOpacity(p.theme.accentColor, 0.08)
      : p.$tone === 'warn'
        ? addOpacity(p.theme.textColor, 0.06)
        : addOpacity(p.theme.textColor, 0.04)};
`;

const BannerRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const BannerText = styled.Text<{theme: ThemeType}>`
  flex: 1;
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.85)};
`;

const BannerButton = styled(Pressable)<{theme: ThemeType}>`
  margin-left: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.6)};
`;

const BannerButtonText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.accentColor};
`;

export function OracleStatusBanner(props: {
  testID?: string;
  tone: 'info' | 'warn' | 'error';
  message: string;
  actionLabel?: string;
  actionTestID?: string;
  onPressAction?: () => void;
}): React.JSX.Element {
  return (
    <BannerWrap testID={props.testID} $tone={props.tone}>
      <BannerRow>
        <BannerText>{props.message}</BannerText>
        {!!props.actionLabel && !!props.onPressAction && (
          <BannerButton testID={props.actionTestID} onPress={props.onPressAction}>
            <BannerButtonText>{props.actionLabel}</BannerButtonText>
          </BannerButton>
        )}
      </BannerRow>
    </BannerWrap>
  );
}

export function OracleMaybe(props: {when: boolean; children: React.ReactNode}): React.JSX.Element {
  if (!props.when) return <View />;
  return <>{props.children}</>;
}
