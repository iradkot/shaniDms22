export type SharedAiContextInput = {
  language?: string;
  patientProfileSummary?: string | null;
  personality?: 'tachles' | 'nice' | 'buddha';
  clinicalFlags?: {
    pregnancy?: boolean;
    pediatric?: boolean;
    highRiskHypo?: boolean;
  } | null;
};

function personalityLine(personality?: 'tachles' | 'nice' | 'buddha', language?: string): string {
  const p = personality ?? 'nice';
  const he = (language ?? '').toLowerCase() === 'he';
  if (p === 'tachles') {
    return he
      ? 'persona_style: tachles (דיבור קצר ולעניין, ישיר, בלי בלבולי שכל)'
      : 'persona_style: tachles (short, direct, no fluff)';
  }
  if (p === 'buddha') {
    return he
      ? 'persona_style: buddha (רגוע, מקבל, שלו, אך עדיין פרקטי ובטוח רפואית)'
      : 'persona_style: buddha (calm, accepting, gentle tone, still practical and safety-first)';
  }
  return he
    ? 'persona_style: nice (מעודד, נעים, אמפתי ומעשי)'
    : 'persona_style: nice (encouraging, kind, empathic, practical)';
}

function personalityGuidelines(personality?: 'tachles' | 'nice' | 'buddha', language?: string): string {
  const p = personality ?? 'nice';
  const he = (language ?? '').toLowerCase() === 'he';

  if (p === 'tachles') {
    return he
      ? 'persona_guidelines: מקסימום 2-4 משפטים קצרים, בלי ריכוך מיותר, בלי חזרות, מסקנה ברורה + צעד פרקטי אחד.'
      : 'persona_guidelines: keep to 2-4 short sentences, no fluff, no repetition, clear conclusion + one practical next step.';
  }

  if (p === 'buddha') {
    return he
      ? 'persona_guidelines: טון רגוע ומקבל, קצב איטי ונקי מלחץ, לא שיפוטי, ולסיים בהכוונה עדינה ומעשית.'
      : 'persona_guidelines: calm and accepting tone, low-pressure pacing, non-judgmental wording, end with gentle practical guidance.';
  }

  return he
    ? 'persona_guidelines: טון חם ומעודד, אמפתי אך ממוקד, להסביר בקצרה למה ואז מה לעשות עכשיו.'
    : 'persona_guidelines: warm and encouraging tone, empathic but focused, briefly explain why and what to do now.';
}

function languageLine(language?: string): string {
  return (language ?? '').toLowerCase() === 'he'
    ? 'User app language is Hebrew. Output MUST be in natural Hebrew.'
    : 'User app language is English. Output MUST be in clear English.';
}

export function buildSharedAiContextBlock(input: SharedAiContextInput): string {
  const flags = input.clinicalFlags ?? {};
  const activeFlags: string[] = [];
  if (flags.pregnancy) activeFlags.push('pregnancy');
  if (flags.pediatric) activeFlags.push('pediatric');
  if (flags.highRiskHypo) activeFlags.push('high_risk_hypoglycemia');

  const profile = (input.patientProfileSummary ?? '').trim();

  return [
    '=== SHARED_AI_CONTEXT ===',
    languageLine(input.language),
    personalityLine(input.personality, input.language),
    personalityGuidelines(input.personality, input.language),
    `clinical_flags: ${activeFlags.length ? activeFlags.join(', ') : 'none'}`,
    `patient_profile_summary: ${profile || 'none provided'}`,
    'Apply this context consistently across reasoning and recommendations.',
    '=== /SHARED_AI_CONTEXT ===',
  ].join('\n');
}

export function withSharedAiContext(systemInstruction: string, input: SharedAiContextInput): string {
  const base = (systemInstruction ?? '').trim();
  return `${buildSharedAiContextBlock(input)}\n\n${base}`.trim();
}
