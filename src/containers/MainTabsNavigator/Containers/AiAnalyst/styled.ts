import styled from 'styled-components/native';
import {Pressable, TextInput} from 'react-native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

export const Container = styled.View`
  flex: 1;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
`;

export const Header = styled.View`
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
`;

export const Title = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xl}px;
  font-weight: 700;
`;

export const Subtle = styled.Text`
  margin-top: 6px;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.75)};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
`;

export const Card = styled.View`
  margin: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.1)};
`;

export const CardRow = styled(Pressable).attrs({collapsable: false})`
  flex-direction: row;
  align-items: center;
`;

export const CardIcon = styled.View`
  width: 42px;
  height: 42px;
  border-radius: 21px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.accentColor, 0.12)};
  margin-right: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
`;

export const CardTitle = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.md}px;
  font-weight: 700;
`;

export const CardSubtitle = styled.Text`
  margin-top: 2px;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
`;

export const Button = styled(Pressable).attrs({collapsable: false})`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  background-color: ${({theme}: {theme: ThemeType}) => theme.accentColor};
  align-items: center;
`;

export const ButtonText = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.white};
  font-weight: 800;
`;

export const MessageBubble = styled.View<{role: 'user' | 'assistant'}>`
  align-self: ${({role}: {role: 'user' | 'assistant'}) =>
    role === 'user' ? 'flex-end' : 'flex-start'};
  max-width: 88%;
  margin: 6px 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: ${({theme, role}: {theme: ThemeType; role: 'user' | 'assistant'}) =>
    role === 'user' ? addOpacity(theme.accentColor, 0.14) : addOpacity(theme.textColor, 0.06)};
`;

export const MessageText = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.md}px;
`;

export const InputRow = styled.View`
  flex-direction: row;
  align-items: center;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  gap: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
`;

export const ChatInput = styled(TextInput).attrs({multiline: true})`
  flex: 1;
  min-height: 44px;
  max-height: 120px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.18)};
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  padding: 10px;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

export const SendButton = styled(Pressable)`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}: {theme: ThemeType}) => theme.accentColor};
`;
