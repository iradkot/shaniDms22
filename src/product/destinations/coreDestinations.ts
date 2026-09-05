import {
  CORE_IMPLEMENTATION_KEYS,
  CoreImplementationKey,
} from './coreImplementationKeys';
import {DestinationDefinition, DestinationTargetPolicy} from './types';
import {destinationId} from './validation';

/**
 * These modules have real browser implementations. Journal data remains local
 * first and remote Firebase sync is still a separately configured capability.
 */
const UNIVERSAL_PLATFORMS = {
  platforms: ['ios', 'android', 'web'],
  requiredCapabilities: [],
} as const;

type CoreDestinationDefinition = DestinationDefinition & {
  readonly implementationKey: CoreImplementationKey;
};

const STANDARD_TARGETS: DestinationTargetPolicy = {
  favorite: true,
  start: true,
  shortcut: true,
};

const MANAGEMENT_TARGETS: DestinationTargetPolicy = {
  favorite: true,
  start: false,
  shortcut: true,
};

export const CORE_DESTINATION_IDS = {
  dayGraph: destinationId('core.day-graph'),
  dailyOverview: destinationId('core.daily-overview'),
  previousDaySummary: destinationId('core.previous-day-summary'),
  trends: destinationId('core.trends'),
  trendsOverview: destinationId('core.trends-overview'),
  trendsAgpDailyPatterns: destinationId('core.trends-agp-daily-patterns'),
  trendsComparePeriods: destinationId('core.trends-compare-periods'),
  trendsTherapyContext: destinationId('core.trends-therapy-context'),
  hypoInvestigation: destinationId('core.hypo-investigation'),
  similarEvents: destinationId('core.similar-events'),
  loopChangesImpact: destinationId('core.loop-changes-impact'),
  aiAnalyst: destinationId('core.ai-analyst'),
  aiGeneralChat: destinationId('core.ai-general-chat'),
  aiHypoSpecialist: destinationId('core.ai-hypo-specialist'),
  aiBehaviorSpecialist: destinationId('core.ai-behavior-specialist'),
  aiLoopSpecialist: destinationId('core.ai-loop-specialist'),
  aiMealSpecialist: destinationId('core.ai-meal-specialist'),
  meals: destinationId('core.meals'),
  activity: destinationId('core.activity'),
  updateCenter: destinationId('core.update-center'),
  alertRules: destinationId('core.alert-rules'),
  settings: destinationId('core.settings'),
} as const;

export const CORE_DESTINATIONS = [
  {
    id: CORE_DESTINATION_IDS.dayGraph,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.dayGraph,
    implementationKey: CORE_IMPLEMENTATION_KEYS.dayGraph,
    group: 'today',
    order: 10,
    copy: {
      en: {
        title: 'Day graph',
        description: 'Glucose, treatments, and events across one selected day.',
      },
      he: {
        title: 'גרף יומי',
        description: 'סוכר, טיפולים ואירועים לאורך היום שנבחר.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.dailyOverview,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.dailyOverview,
    implementationKey: CORE_IMPLEMENTATION_KEYS.dailyOverview,
    group: 'today',
    order: 20,
    copy: {
      en: {
        title: 'Daily overview',
        description: 'The selected day’s key glucose and insulin metrics.',
      },
      he: {
        title: 'מבט יומי',
        description: 'מדדי הסוכר והאינסולין המרכזיים של היום שנבחר.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.previousDaySummary,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.previousDaySummary,
    implementationKey: CORE_IMPLEMENTATION_KEYS.previousDaySummary,
    group: 'today',
    order: 30,
    copy: {
      en: {
        title: 'Previous day summary',
        description:
          'A retrospective of the previous day and its closing night.',
      },
      he: {
        title: 'סיכום היום הקודם',
        description: 'מבט מסכם על היום הקודם ועל הלילה שסגר אותו.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.trends,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.trends,
    implementationKey: CORE_IMPLEMENTATION_KEYS.trends,
    group: 'understand',
    order: 10,
    copy: {
      en: {
        title: 'Trends',
        description: 'Patterns, AGP, and comparisons across longer periods.',
      },
      he: {
        title: 'מגמות',
        description: 'דפוסים, AGP והשוואות לאורך תקופות.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.trendsOverview,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.trends,
    implementationKey: CORE_IMPLEMENTATION_KEYS.trendsOverview,
    order: 10,
    copy: {
      en: {
        title: 'Overview',
        description:
          'Range distribution, level, variability, coverage, and a matched previous period.',
      },
      he: {
        title: 'סקירה',
        description:
          'טווחים, רמת סוכר, שונות, כיסוי נתונים והשוואה לתקופה הקודמת.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.trendsAgpDailyPatterns,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.trends,
    implementationKey: CORE_IMPLEMENTATION_KEYS.trendsAgpDailyPatterns,
    order: 20,
    copy: {
      en: {
        title: 'AGP & daily patterns',
        description:
          'See recurring times of day together with the individual days behind them.',
      },
      he: {
        title: 'AGP ודפוסים יומיים',
        description:
          'זיהוי שעות שחוזרות על עצמן לצד הימים הבודדים שמרכיבים את התמונה.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.trendsComparePeriods,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.trends,
    implementationKey: CORE_IMPLEMENTATION_KEYS.trendsComparePeriods,
    order: 30,
    copy: {
      en: {
        title: 'Compare periods',
        description:
          'Compare equal periods with coverage and target settings visible for both.',
      },
      he: {
        title: 'השוואת תקופות',
        description:
          'השוואת תקופות שוות כאשר כיסוי הנתונים והטווחים גלויים בשתיהן.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.trendsTherapyContext,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.trends,
    implementationKey: CORE_IMPLEMENTATION_KEYS.trendsTherapyContext,
    order: 40,
    copy: {
      en: {
        title: 'Therapy context',
        description:
          'Inspect recorded insulin, carbohydrates, activity, and AID periods when source evidence is reliable.',
      },
      he: {
        title: 'הקשר טיפולי',
        description:
          'בדיקת אינסולין, פחמימות, פעילות ותקופות AID שתועדו, כאשר ראיות המקור אמינות.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.hypoInvestigation,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.hypoInvestigation,
    implementationKey: CORE_IMPLEMENTATION_KEYS.hypoInvestigation,
    group: 'understand',
    order: 20,
    copy: {
      en: {
        title: 'Hypo investigation',
        description: 'Explore low events, their timing, and possible context.',
      },
      he: {
        title: 'חקירת היפו',
        description: 'בדיקת אירועי סוכר נמוך, התזמון וההקשר האפשרי.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.similarEvents,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.similarEvents,
    implementationKey: CORE_IMPLEMENTATION_KEYS.similarEvents,
    group: 'understand',
    order: 30,
    copy: {
      en: {
        title: 'Similar events',
        description: 'Compare one event with similar historical situations.',
      },
      he: {
        title: 'אירועים דומים',
        description: 'השוואת אירוע אחד למצבים היסטוריים דומים.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.loopChangesImpact,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.loopChangesImpact,
    implementationKey: CORE_IMPLEMENTATION_KEYS.loopChangesImpact,
    group: 'understand',
    order: 40,
    copy: {
      en: {
        title: 'Loop changes and impact',
        description:
          'Review setting changes and observed before-and-after results.',
      },
      he: {
        title: 'שינויי Loop והשפעתם',
        description: 'סקירת שינויי הגדרות והתוצאות שנצפו לפניהם ואחריהם.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.aiAnalyst,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.aiAnalyst,
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiAnalyst,
    group: 'ask',
    order: 10,
    copy: {
      en: {
        title: 'AI analyst',
        description: 'Chat about your data or open a focused investigation.',
      },
      he: {
        title: 'AI Analyst',
        description: 'שיחה על הנתונים או פתיחת חקירה ממוקדת.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.aiGeneralChat,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.aiAnalyst,
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiGeneralChat,
    order: 10,
    copy: {
      en: {
        title: 'General chat',
        description: 'Ask a simple question about your data and its context.',
      },
      he: {
        title: 'צ׳אט כללי',
        description: 'שאלה פשוטה על הנתונים וההקשר שלהם.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.aiHypoSpecialist,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.aiAnalyst,
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiHypoSpecialist,
    order: 20,
    copy: {
      en: {
        title: 'Low-glucose investigation',
        description: 'Inspect repeated low events, timing, and nearby context.',
      },
      he: {
        title: 'חקירת סוכר נמוך',
        description: 'בדיקת אירועי סוכר נמוך חוזרים, התזמון וההקשר הסמוך.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.aiBehaviorSpecialist,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.aiAnalyst,
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiBehaviorSpecialist,
    order: 30,
    copy: {
      en: {
        title: 'Habits and routines',
        description: 'Explore repeated observations around daily behaviour.',
      },
      he: {
        title: 'הרגלים ושגרה',
        description: 'חקירת תצפיות שחוזרות סביב ההתנהלות היומית.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.aiLoopSpecialist,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.aiAnalyst,
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiLoopSpecialist,
    order: 40,
    copy: {
      en: {
        title: 'Loop advice',
        description:
          'Review evidence and receive advisory suggestions without changing settings.',
      },
      he: {
        title: 'ייעוץ לשיפור Loop',
        description: 'סקירת ראיות והצעות בלבד, ללא שינוי ישיר של ההגדרות.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.aiMealSpecialist,
    kind: 'module-child',
    ownerModuleId: CORE_DESTINATION_IDS.aiAnalyst,
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiMealSpecialist,
    order: 50,
    copy: {
      en: {
        title: 'Meal analysis',
        description: 'Discuss repeated glucose observations around meals.',
      },
      he: {
        title: 'ניתוח ארוחות',
        description: 'שיחה על תצפיות סוכר שחוזרות סביב ארוחות.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.meals,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.meals,
    implementationKey: CORE_IMPLEMENTATION_KEYS.meals,
    group: 'record',
    order: 10,
    copy: {
      en: {
        title: 'Meals',
        description: 'Record meals and review observed glucose outcomes.',
      },
      he: {
        title: 'ארוחות',
        description: 'רישום ארוחות ובדיקת תגובות הסוכר שנצפו אחריהן.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.activity,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.activity,
    implementationKey: CORE_IMPLEMENTATION_KEYS.activity,
    group: 'record',
    order: 20,
    copy: {
      en: {
        title: 'Activity',
        description: 'Record activity and review glucose around it.',
      },
      he: {
        title: 'פעילות',
        description: 'רישום פעילות ובדיקת הסוכר סביבה.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.updateCenter,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.updateCenter,
    implementationKey: CORE_IMPLEMENTATION_KEYS.updateCenter,
    group: 'updates',
    order: 10,
    copy: {
      en: {
        title: 'Update center',
        description: 'Recent alerts, reminders, and generated updates.',
      },
      he: {
        title: 'מרכז עדכונים',
        description: 'התראות, תזכורות ועדכונים שנוצרו לאחרונה.',
      },
    },
    targetPolicy: STANDARD_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.alertRules,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.alertRules,
    implementationKey: CORE_IMPLEMENTATION_KEYS.alertRules,
    group: 'updates',
    order: 20,
    copy: {
      en: {
        title: 'Alert rules',
        description: 'Choose which app alerts you want and when.',
      },
      he: {
        title: 'כללי התראות',
        description: 'בחירת ההתראות שיישלחו מהאפליקציה ומתי.',
      },
    },
    targetPolicy: MANAGEMENT_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
  {
    id: CORE_DESTINATION_IDS.settings,
    kind: 'module',
    ownerModuleId: CORE_DESTINATION_IDS.settings,
    implementationKey: CORE_IMPLEMENTATION_KEYS.settings,
    group: 'manage',
    order: 10,
    copy: {
      en: {
        title: 'Settings',
        description: 'Manage connections, preferences, and diagnostics.',
      },
      he: {
        title: 'הגדרות',
        description: 'ניהול חיבורים, העדפות ואבחון טכני.',
      },
    },
    targetPolicy: MANAGEMENT_TARGETS,
    availability: UNIVERSAL_PLATFORMS,
  },
] as const satisfies readonly CoreDestinationDefinition[];
