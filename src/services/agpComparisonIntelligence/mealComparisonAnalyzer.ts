import {
  AgpComparisonEvidence,
  AgpComparisonInsight,
  AgpMealComparison,
} from './types';

export function analyzeMealComparisons(
  evidence: AgpComparisonEvidence,
): AgpComparisonInsight[] {
  return evidence.meals
    .filter(hasMealSignal)
    .sort((a, b) => mealScore(b) - mealScore(a))
    .slice(0, 3)
    .map(buildMealInsight);
}

function hasMealSignal(meal: AgpMealComparison) {
  if (meal.currentCount < 3 || meal.previousCount < 3) {
    return false;
  }
  return (
    Math.abs(diff(meal.currentAvgRise, meal.previousAvgRise) ?? 0) >= 25 ||
    Math.abs(diff(meal.currentAvgPeak, meal.previousAvgPeak) ?? 0) >= 25 ||
    Math.abs(
      diff(
        meal.currentAvgBolusMinutesBefore,
        meal.previousAvgBolusMinutesBefore,
      ) ?? 0,
    ) >= 12
  );
}

function buildMealInsight(meal: AgpMealComparison): AgpComparisonInsight {
  const riseDelta = diff(meal.currentAvgRise, meal.previousAvgRise);
  const peakDelta = diff(meal.currentAvgPeak, meal.previousAvgPeak);
  const timingDelta = diff(
    meal.currentAvgBolusMinutesBefore,
    meal.previousAvgBolusMinutesBefore,
  );
  const worse = (riseDelta ?? peakDelta ?? 0) > 0;
  const labelHe = mealLabel(meal.mealType, 'he');
  const labelEn = mealLabel(meal.mealType, 'en');

  const possibleDriversHe = [
    'יחס פחמימות לא מתאים לחלון הזה',
    'תזמון בולוס מאוחר או מוקדם מדי',
    'הערכת פחמימות שונה בין התקופות',
  ];
  const possibleDriversEn = [
    'Carb ratio mismatch in this window',
    'Bolus timing too late or too early',
    'Different carb estimation between periods',
  ];

  if ((timingDelta ?? 0) < -10) {
    possibleDriversHe.unshift(
      'בולוס מוקדם יותר בתקופה הנוכחית עשוי להסביר שיפור',
    );
    possibleDriversEn.unshift(
      'Earlier bolus in the current period may explain improvement',
    );
  } else if ((timingDelta ?? 0) > 10) {
    possibleDriversHe.unshift(
      'בולוס מאוחר יותר בתקופה הנוכחית יכול להסביר עלייה אחרי אוכל',
    );
    possibleDriversEn.unshift(
      'Later bolus in the current period may explain post-meal rise',
    );
  }

  return {
    id: `meal-${meal.mealType}`,
    category: 'meal',
    titleHe: `${labelHe}: ${
      worse ? 'פחות מאוזנת אחרי אוכל' : 'מאוזנת יותר אחרי אוכל'
    }`,
    titleEn: `${labelEn}: ${
      worse ? 'less balanced after meals' : 'more balanced after meals'
    }`,
    whatChangedHe: [
      worse
        ? 'בפועל: הסוכר נוטה לעלות יותר אחרי הארוחה או להישאר יותר זמן מחוץ לטווח'
        : 'בפועל: אחרי הארוחה יש נטייה לעלייה מתונה יותר או חזרה טובה יותר לטווח',
      riseDelta != null
        ? `העלייה הממוצעת השתנתה ב־${formatSigned(riseDelta)} מ״ג/ד״ל`
        : null,
      peakDelta != null
        ? `שיא הסוכר אחרי האוכל השתנה ב־${formatSigned(peakDelta)} מ״ג/ד״ל`
        : null,
      timingDelta != null
        ? `תזמון הבולוס השתנה ב־${formatSigned(timingDelta)} דקות לפני האוכל`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
    whatChangedEn: [
      worse
        ? 'In practice: glucose tends to rise more after the meal or stay out of range longer'
        : 'In practice: the post-meal rise is milder or returns to range better',
      riseDelta != null
        ? `Average rise changed by ${formatSigned(riseDelta)} mg/dL`
        : null,
      peakDelta != null
        ? `Peak changed by ${formatSigned(peakDelta)} mg/dL`
        : null,
      timingDelta != null
        ? `Bolus timing changed by ${formatSigned(
            timingDelta,
          )} minutes before meal`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
    possibleDriversHe,
    possibleDriversEn,
    evidenceHe: [
      `${meal.currentCount} ארוחות בתקופה הנוכחית מול ${meal.previousCount} בתקופה הקודמת`,
      `פחמימות ממוצעות: ${formatNullable(
        meal.currentAvgCarbs,
      )} גרם מול ${formatNullable(meal.previousAvgCarbs)} גרם`,
    ],
    evidenceEn: [
      `${meal.currentCount} current meals vs ${meal.previousCount} previous meals`,
      `Average carbs: ${formatNullable(
        meal.currentAvgCarbs,
      )}g vs ${formatNullable(meal.previousAvgCarbs)}g`,
    ],
    confidence:
      meal.currentCount >= 6 && meal.previousCount >= 6 ? 'medium' : 'low',
  };
}

function mealScore(meal: AgpMealComparison) {
  return (
    Math.abs(diff(meal.currentAvgRise, meal.previousAvgRise) ?? 0) +
    Math.abs(diff(meal.currentAvgPeak, meal.previousAvgPeak) ?? 0) +
    Math.abs(
      diff(
        meal.currentAvgBolusMinutesBefore,
        meal.previousAvgBolusMinutesBefore,
      ) ?? 0,
    )
  );
}

function mealLabel(
  mealType: AgpMealComparison['mealType'],
  language: 'he' | 'en',
) {
  const he = {
    breakfast: 'ארוחת בוקר',
    lunch: 'צהריים',
    dinner: 'ערב',
    snack: 'נשנושים',
  };
  const en = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
  };
  return language === 'he' ? he[mealType] : en[mealType];
}

function diff(current: number | null, previous: number | null) {
  return current == null || previous == null ? null : current - previous;
}

function formatSigned(value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${rounded}`;
}

function formatNullable(value: number | null) {
  return value == null ? '-' : value.toFixed(0);
}
