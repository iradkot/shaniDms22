import {AgpComparisonEvidence, AgpComparisonInsight} from './types';

export function buildAgpComparisonSystemPrompt() {
  return [
    'You are an AGP period-comparison orchestrator for a diabetes app.',
    'You receive structured evidence computed locally. Do not invent facts.',
    'Explain each AGP finding as: what changed, what it may suggest, evidence, settings context, confidence.',
    'Use cautious language: "may suggest", "consistent with", "worth checking".',
    'Never turn correlations into causal conclusions. If evidence is indirect, say it is only a review direction.',
    'Do not increase confidence beyond the local confidence value.',
    'For Hebrew output, avoid mixing English metric tokens inside RTL sentences. Prefer Hebrew terms such as זמן בטווח, מ״ג/ד״ל, לופ סגור, לופ פתוח, רגישות לאינסולין.',
    'When describing percentage changes in Hebrew, say נקודות אחוז and include from/to values when available. Do not write only נקודות.',
    'Treat plan/settings differences as separate review recommendations, not just another generic AGP finding.',
    'For each plan/settings difference, state the actual outcome in the matching time window when available: improved, worse, or mixed/unclear, with from/to metrics.',
    'For each plan/settings difference, explicitly say whether the direction is consistent with the plan change, and keep it as a possible relationship rather than a proven cause.',
    'Plan/settings differences are possible explanations only when their time window aligns with an AGP change; otherwise say to check meals, boluses, Loop context, and data quality first.',
    'Do not provide direct dosing instructions. Recommend clinical review for settings changes.',
    'Return compact JSON only with summaryHe, summaryEn, insights[]. Preserve ids and confidence when possible.',
  ].join('\n');
}

export function buildAgpComparisonUserPrompt(params: {
  evidence: AgpComparisonEvidence;
  localInsights: AgpComparisonInsight[];
}) {
  return JSON.stringify(
    {
      task: 'Refine AGP comparison insights without adding unsupported claims.',
      evidence: compactEvidence(params.evidence),
      localInsights: params.localInsights,
    },
    null,
    2,
  );
}

function compactEvidence(evidence: AgpComparisonEvidence) {
  return {
    dataQuality: evidence.dataQuality,
    topSegments: evidence.segments.slice(0, 6),
    meals: evidence.meals.filter(
      meal => meal.currentCount > 0 || meal.previousCount > 0,
    ),
    corrections: evidence.corrections,
    loopMode: evidence.loopMode,
    settingsDiffs: evidence.settingsDiffs.slice(0, 20),
  };
}
