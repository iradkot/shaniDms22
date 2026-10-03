import React, {useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {
  AiConversationFocus,
  AiLocale,
  AiRecommendationRequest,
} from '../../modules/ai';
import {ProductPage} from '../ui';
import type {AiAnalystModuleRuntime} from './runtime';
import {
  RecommendationButton,
  RecommendationChoice,
  recommendationColors as colors,
} from './RecommendationControls';
import {PatientMemoryControl} from './RecommendationPersonalization';
import {getReleaseSafetyPolicy, isRecommendationAllowed, pilotAiNotice} from '../../modules/releaseSafety/policy';

const COPY = {
  he: {
    eyebrow: 'AI ANALYST · בשבילכם',
    title: 'מה יעזור לכם עכשיו?',
    subtitle: 'המלצות אישיות, בצעד אחד. לפי הנתונים ומה שחשוב לכם.',
    now: 'קבל המלצה לעכשיו',
    nowDetail: 'צעד קטן וברור שמתאים לרגע הזה',
    nowTag: 'מתחילים כאן',
    meal: 'קבל המלצה לקראת ארוחה',
    mealDetail: 'בוחרים גודל ארוחה ומקבלים הכוונה',
    mealTag: 'לפני שאוכלים',
    ahead: 'מסתכלים קדימה',
    weekly: 'קבל המלצה שבועית עכשיו',
    monthly: 'קבל המלצה חודשית עכשיו',
    weeklyDetail: 'מה כדאי לשפר בשבוע הקרוב',
    monthlyDetail: 'דפוסים וכיוון לחודש הקרוב',
    guidedTitle: 'המלצה ממוקדת בשבילכם',
    guidedDetail:
      'כמה בחירות קצרות, והמלצה על אוכל, שגרה או שיחה עם הצוות המטפל.',
    guided: 'בואו נדייק את ההמלצה',
    guidedTag: 'שבועית או חודשית',
    history: 'שיחות קודמות',
    settings: 'הגדרות AI',
    back: 'חזרה',
    next: 'המשך',
    mealTitle: 'איזו ארוחה מתכננים?',
    mealSubtitle:
      'הגודל עוזר להתאים את ההכוונה. אפשר לשנות אותו לפני שמתחילים.',
    small: 'ארוחה קטנה',
    smallDetail: 'נשנוש או ארוחה קלה',
    medium: 'ארוחה בינונית',
    mediumDetail: 'ארוחה רגילה',
    large: 'ארוחה גדולה',
    largeDetail: 'ארוחה גדולה מהרגיל',
    mealSubmit: 'קבל המלצה לארוחה',
    step: 'שלב',
    of: 'מתוך',
    durationQuestion: 'לאיזו תקופה נבנה המלצה?',
    focusQuestion: 'במה תרצו להתמקד?',
    goalQuestion: 'מה הכי חשוב לכם כרגע?',
    styleQuestion: 'איך נוח לכם לקבל את ההמלצה?',
    notesQuestion: 'עוד משהו שחשוב שנדע?',
    week: 'לשבוע הקרוב',
    month: 'לחודש הקרוב',
    food: 'אוכל וארוחות',
    foodDetail: 'בחירות אוכל והרגלי אכילה',
    routine: 'השגרה שלי',
    routineDetail: 'הרגלים קטנים שמתאימים ליום־יום',
    careTeam: 'התייעצות על תכנית הטיפול',
    careTeamDetail: 'נושאים ושאלות לשיחה עם הצוות המטפל',
    steadier: 'יותר יציבות בסוכר',
    fewerLows: 'פחות אירועי סוכר נמוך',
    easier: 'שגרה שקל יותר להתמיד בה',
    brief: 'קצר ולעניין',
    briefDetail: 'כמה צעדים פשוטים',
    detailed: 'עם הסבר',
    detailedDetail: 'גם למה ההמלצה מתאימה לי',
    notesLabel: 'העדפות או בקשה אישית (לא חובה)',
    notesPlaceholder: 'למשל: חשוב לי שההמלצות יהיו צמחוניות ופשוטות להכנה',
    summary: 'הבחירות שלכם',
    change: 'שינוי',
    submit: 'קבל המלצה אישית',
    preparing: 'מכינים את ההמלצה…',
    failed: 'לא הצלחנו להתחיל. אפשר לנסות שוב.',
    advisory: 'המלצות לתמיכה בהחלטות. שינויים בטיפול מתכננים עם הצוות המטפל.',
  },
  en: {
    eyebrow: 'AI ANALYST · FOR YOU',
    title: 'What would help right now?',
    subtitle:
      'Personal recommendations, one simple step. Based on your data and what matters to you.',
    now: 'Get a recommendation now',
    nowDetail: 'One clear next step for this moment',
    nowTag: 'START HERE',
    meal: 'Get ready for a meal',
    mealDetail: 'Choose your meal size for useful guidance',
    mealTag: 'BEFORE YOU EAT',
    ahead: 'Looking ahead',
    weekly: 'Get a weekly recommendation',
    monthly: 'Get a monthly recommendation',
    weeklyDetail: 'A useful focus for the coming week',
    monthlyDetail: 'Patterns and direction for the month ahead',
    guidedTitle: 'Make it personal',
    guidedDetail:
      'A few quick choices for advice on food, your routine, or a conversation with your care team.',
    guided: 'Tailor my recommendation',
    guidedTag: 'WEEKLY OR MONTHLY',
    history: 'Previous conversations',
    settings: 'AI settings',
    back: 'Back',
    next: 'Continue',
    mealTitle: 'What size meal are you planning?',
    mealSubtitle:
      'Meal size helps tailor the guidance. You can change it before starting.',
    small: 'Small meal',
    smallDetail: 'A snack or a light meal',
    medium: 'Medium meal',
    mediumDetail: 'A usual meal',
    large: 'Large meal',
    largeDetail: 'Larger than your usual meal',
    mealSubmit: 'Get meal guidance',
    step: 'Step',
    of: 'of',
    durationQuestion: 'What period should we focus on?',
    focusQuestion: 'What would you like help with?',
    goalQuestion: 'What matters most right now?',
    styleQuestion: 'How would you like your recommendation?',
    notesQuestion: 'Anything else we should know?',
    week: 'The coming week',
    month: 'The coming month',
    food: 'Food and meals',
    foodDetail: 'Food choices and eating habits',
    routine: 'My daily routine',
    routineDetail: 'Small habits that fit everyday life',
    careTeam: 'Discussing my care plan',
    careTeamDetail: 'Topics and questions to discuss with your care team',
    steadier: 'Steadier glucose',
    fewerLows: 'Fewer low-glucose events',
    easier: 'An easier routine to keep up',
    brief: 'Short and practical',
    briefDetail: 'A few simple steps',
    detailed: 'With an explanation',
    detailedDetail: 'Why the recommendation may fit me',
    notesLabel: 'Preferences or a personal request (optional)',
    notesPlaceholder:
      'For example: please keep meal ideas vegetarian and easy to prepare',
    summary: 'Your choices',
    change: 'Change',
    submit: 'Get my personal recommendation',
    preparing: 'Preparing your recommendation…',
    failed: 'We could not start. Please try again.',
    advisory:
      'Recommendations support your decisions. Plan treatment changes with your care team.',
  },
} as const;

type Option = {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
};

const ChoiceList = ({
  options,
  selected,
  onSelect,
  locale,
  prefix,
}: {
  readonly options: readonly Option[];
  readonly selected: string | undefined;
  readonly onSelect: (value: string) => void;
  readonly locale: AiLocale;
  readonly prefix: string;
}) => (
  <View style={styles.choices} accessibilityRole="radiogroup">
    {options.map(option => (
      <RecommendationChoice
        key={option.value}
        label={option.label}
        {...(option.description ? {description: option.description} : {})}
        locale={locale}
        selected={selected === option.value}
        onPress={() => onSelect(option.value)}
        testID={`${prefix}-${option.value}`}
      />
    ))}
  </View>
);

const RecommendationCard = ({
  title,
  description,
  tag,
  symbol,
  primary = false,
  compact = false,
  locale,
  onPress,
  disabled,
  testID,
}: {
  readonly title: string;
  readonly description: string;
  readonly tag?: string;
  readonly symbol: string;
  readonly primary?: boolean;
  readonly compact?: boolean;
  readonly locale: AiLocale;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly testID: string;
}) => {
  const rtl = locale === 'he';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled}}
      accessibilityLabel={`${title}. ${description}`}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [
        styles.card,
        primary && styles.primaryCard,
        compact && styles.compactCard,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.cardTop, rtl && styles.reverse]}>
        <Text style={[styles.cardSymbol, primary && styles.onPrimary]}>
          {symbol}
        </Text>
        {tag ? (
          <Text
            style={[
              styles.tag,
              primary && styles.tagPrimary,
              rtl && styles.rtl,
            ]}>
            {tag}
          </Text>
        ) : null}
      </View>
      <Text
        style={[
          styles.cardTitle,
          compact && styles.compactTitle,
          primary && styles.onPrimary,
          rtl && styles.rtl,
        ]}>
        {title}
      </Text>
      <Text
        style={[
          styles.cardDescription,
          compact && styles.compactDescription,
          primary && styles.primaryDescription,
          rtl && styles.rtl,
        ]}>
        {description}
      </Text>
    </Pressable>
  );
};

export const RecommendationLanding = ({
  locale,
  runtime,
  focus,
}: {
  readonly locale: AiLocale;
  readonly runtime: AiAnalystModuleRuntime;
  readonly focus?: AiConversationFocus;
}) => {
  const currentRecommendations = getReleaseSafetyPolicy().currentRecommendations;
  const copy = currentRecommendations ? COPY[locale] : {
    ...COPY[locale],
    ...(locale === 'he' ? {
      title: 'מה אפשר ללמוד מנתוני העבר?',
      subtitle: 'סיכומים ודפוסים מהנתונים, לקראת שיחה עם הצוות המטפל.',
      ahead: 'מסתכלים על הנתונים',
      weekly: 'סיכום השבוע האחרון',
      monthly: 'סיכום החודש האחרון',
      weeklyDetail: 'דפוסים ונתונים מהשבוע האחרון',
      monthlyDetail: 'דפוסים ונתונים מהחודש האחרון',
      guidedTitle: 'ניתוח ממוקד של נתוני העבר',
      guidedDetail: 'בחרו תקופה ונושא לניתוח. אפשר להכין שאלות לצוות המטפל.',
      guided: 'בחירת נושא לניתוח',
      durationQuestion: 'איזו תקופה לנתח?',
      styleQuestion: 'איך נוח לכם לקבל את הסיכום?',
      week: 'השבוע האחרון',
      month: 'החודש האחרון',
      submit: 'קבל סיכום וניתוח',
      preparing: 'מכינים את הניתוח…',
      advisory: pilotAiNotice(locale),
    } : {
      title: 'What can we learn from past data?',
      subtitle: 'Summaries and patterns to discuss with your care team.',
      ahead: 'Review your data',
      weekly: 'Review the past week',
      monthly: 'Review the past month',
      weeklyDetail: 'Patterns and facts from the past week',
      monthlyDetail: 'Patterns and facts from the past month',
      guidedTitle: 'Focused analysis of past data',
      guidedDetail: 'Choose a period and topic. Prepare questions for your care team.',
      guided: 'Choose an analysis topic',
      durationQuestion: 'What period should we analyze?',
      styleQuestion: 'How would you like your summary?',
      week: 'The past week',
      month: 'The past month',
      submit: 'Get a summary and analysis',
      preparing: 'Preparing your analysis…',
      advisory: pilotAiNotice(locale),
    }),
  };
  const rtl = locale === 'he';
  const [mode, setMode] = useState<'landing' | 'meal' | 'guided'>('landing');
  const [step, setStep] = useState(0);
  const [request, setRequest] = useState<AiRecommendationRequest>({
    kind: 'guided',
  });
  const [mealSize, setMealSize] =
    useState<AiRecommendationRequest['mealSize']>();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const startPending = useRef(false);
  const unavailable =
    starting || runtime.snapshot.busy || !runtime.startRecommendation;
  const start = async (nextRequest: AiRecommendationRequest): Promise<void> => {
    if (startPending.current || !runtime.startRecommendation || !isRecommendationAllowed(nextRequest)) {
      return;
    }
    startPending.current = true;
    setStarting(true);
    setStartError(false);
    try {
      await runtime.startRecommendation({
        request: nextRequest,
        locale,
        ...(focus ? {focus} : {}),
      });
    } catch {
      setStartError(true);
    } finally {
      startPending.current = false;
      setStarting(false);
    }
  };
  const questions = [
    copy.durationQuestion,
    copy.focusQuestion,
    copy.goalQuestion,
    copy.styleQuestion,
    copy.notesQuestion,
  ];
  const groups: readonly (readonly Option[])[] = [
    [
      {value: 'weekly', label: copy.week},
      {value: 'monthly', label: copy.month},
    ],
    [
      {value: 'food', label: copy.food, description: copy.foodDetail},
      {value: 'routine', label: copy.routine, description: copy.routineDetail},
      {
        value: 'care-team',
        label: copy.careTeam,
        description: copy.careTeamDetail,
      },
    ],
    [
      {value: 'steadier-glucose', label: copy.steadier},
      {value: 'fewer-lows', label: copy.fewerLows},
      {value: 'easier-routine', label: copy.easier},
    ],
    [
      {value: 'brief', label: copy.brief, description: copy.briefDetail},
      {
        value: 'detailed',
        label: copy.detailed,
        description: copy.detailedDetail,
      },
    ],
  ];
  const selected = [
    request.horizon,
    request.focus,
    request.goal,
    request.responseStyle,
  ];
  const select = (value: string): void => {
    const fields = ['horizon', 'focus', 'goal', 'responseStyle'] as const;
    const field = fields[step];
    if (field) {
      setRequest(previous => ({...previous, [field]: value}));
    }
  };
  const launch = (next: AiRecommendationRequest): void => {
    start(next);
  };

  return (
    <ProductPage
      locale={locale}
      title={copy.title}
      subtitle={copy.subtitle}
      testID="ai-analyst-module"
      style={styles.page}
      header={
        <View style={styles.header}>
          <Text style={[styles.eyebrow, rtl && styles.rtl]}>
            {copy.eyebrow}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.title, rtl && styles.rtl]}>
            {copy.title}
          </Text>
          <Text style={[styles.subtitle, rtl && styles.rtl]}>
            {copy.subtitle}
          </Text>
        </View>
      }>
      {!currentRecommendations ? (
        <Text style={[styles.subtitle, rtl && styles.rtl]} testID="pilot-ai-notice">
          {pilotAiNotice(locale)}
        </Text>
      ) : null}
      {mode === 'landing' || (!currentRecommendations && mode === 'meal') ? (
        <>
          {currentRecommendations ? <View
            style={[styles.cardGrid, rtl && styles.reverse]}
            testID="ai-recommendation-grid">
            <RecommendationCard
              title={copy.now}
              description={copy.nowDetail}
              tag={copy.nowTag}
              symbol="✦"
              primary
              locale={locale}
              onPress={() => launch({kind: 'now'})}
              disabled={unavailable}
              testID="ai-recommend-now"
            />
            <RecommendationCard
              title={copy.meal}
              description={copy.mealDetail}
              tag={copy.mealTag}
              symbol="◒"
              locale={locale}
              onPress={() => setMode('meal')}
              disabled={unavailable}
              testID="ai-recommend-meal"
            />
          </View> : null}
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, rtl && styles.rtl]}>
            {copy.ahead}
          </Text>
          <View style={[styles.cardGrid, rtl && styles.reverse]}>
            <RecommendationCard
              title={copy.weekly}
              description={copy.weeklyDetail}
              symbol="7"
              compact
              locale={locale}
              onPress={() => launch({kind: 'weekly'})}
              disabled={unavailable}
              testID="ai-recommend-weekly"
            />
            <RecommendationCard
              title={copy.monthly}
              description={copy.monthlyDetail}
              symbol="30"
              compact
              locale={locale}
              onPress={() => launch({kind: 'monthly'})}
              disabled={unavailable}
              testID="ai-recommend-monthly"
            />
          </View>
          <View style={styles.guidedCard}>
            <Text style={[styles.eyebrow, rtl && styles.rtl]}>
              {copy.guidedTag}
            </Text>
            <Text style={[styles.guidedTitle, rtl && styles.rtl]}>
              {copy.guidedTitle}
            </Text>
            <Text style={[styles.subtitle, rtl && styles.rtl]}>
              {copy.guidedDetail}
            </Text>
            <View style={styles.guidedAction}>
              <RecommendationButton
                label={copy.guided}
                onPress={() => {
                  setMode('guided');
                  setStep(0);
                }}
                disabled={unavailable}
                testID="ai-recommend-guided"
              />
            </View>
          </View>
          <PatientMemoryControl locale={locale} runtime={runtime} />
          <View style={[styles.footer, rtl && styles.reverse]}>
            <RecommendationButton
              label={copy.history}
              onPress={() => {
                runtime.openHistory().catch(() => undefined);
              }}
              secondary
              testID="ai-open-history"
            />
            <RecommendationButton
              label={copy.settings}
              onPress={runtime.openSettings}
              secondary
              testID="ai-open-settings-from-landing"
            />
          </View>
        </>
      ) : (
        <View
          style={styles.formCard}
          testID={mode === 'meal' ? 'ai-meal-form' : 'ai-guided-form'}>
          <View style={[styles.formNavigation, rtl && styles.reverse]}>
            <RecommendationButton
              label={copy.back}
              secondary
              disabled={starting}
              onPress={() =>
                mode === 'guided' && step > 0
                  ? setStep(step - 1)
                  : setMode('landing')
              }
              testID="ai-flow-back"
            />
            {mode === 'guided' ? (
              <Text style={[styles.stepLabel, rtl && styles.rtl]}>
                {copy.step} {step + 1} {copy.of} 5
              </Text>
            ) : null}
          </View>
          {mode === 'guided' ? (
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{min: 1, max: 5, now: step + 1}}
              style={[styles.steps, rtl && styles.reverse]}>
              {[0, 1, 2, 3, 4].map(index => (
                <View
                  key={index}
                  style={[styles.step, index <= step && styles.stepDone]}
                />
              ))}
            </View>
          ) : null}
          <Text
            accessibilityRole="header"
            style={[styles.formTitle, rtl && styles.rtl]}>
            {mode === 'meal' ? copy.mealTitle : questions[step]}
          </Text>
          {mode === 'meal' ? (
            <>
              <Text style={[styles.subtitle, rtl && styles.rtl]}>
                {copy.mealSubtitle}
              </Text>
              <ChoiceList
                locale={locale}
                prefix="ai-meal-size"
                selected={mealSize}
                onSelect={value =>
                  setMealSize(value as AiRecommendationRequest['mealSize'])
                }
                options={[
                  {
                    value: 'small',
                    label: copy.small,
                    description: copy.smallDetail,
                  },
                  {
                    value: 'medium',
                    label: copy.medium,
                    description: copy.mediumDetail,
                  },
                  {
                    value: 'large',
                    label: copy.large,
                    description: copy.largeDetail,
                  },
                ]}
              />
              <RecommendationButton
                label={copy.mealSubmit}
                disabled={!mealSize || unavailable}
                onPress={() => {
                  if (mealSize) {
                    launch({kind: 'meal', mealSize});
                  }
                }}
                testID="ai-meal-submit"
              />
            </>
          ) : step < 4 ? (
            <>
              <ChoiceList
                locale={locale}
                prefix={`ai-guided-step-${step}`}
                selected={selected[step]}
                onSelect={select}
                options={groups[step] ?? []}
              />
              <RecommendationButton
                label={copy.next}
                disabled={!selected[step] || starting}
                onPress={() => setStep(step + 1)}
                testID="ai-guided-next"
              />
            </>
          ) : (
            <>
              <Text style={[styles.notesLabel, rtl && styles.rtl]}>
                {copy.notesLabel}
              </Text>
              <TextInput
                accessibilityLabel={copy.notesLabel}
                multiline
                maxLength={1000}
                value={request.patientNotes ?? ''}
                onChangeText={patientNotes =>
                  setRequest(previous => ({...previous, patientNotes}))
                }
                placeholder={copy.notesPlaceholder}
                placeholderTextColor={colors.muted}
                style={[styles.notes, rtl && styles.rtl]}
                testID="ai-guided-notes"
              />
              <Text style={[styles.summaryTitle, rtl && styles.rtl]}>
                {copy.summary}
              </Text>
              <View style={styles.summary}>
                {groups.map((options, index) => (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={`${copy.change}: ${
                      options.find(option => option.value === selected[index])
                        ?.label ?? ''
                    }`}
                    onPress={() => setStep(index)}
                    style={[styles.summaryRow, rtl && styles.reverse]}
                    testID={`ai-guided-change-${index}`}>
                    <Text style={[styles.summaryText, rtl && styles.rtl]}>
                      {
                        options.find(option => option.value === selected[index])
                          ?.label
                      }
                    </Text>
                    <Text style={styles.change}>{copy.change}</Text>
                  </Pressable>
                ))}
              </View>
              <RecommendationButton
                label={copy.submit}
                disabled={unavailable}
                onPress={() => launch(request)}
                testID="ai-guided-submit"
              />
            </>
          )}
        </View>
      )}
      {starting ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.status, rtl && styles.rtl]}>
          {copy.preparing}
        </Text>
      ) : null}
      {startError || runtime.snapshot.error ? (
        <Text
          accessibilityLiveRegion="assertive"
          style={[styles.error, rtl && styles.rtl]}>
          {runtime.snapshot.error || copy.failed}
        </Text>
      ) : null}
      <Text style={[styles.advisory, rtl && styles.rtl]}>{copy.advisory}</Text>
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  page: {backgroundColor: colors.page},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  reverse: {flexDirection: 'row-reverse'},
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.76},
  header: {paddingTop: 8, paddingBottom: 24},
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.teal,
    letterSpacing: 0.7,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    marginTop: 10,
  },
  subtitle: {color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 8},
  cardGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  card: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 0,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
  },
  primaryCard: {backgroundColor: colors.teal, borderColor: colors.teal},
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardSymbol: {fontSize: 25, fontWeight: '500', color: colors.teal},
  tag: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '800',
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  tagPrimary: {color: '#CFEBE2'},
  cardTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: 12,
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  onPrimary: {color: '#FFFFFF'},
  primaryDescription: {color: '#DFEFE7'},
  compactCard: {flexBasis: 140, padding: 16},
  compactTitle: {fontSize: 17, lineHeight: 24, marginTop: 10},
  compactDescription: {fontSize: 13, lineHeight: 19, marginTop: 5},
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 27,
    marginBottom: 12,
  },
  guidedCard: {
    backgroundColor: '#E7F0E7',
    borderRadius: 24,
    padding: 22,
    marginTop: 20,
  },
  guidedTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: '700',
    marginTop: 10,
  },
  guidedAction: {marginTop: 20},
  footer: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24},
  advisory: {color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 20},
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
  },
  formNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepLabel: {color: colors.muted, fontSize: 13},
  steps: {flexDirection: 'row', gap: 7, marginTop: 20},
  step: {flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border},
  stepDone: {backgroundColor: colors.teal},
  formTitle: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    marginTop: 24,
  },
  choices: {gap: 10, marginTop: 22, marginBottom: 24},
  notesLabel: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 18,
    marginBottom: 8,
  },
  notes: {
    color: colors.ink,
    backgroundColor: colors.page,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    minHeight: 112,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 22,
  },
  summary: {marginTop: 8, marginBottom: 22},
  summaryRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 12,
  },
  summaryText: {color: colors.ink, fontSize: 14, flexShrink: 1},
  change: {color: colors.teal, fontSize: 13, fontWeight: '700'},
  status: {color: colors.teal, fontSize: 14, marginTop: 18},
  error: {color: '#9F2D27', fontSize: 14, marginTop: 18},
});
