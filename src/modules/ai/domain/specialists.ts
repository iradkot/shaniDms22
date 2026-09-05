import type {AiSpecialistDefinition, AiSpecialistId} from './types';

/** Curated V1 registry. Runtime-created medical specialists are not allowed. */
export const AI_SPECIALIST_DEFINITIONS = [
  {
    id: 'general-chat',
    category: 'primary',
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
  },
  {
    id: 'hypo-investigation',
    category: 'investigation',
    copy: {
      en: {
        title: 'Low-glucose investigation',
        description: 'Review repeated lows, their timing, and nearby context.',
      },
      he: {
        title: 'חקירת סוכר נמוך',
        description: 'בדיקת אירועי סוכר נמוך חוזרים, התזמון וההקשר הסמוך.',
      },
    },
  },
  {
    id: 'behavior-analysis',
    category: 'investigation',
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
  },
  {
    id: 'meal-analysis',
    category: 'investigation',
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
  },
  {
    id: 'loop-advice',
    category: 'improvement',
    copy: {
      en: {
        title: 'Loop advice',
        description: 'Review evidence without applying any setting change.',
      },
      he: {
        title: 'ייעוץ לשיפור Loop',
        description: 'סקירת ראיות ללא ביצוע שינוי בהגדרות.',
      },
    },
  },
] as const satisfies readonly AiSpecialistDefinition[];

const definitionById = new Map<AiSpecialistId, AiSpecialistDefinition>(
  AI_SPECIALIST_DEFINITIONS.map(definition => [definition.id, definition]),
);

export const getAiSpecialistDefinition = (
  specialist: AiSpecialistId,
): AiSpecialistDefinition => {
  const definition = definitionById.get(specialist);
  if (!definition) {
    throw new Error(`Unknown curated AI specialist: ${specialist}`);
  }
  return definition;
};
