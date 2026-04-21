export type SharedAiContextInput = {
  language?: string;
  patientProfileSummary?: string | null;
  clinicalFlags?: {
    pregnancy?: boolean;
    pediatric?: boolean;
    highRiskHypo?: boolean;
  } | null;
};

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
