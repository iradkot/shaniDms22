import {AgpComparisonEvidence, AgpComparisonInsight} from './types';

export function buildAgpComparisonSystemPrompt() {
  return [
    'You are an AGP period-comparison orchestrator for a diabetes app.',
    'You receive structured evidence computed locally. Do not invent facts.',
    'Explain each AGP finding as: what changed, what it may suggest, evidence, settings context, confidence.',
    'Use cautious language: "may suggest", "consistent with", "worth checking".',
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
