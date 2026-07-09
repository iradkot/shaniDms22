import React, {useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';

import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {
  AgpComparisonAnalysisResult,
  AgpComparisonInsight,
} from 'app/services/agpComparisonIntelligence';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

export const AgpComparisonInsightsPanel: React.FC<{
  canRun: boolean;
  status: 'idle' | 'loading' | 'success' | 'error';
  progress: string;
  error: string | null;
  result: AgpComparisonAnalysisResult | null;
  onRun: () => void;
}> = ({canRun, status, progress, error, result, onRun}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const isHe = language === 'he';
  const muted = addOpacity(theme.textColor, 0.68);
  const borderColor = addOpacity(theme.textColor, 0.12);
  const settingsInsights =
    result?.insights.filter(insight => insight.category === 'settings') ?? [];
  const clinicalInsights =
    result?.insights.filter(insight => insight.category !== 'settings') ?? [];

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        borderRadius: 6,
        backgroundColor: theme.white,
        padding: theme.spacing.sm + 2,
        marginBottom: theme.spacing.md,
      }}>
      <View
        style={{
          flexDirection: isHe ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}>
        <View style={{flex: 1}}>
          <Text
            style={{
              color: theme.textColor,
              fontSize: 16,
              fontWeight: '700',
              textAlign: isHe ? 'right' : 'left',
            }}>
            {isHe
              ? 'ניתוח חכם של ההבדלים ב-AGP'
              : 'Smart AGP difference analysis'}
          </Text>
          <Text
            style={{
              color: muted,
              fontSize: 12,
              marginTop: 2,
              textAlign: isHe ? 'right' : 'left',
            }}>
            {isHe
              ? 'משווה חלונות AGP, ארוחות, תיקונים והבדלי תכנית.'
              : 'Compares AGP windows, meals, corrections, and plan changes.'}
          </Text>
        </View>
        <Pressable
          onPress={onRun}
          disabled={!canRun || status === 'loading'}
          style={({pressed}) => ({
            backgroundColor:
              !canRun || status === 'loading'
                ? addOpacity(theme.textColor, 0.16)
                : pressed
                ? addOpacity(theme.accentColor, 0.82)
                : theme.accentColor,
            borderRadius: 6,
            minWidth: 92,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs + 4,
          })}>
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: '700',
              textAlign: 'center',
            }}>
            {isHe ? 'נתח הבדלים' : 'Analyze'}
          </Text>
        </Pressable>
      </View>

      {status === 'loading' && (
        <View
          style={{
            marginTop: theme.spacing.sm,
            flexDirection: isHe ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: theme.spacing.xs + 2,
          }}>
          <ActivityIndicator size="small" color={theme.accentColor} />
          <Text style={{color: muted, fontSize: 12}}>
            {progress || (isHe ? 'מנתח...' : 'Analyzing...')}
          </Text>
        </View>
      )}

      {status === 'error' && (
        <Text
          style={{
            color: theme.belowRangeColor,
            fontSize: 12,
            marginTop: theme.spacing.sm,
            textAlign: isHe ? 'right' : 'left',
          }}>
          {isHe ? 'הניתוח נכשל: ' : 'Analysis failed: '}
          {error}
        </Text>
      )}

      {result && (
        <View style={{marginTop: theme.spacing.sm}}>
          <Text
            style={{
              color: theme.textColor,
              fontSize: 13,
              fontWeight: '600',
              textAlign: isHe ? 'right' : 'left',
            }}>
            {isHe ? result.summaryHe : result.summaryEn}
          </Text>
          <Text
            style={{
              color: muted,
              fontSize: 11,
              marginTop: 3,
              textAlign: isHe ? 'right' : 'left',
            }}>
            {isHe
              ? `כיסוי נתונים: נוכחי ${result.evidence.dataQuality.currentCoveragePct.toFixed(
                  0,
                )}%, קודם ${result.evidence.dataQuality.previousCoveragePct.toFixed(
                  0,
                )}%`
              : `Data coverage: current ${result.evidence.dataQuality.currentCoveragePct.toFixed(
                  0,
                )}%, previous ${result.evidence.dataQuality.previousCoveragePct.toFixed(
                  0,
                )}%`}
          </Text>

          {settingsInsights.length ? (
            <View
              style={{
                backgroundColor: addOpacity(theme.accentColor, 0.08),
                borderColor: addOpacity(theme.accentColor, 0.22),
                borderRadius: 6,
                borderWidth: 1,
                marginTop: theme.spacing.sm,
                paddingHorizontal: theme.spacing.sm,
                paddingBottom: theme.spacing.xs,
              }}>
              <Text
                style={{
                  color: theme.textColor,
                  fontSize: 13,
                  fontWeight: '700',
                  marginTop: theme.spacing.xs + 2,
                  textAlign: isHe ? 'right' : 'left',
                  writingDirection: isHe ? 'rtl' : 'ltr',
                }}>
                {isHe
                  ? 'המלצות לפי שינויי תכנית'
                  : 'Plan-change recommendations'}
              </Text>
              {settingsInsights.map(insight => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </View>
          ) : null}

          {clinicalInsights.slice(0, 6).map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>
      )}
    </View>
  );
};

const InsightCard: React.FC<{insight: AgpComparisonInsight}> = ({insight}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const [expanded, setExpanded] = useState(false);
  const isHe = language === 'he';
  const muted = addOpacity(theme.textColor, 0.68);
  const chipBackground = confidenceColor(insight.confidence, theme, 0.13);
  const chipColor = confidenceColor(insight.confidence, theme, 1);

  const title = isHe ? insight.titleHe : insight.titleEn;
  const changed = isHe ? insight.whatChangedHe : insight.whatChangedEn;
  const drivers = isHe ? insight.possibleDriversHe : insight.possibleDriversEn;
  const evidence = isHe ? insight.evidenceHe : insight.evidenceEn;
  const settings = isHe ? insight.settingsContextHe : insight.settingsContextEn;
  const hasDetails = evidence.length > 0 || Boolean(settings);

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: addOpacity(theme.textColor, 0.1),
        paddingTop: theme.spacing.sm,
        marginTop: theme.spacing.sm,
      }}>
      <View
        style={{
          flexDirection: isHe ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}>
        <View style={{flex: 1}}>
          <Text
            style={{
              color: theme.textColor,
              fontSize: 14,
              fontWeight: '700',
              textAlign: isHe ? 'right' : 'left',
            }}>
            {title}
          </Text>
          <Text
            style={{
              color: muted,
              fontSize: 11,
              marginTop: 3,
              textAlign: isHe ? 'right' : 'left',
            }}>
            {categoryLabel(insight.category, isHe)}
          </Text>
        </View>
        <Chip
          backgroundColor={chipBackground}
          textColor={chipColor}
          label={confidenceLabel(insight.confidence, isHe)}
        />
      </View>

      <TextBlock
        title={isHe ? 'מה השתנה' : 'What changed'}
        values={splitInsightText(changed)}
        muted={theme.textColor}
        isHe={isHe}
      />

      <TextBlock
        title={isHe ? 'כדאי לבדוק' : 'Worth checking'}
        values={expanded ? drivers : drivers.slice(0, 1)}
        muted={muted}
        isHe={isHe}
      />
      {expanded ? (
        <>
          <TextBlock
            title={isHe ? 'ראיות' : 'Evidence'}
            values={evidence}
            muted={muted}
            isHe={isHe}
          />
          {settings ? (
            <Text
              style={{
                color: muted,
                fontSize: 12,
                lineHeight: 18,
                marginTop: theme.spacing.xs,
                textAlign: isHe ? 'right' : 'left',
                writingDirection: isHe ? 'rtl' : 'ltr',
              }}>
              {isHe ? 'הקשר תכנית: ' : 'Plan context: '}
              {settings}
            </Text>
          ) : null}
        </>
      ) : null}

      {hasDetails ? (
        <Pressable
          onPress={() => setExpanded(value => !value)}
          style={{
            alignSelf: isHe ? 'flex-end' : 'flex-start',
            backgroundColor: addOpacity(theme.accentColor, 0.1),
            borderRadius: 6,
            marginTop: theme.spacing.xs + 2,
            paddingHorizontal: theme.spacing.xs + 2,
            paddingVertical: 4,
          }}>
          <Text
            style={{
              color: theme.accentColor,
              fontSize: 12,
              fontWeight: '700',
            }}>
            {expanded
              ? isHe
                ? 'הסתר פירוט'
                : 'Hide details'
              : isHe
              ? 'פתח ראיות'
              : 'Show evidence'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const Chip: React.FC<{
  backgroundColor: string;
  textColor: string;
  label: string;
}> = ({backgroundColor, textColor, label}) => (
  <View
    style={{
      backgroundColor,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 3,
    }}>
    <Text style={{color: textColor, fontSize: 11, fontWeight: '700'}}>
      {label}
    </Text>
  </View>
);

const TextBlock: React.FC<{
  title: string;
  values: string[];
  muted: string;
  isHe: boolean;
}> = ({title, values, muted, isHe}) => {
  const theme = useTheme() as ThemeType;
  if (!values.length) {
    return null;
  }
  return (
    <View
      style={{
        marginTop: theme.spacing.xs,
      }}>
      <Text
        style={{
          color: muted,
          fontSize: 12,
          fontWeight: '700',
          textAlign: isHe ? 'right' : 'left',
          writingDirection: isHe ? 'rtl' : 'ltr',
        }}>
        {title}
      </Text>
      {values.map(value => (
        <Text
          key={value}
          style={{
            color: muted,
            fontSize: 12,
            lineHeight: 18,
            marginTop: 2,
            textAlign: isHe ? 'right' : 'left',
            writingDirection: isHe ? 'rtl' : 'ltr',
          }}>
          {isHe ? '• ' : '- '}
          {value}
        </Text>
      ))}
    </View>
  );
};

function splitInsightText(text: string) {
  return text
    .split(' · ')
    .map(part => part.trim())
    .filter(Boolean);
}

function categoryLabel(
  category: AgpComparisonInsight['category'],
  isHe: boolean,
) {
  const labels = {
    agp_pattern: ['דפוס AGP', 'AGP pattern'],
    meal: ['ארוחות', 'Meals'],
    correction: ['תיקונים', 'Corrections'],
    overnight: ['לילה', 'Overnight'],
    morning: ['בוקר', 'Morning'],
    settings: ['תכנית', 'Plan'],
    loop_context: ['לופ', 'Loop'],
  } satisfies Record<AgpComparisonInsight['category'], [string, string]>;
  return labels[category][isHe ? 0 : 1];
}

function confidenceLabel(
  confidence: AgpComparisonInsight['confidence'],
  isHe: boolean,
) {
  if (isHe) {
    return confidence === 'high'
      ? 'ביטחון גבוה'
      : confidence === 'medium'
      ? 'ביטחון בינוני'
      : 'ביטחון נמוך';
  }
  return confidence === 'high'
    ? 'High confidence'
    : confidence === 'medium'
    ? 'Medium confidence'
    : 'Low confidence';
}

function confidenceColor(
  confidence: AgpComparisonInsight['confidence'],
  theme: ThemeType,
  opacity: number,
) {
  const base =
    confidence === 'high'
      ? theme.inRangeColor
      : confidence === 'medium'
      ? theme.accentColor
      : theme.belowRangeColor;
  return opacity >= 1 ? base : addOpacity(base, opacity);
}
