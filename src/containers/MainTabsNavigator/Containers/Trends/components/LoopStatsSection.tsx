/* eslint-disable react-native/no-inline-styles */
import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {addOpacity} from 'app/style/styling.utils';
import {SectionTitle} from '../styles/Trends.styles';
import {
  LoopMode,
  LoopDataLoadProgress,
  LoopModeStats,
} from '../utils/loopModeStats';

type LoopViewMode = 'both' | 'open' | 'closed';

type LoopStatsSectionProps = {
  stats: LoopModeStats;
  isLoading: boolean;
  fetchError: string | null;
  rowsFetched: number;
  loadProgress: LoopDataLoadProgress;
};

const LOOP_MODE_COLORS: Record<LoopMode, string> = {
  closed: '#2ecc71',
  open: '#f39c12',
  unknown: '#95a5a6',
};

const formatLoopHours = (minutes: number) => {
  const hours = Math.max(0, minutes) / 60;
  return hours >= 10
    ? String(Math.round(hours))
    : String(Number(hours.toFixed(1)));
};

const formatLoopValue = (value: number | null | undefined, decimals = 0) =>
  value == null || !Number.isFinite(value) ? '-' : value.toFixed(decimals);

const getLoopLoadPhaseLabel = (
  progress: LoopDataLoadProgress,
  language: string,
) => {
  if (language === 'he') {
    switch (progress.phase) {
      case 'deviceStatus':
        return 'טוען devicestatus';
      case 'treatments':
        return 'טוען טיפולי בזאל';
      case 'processing':
        return 'מחשב כיסוי לופ';
      case 'done':
        return 'הסתיים';
      case 'error':
        return 'הטעינה נכשלה';
      default:
        return 'מתכונן לטעינה';
    }
  }

  switch (progress.phase) {
    case 'deviceStatus':
      return 'Loading devicestatus';
    case 'treatments':
      return 'Loading basal treatments';
    case 'processing':
      return 'Calculating loop coverage';
    case 'done':
      return 'Done';
    case 'error':
      return 'Loading failed';
    default:
      return 'Preparing load';
  }
};

export function LoopStatsSection({
  stats,
  isLoading,
  fetchError,
  rowsFetched,
  loadProgress,
}: LoopStatsSectionProps) {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const isRTL = language === 'he';
  const [loopViewMode, setLoopViewMode] = useState<LoopViewMode>('both');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const totalLoadChunks = Math.max(loadProgress.totalChunks, 0);
  const completedLoadChunks = Math.min(
    Math.max(loadProgress.completedChunks, 0),
    totalLoadChunks,
  );
  const loadProgressPct =
    totalLoadChunks > 0 ? completedLoadChunks / totalLoadChunks : 0;
  const loadProgressLabel = getLoopLoadPhaseLabel(loadProgress, language);

  const renderLoopMetricTile = ({
    icon,
    label,
    value,
  }: {
    icon: string;
    label: string;
    value: string;
  }) => (
    <View
      key={label}
      style={{
        flexGrow: 1,
        minWidth: 86,
        borderRadius: 10,
        paddingHorizontal: 9,
        paddingVertical: 8,
        backgroundColor: addOpacity(theme.textColor, 0.055),
      }}>
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 5,
        }}>
        <MaterialIcons
          name={icon}
          size={14}
          color={addOpacity(theme.textColor, 0.7)}
        />
        <Text
          style={{
            color: addOpacity(theme.textColor, 0.64),
            fontSize: 11,
            fontWeight: '700',
          }}>
          {label}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 3,
          color: theme.textColor,
          fontSize: 15,
          fontWeight: '800',
          textAlign: isRTL ? 'right' : 'left',
        }}>
        {value}
      </Text>
    </View>
  );

  const renderLoopModeCard = (mode: 'open' | 'closed') => {
    const isOpen = mode === 'open';
    const color = isOpen ? LOOP_MODE_COLORS.open : LOOP_MODE_COLORS.closed;
    const minutes = isOpen ? stats.openMinutes : stats.closedMinutes;
    const reliable = isOpen
      ? stats.openMetricsReliable
      : stats.closedMetricsReliable;
    const avgBg = isOpen ? stats.openAvgBg : stats.closedAvgBg;
    const tirPct = isOpen ? stats.openTirPct : stats.closedTirPct;
    const pct = isOpen ? stats.openPct : stats.closedPct;

    return (
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: addOpacity(color, 0.1),
          borderWidth: 1,
          borderColor: addOpacity(color, 0.22),
          gap: 10,
        }}>
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              gap: 7,
            }}>
            <MaterialIcons
              name={isOpen ? 'radio-button-unchecked' : 'lock-outline'}
              size={18}
              color={color}
            />
            <Text
              style={{
                color: theme.textColor,
                fontSize: 15,
                fontWeight: '800',
              }}>
              {language === 'he'
                ? isOpen
                  ? 'לופ פתוח'
                  : 'לופ סגור'
                : isOpen
                ? 'Open loop'
                : 'Closed loop'}
            </Text>
          </View>
          <Text
            style={{
              color: theme.textColor,
              fontSize: 20,
              fontWeight: '800',
            }}>
            {pct.toFixed(1)}%
          </Text>
        </View>

        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            flexWrap: 'wrap',
            gap: 8,
          }}>
          {[
            {
              icon: 'schedule',
              label: language === 'he' ? 'זמן' : 'Time',
              value:
                language === 'he'
                  ? `${formatLoopHours(minutes)} ש׳`
                  : `${formatLoopHours(minutes)}h`,
            },
            {
              icon: 'show-chart',
              label: language === 'he' ? 'ממוצע' : 'Avg',
              value: reliable ? formatLoopValue(avgBg) : '-',
            },
            {
              icon: 'check-circle-outline',
              label: 'TIR',
              value: reliable ? `${formatLoopValue(tirPct, 1)}%` : '-',
            },
          ].map(renderLoopMetricTile)}
        </View>
      </View>
    );
  };

  const renderLoopModeProfile = () => (
    <View
      style={{
        borderRadius: 12,
        padding: 12,
        backgroundColor: addOpacity(theme.textColor, 0.045),
        gap: 10,
      }}>
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 7,
        }}>
        <MaterialIcons name="view-week" size={17} color={theme.primaryColor} />
        <Text
          style={{
            flex: 1,
            color: theme.textColor,
            fontSize: 14,
            fontWeight: '800',
            textAlign: isRTL ? 'right' : 'left',
          }}>
          {language === 'he' ? 'דפוס לופ לפי שעה' : 'Loop pattern by hour'}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 2,
          height: 30,
        }}>
        {stats.hourlyModeProfile.map(hour => {
          const dominantPct = Math.max(
            hour.openPct,
            hour.closedPct,
            hour.unknownPct,
          );
          const opacity = 0.22 + (dominantPct / 100) * 0.68;
          const color = LOOP_MODE_COLORS[hour.dominantMode];
          return (
            <View
              key={hour.hour}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 4,
                backgroundColor: addOpacity(color, opacity),
                borderWidth: 1,
                borderColor: addOpacity(color, 0.35),
              }}
            />
          );
        })}
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}>
        {['00', '06', '12', '18', '24'].map(label => (
          <Text
            key={label}
            style={{
              color: addOpacity(theme.textColor, 0.58),
              fontSize: 10,
              fontWeight: '700',
            }}>
            {label}
          </Text>
        ))}
      </View>

      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          flexWrap: 'wrap',
          gap: 8,
        }}>
        {[
          {mode: 'closed' as const, label: language === 'he' ? 'סגור' : 'Closed'},
          {mode: 'open' as const, label: language === 'he' ? 'פתוח' : 'Open'},
          {
            mode: 'unknown' as const,
            label: language === 'he' ? 'לא ידוע' : 'Unknown',
          },
        ].map(item => (
          <View
            key={item.mode}
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              gap: 5,
            }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: LOOP_MODE_COLORS[item.mode],
              }}
            />
            <Text
              style={{
                color: addOpacity(theme.textColor, 0.66),
                fontSize: 11,
                fontWeight: '700',
              }}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderBasalPill = ({
    icon,
    label,
    pct,
    minutes,
  }: {
    icon: string;
    label: string;
    pct: number;
    minutes: number;
  }) => (
    <View
      key={label}
      style={{
        flexGrow: 1,
        minWidth: 138,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: addOpacity(theme.textColor, 0.055),
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 7,
      }}>
      <MaterialIcons
        name={icon}
        size={15}
        color={addOpacity(theme.textColor, 0.72)}
      />
      <Text
        style={{
          flexShrink: 1,
          color: theme.textColor,
          fontSize: 12,
          fontWeight: '700',
          textAlign: isRTL ? 'right' : 'left',
        }}>
        {label}
      </Text>
      <Text
        style={{
          marginLeft: isRTL ? 0 : 'auto',
          marginRight: isRTL ? 'auto' : 0,
          color: addOpacity(theme.textColor, 0.72),
          fontSize: 12,
          fontWeight: '700',
        }}>
        {pct.toFixed(1)}% ·{' '}
        {language === 'he'
          ? `${formatLoopHours(minutes)} ש׳`
          : `${formatLoopHours(minutes)}h`}
      </Text>
    </View>
  );

  return (
    <>
      <View style={{marginBottom: theme.spacing.lg - 1}}>
        <SectionTitle>
          {language === 'he' ? 'לופ פתוח מול סגור' : 'Open vs Closed Loop'}
        </SectionTitle>

        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            marginBottom: 10,
          }}>
          {(
            [
              {key: 'both', labelHe: 'שניהם', labelEn: 'Both'},
              {key: 'open', labelHe: 'רק פתוח', labelEn: 'Open only'},
              {key: 'closed', labelHe: 'רק סגור', labelEn: 'Closed only'},
            ] as const
          ).map(opt => {
            const active = loopViewMode === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setLoopViewMode(opt.key)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active
                    ? theme.primaryColor
                    : addOpacity(theme.textColor, 0.25),
                  backgroundColor: active
                    ? addOpacity(theme.primaryColor, 0.2)
                    : addOpacity(theme.textColor, 0.04),
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  marginRight: isRTL ? 0 : 8,
                  marginLeft: isRTL ? 8 : 0,
                }}>
                <Text
                  style={{
                    color: theme.textColor,
                    fontWeight: active ? '700' : '500',
                  }}>
                  {language === 'he' ? opt.labelHe : opt.labelEn}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: addOpacity(theme.textColor, 0.12),
            backgroundColor: addOpacity(theme.textColor, 0.03),
            padding: 12,
            gap: 12,
          }}>
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}>
            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                flex: 1,
                gap: 8,
              }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: addOpacity(theme.primaryColor, 0.16),
                }}>
                <MaterialIcons
                  name="settings-input-component"
                  size={18}
                  color={theme.primaryColor}
                />
              </View>
              <View style={{flex: 1}}>
                <Text
                  style={{
                    color: theme.textColor,
                    fontSize: 14,
                    fontWeight: '700',
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                  {language === 'he' ? 'כיסוי נתוני לופ' : 'Loop data coverage'}
                </Text>
                <Text
                  style={{
                    color: addOpacity(theme.textColor, 0.68),
                    fontSize: 12,
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                  {isLoading
                    ? `${loadProgressLabel}...`
                    : language === 'he'
                    ? `לא ידוע ${stats.unknownPct.toFixed(1)}%`
                    : `Unknown ${stats.unknownPct.toFixed(1)}%`}
                </Text>
              </View>
            </View>

            <View
              style={{
                minWidth: 74,
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 7,
                backgroundColor: stats.hasEnoughLoopCoverage
                  ? addOpacity(LOOP_MODE_COLORS.closed, 0.16)
                  : addOpacity('#f1c40f', 0.16),
                alignItems: 'center',
              }}>
              <Text
                style={{
                  color: theme.textColor,
                  fontSize: 18,
                  fontWeight: '800',
                }}>
                {isLoading ? '...' : `${stats.knownCoveragePct.toFixed(0)}%`}
              </Text>
              <Text
                style={{
                  color: addOpacity(theme.textColor, 0.68),
                  fontSize: 11,
                  fontWeight: '600',
                }}>
                {isLoading
                  ? language === 'he'
                    ? 'טוען'
                    : 'loading'
                  : language === 'he'
                  ? 'ידוע'
                  : 'known'}
              </Text>
            </View>
          </View>

          {isLoading ? (
            <LoopLoadProgress
              phaseLabel={loadProgressLabel}
              completedChunks={completedLoadChunks}
              totalChunks={totalLoadChunks}
              progressPct={loadProgressPct}
            />
          ) : (
            <>
              {fetchError && (
                <InlineLoopNotice
                  icon="error-outline"
                  tone="error"
                  text={
                    language === 'he'
                      ? 'טעינת נתוני הלופ נכשלה.'
                      : 'Loop data failed to load.'
                  }
                />
              )}

              {!fetchError && rowsFetched === 0 && (
                <InlineLoopNotice
                  icon="info-outline"
                  tone="warning"
                  text={
                    language === 'he'
                      ? 'לא נמצאו נתוני devicestatus לטווח הזה.'
                      : 'No devicestatus data was found for this range.'
                  }
                />
              )}

              {(loopViewMode === 'both' || loopViewMode === 'open') &&
                renderLoopModeCard('open')}

              {(loopViewMode === 'both' || loopViewMode === 'closed') &&
                renderLoopModeCard('closed')}

              {renderLoopModeProfile()}

              {!stats.hasEnoughLoopCoverage && (
                <InlineLoopNotice
                  icon="info-outline"
                  tone="warning"
                  text={
                    language === 'he'
                      ? 'אין מספיק כיסוי להשוואה חזקה בין פתוח לסגור.'
                      : 'Not enough coverage for a strong open/closed comparison.'
                  }
                />
              )}

              {!stats.canCompareOpenClosed && (
                <Text
                  style={{
                    color: addOpacity(theme.textColor, 0.65),
                    fontSize: 12,
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                  {language === 'he'
                    ? 'ממוצע ו-TIR מוצגים לכל מצב רק כשיש מספיק כיסוי ודגימות.'
                    : 'Avg and TIR are shown per mode only when coverage and samples are sufficient.'}
                </Text>
              )}
            </>
          )}

          <Pressable
            onPress={() => setShowDiagnostics(v => !v)}
            style={{
              alignSelf: isRTL ? 'flex-end' : 'flex-start',
              paddingVertical: 4,
            }}>
            <Text
              style={{
                color: addOpacity(theme.primaryColor, 0.9),
                fontSize: 12,
                fontWeight: '600',
              }}>
              {language === 'he'
                ? showDiagnostics
                  ? 'הסתר דיאגנוסטיקה'
                  : 'הצג דיאגנוסטיקה'
                : showDiagnostics
                ? 'Hide diagnostics'
                : 'Show diagnostics'}
            </Text>
          </Pressable>

          {showDiagnostics && (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: addOpacity(theme.textColor, 0.1),
                paddingTop: 10,
                gap: 6,
              }}>
              <Text
                style={{
                  color: addOpacity(theme.textColor, 0.65),
                  fontSize: 12,
                  fontWeight: '800',
                  textAlign: isRTL ? 'right' : 'left',
                }}>
                {language === 'he' ? 'דיאגנוסטיקה' : 'Diagnostics'}
              </Text>
              <View
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                }}>
                {[
                  {
                    label: language === 'he' ? 'rows מהשרת' : 'server rows',
                    value: rowsFetched,
                  },
                  {
                    label: language === 'he' ? 'אירועים' : 'events',
                    value: stats.diagnostics.eventsFetched,
                  },
                  {
                    label: language === 'he' ? 'מסווגים' : 'classified',
                    value: stats.diagnostics.eventsClassified,
                  },
                  {
                    label: language === 'he' ? 'דגימות פתוח' : 'open samples',
                    value: stats.diagnostics.openSamples,
                  },
                  {
                    label: language === 'he' ? 'דגימות סגור' : 'closed samples',
                    value: stats.diagnostics.closedSamples,
                  },
                  {
                    label: language === 'he' ? 'אירועי בזאל' : 'basal events',
                    value: stats.diagnostics.basalEvents,
                  },
                  ...(fetchError
                    ? [
                        {
                          label: language === 'he' ? 'שגיאה' : 'error',
                          value: fetchError,
                        },
                      ]
                    : []),
                ].map(item => (
                  <View
                    key={item.label}
                    style={{
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      backgroundColor: addOpacity(theme.textColor, 0.05),
                    }}>
                    <Text
                      style={{
                        color: addOpacity(theme.textColor, 0.64),
                        fontSize: 11,
                        fontWeight: '700',
                      }}>
                      {item.label}: {item.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={{marginBottom: theme.spacing.lg - 1}}>
        <SectionTitle>
          {language === 'he' ? 'מצב בזאל' : 'Basal Delivery'}
        </SectionTitle>

        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: addOpacity(theme.textColor, 0.12),
            backgroundColor: addOpacity(theme.textColor, 0.03),
            padding: 12,
            gap: 10,
          }}>
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              gap: 8,
            }}>
            <MaterialIcons
              name="waterfall-chart"
              size={18}
              color={theme.primaryColor}
            />
            <Text
              style={{
                flex: 1,
                color: theme.textColor,
                fontSize: 14,
                fontWeight: '800',
                textAlign: isRTL ? 'right' : 'left',
              }}>
              {language === 'he' ? 'פירוק בזאל' : 'Basal breakdown'}
            </Text>
          </View>

          {isLoading ? (
            <LoopLoadProgress
              phaseLabel={loadProgressLabel}
              completedChunks={completedLoadChunks}
              totalChunks={totalLoadChunks}
              progressPct={loadProgressPct}
            />
          ) : (
            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                flexWrap: 'wrap',
                gap: 8,
              }}>
              {[
                {
                  icon: 'bolt',
                  label: language === 'he' ? 'טמפ בזאל' : 'Temp basal',
                  pct: stats.tempBasalPct,
                  minutes: stats.tempBasalMinutes,
                },
                {
                  icon: 'pause-circle-outline',
                  label:
                    language === 'he'
                      ? 'בזאל 0 / עצירה'
                      : 'Zero basal / stop',
                  pct: stats.suspendedPct,
                  minutes: stats.suspendedMinutes,
                },
                {
                  icon: 'event-repeat',
                  label: language === 'he' ? 'בזאל מתוכנן' : 'Planned basal',
                  pct: stats.plannedBasalPct,
                  minutes: stats.plannedBasalMinutes,
                },
                {
                  icon: 'help-outline',
                  label: language === 'he' ? 'לא ידוע' : 'Unknown',
                  pct: stats.unknownBasalPct,
                  minutes: stats.unknownBasalMinutes,
                },
              ].map(renderBasalPill)}
            </View>
          )}
        </View>
      </View>
    </>
  );
}

function LoopLoadProgress({
  phaseLabel,
  completedChunks,
  totalChunks,
  progressPct,
}: {
  phaseLabel: string;
  completedChunks: number;
  totalChunks: number;
  progressPct: number;
}) {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const isRTL = language === 'he';
  const percent = Math.round(progressPct * 100);

  return (
    <View
      style={{
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 9,
        backgroundColor: addOpacity(theme.textColor, 0.055),
        gap: 8,
      }}>
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 8,
        }}>
        <MaterialIcons
          name="hourglass-empty"
          size={17}
          color={addOpacity(theme.textColor, 0.72)}
        />
        <Text
          style={{
            flex: 1,
            color: addOpacity(theme.textColor, 0.76),
            fontSize: 13,
            fontWeight: '800',
            textAlign: isRTL ? 'right' : 'left',
          }}>
          {phaseLabel}
        </Text>
        <Text
          style={{
            color: addOpacity(theme.textColor, 0.7),
            fontSize: 12,
            fontWeight: '800',
          }}>
          {totalChunks > 0 ? `${percent}%` : '...'}
        </Text>
      </View>

      <View
        style={{
          height: 7,
          borderRadius: 999,
          overflow: 'hidden',
          backgroundColor: addOpacity(theme.textColor, 0.08),
        }}>
        <View
          style={{
            width: `${Math.max(4, percent)}%`,
            height: '100%',
            borderRadius: 999,
            backgroundColor: theme.primaryColor,
          }}
        />
      </View>

      <Text
        style={{
          color: addOpacity(theme.textColor, 0.62),
          fontSize: 12,
          fontWeight: '700',
          textAlign: isRTL ? 'right' : 'left',
        }}>
        {totalChunks > 0
          ? language === 'he'
            ? `${completedChunks} מתוך ${totalChunks} חלקים נטענו`
            : `${completedChunks} of ${totalChunks} chunks loaded`
          : language === 'he'
            ? 'מתחיל טעינת נתוני לופ...'
            : 'Starting loop data load...'}
      </Text>
    </View>
  );
}

function InlineLoopNotice({
  icon,
  text,
  tone = 'neutral',
}: {
  icon: string;
  text: string;
  tone?: 'neutral' | 'warning' | 'error';
}) {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const isRTL = language === 'he';
  const backgroundColor =
    tone === 'error'
      ? addOpacity('#e74c3c', 0.12)
      : tone === 'warning'
        ? addOpacity('#f1c40f', 0.13)
        : addOpacity(theme.textColor, 0.055);

  return (
    <View
      style={{
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor,
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 8,
      }}>
      <MaterialIcons
        name={icon}
        size={17}
        color={addOpacity(theme.textColor, tone === 'error' ? 0.78 : 0.72)}
      />
      <Text
        style={{
          flex: 1,
          color: addOpacity(theme.textColor, tone === 'error' ? 0.75 : 0.72),
          fontSize: 13,
          fontWeight: '700',
          textAlign: isRTL ? 'right' : 'left',
        }}>
        {text}
      </Text>
    </View>
  );
}
