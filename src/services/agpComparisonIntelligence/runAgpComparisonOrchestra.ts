import type {LlmChatMessage, LlmProvider} from 'app/services/llm/llmTypes';

import {analyzeAgpSegments} from './agpSegmentAnalyzer';
import {analyzeCorrections} from './correctionAnalyzer';
import {analyzeLoopContext} from './loopContextAnalyzer';
import {analyzeMealComparisons} from './mealComparisonAnalyzer';
import {
  buildAgpComparisonSystemPrompt,
  buildAgpComparisonUserPrompt,
} from './prompts';
import {analyzeSettingsDiffs} from './settingsDiffAnalyzer';
import {
  AgpComparisonAnalysisResult,
  AgpComparisonEvidence,
  AgpComparisonInsight,
} from './types';

export type RunAgpComparisonOrchestraParams = {
  evidence: AgpComparisonEvidence;
  provider?: LlmProvider | null;
  model?: string;
  abortSignal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export async function runAgpComparisonOrchestra(
  params: RunAgpComparisonOrchestraParams,
): Promise<AgpComparisonAnalysisResult> {
  params.onProgress?.('Analyzing AGP pattern');
  const agpInsights = analyzeAgpSegments(params.evidence);

  params.onProgress?.('Checking meals');
  const mealInsights = analyzeMealComparisons(params.evidence);

  params.onProgress?.('Checking corrections');
  const correctionInsights = analyzeCorrections(params.evidence);

  params.onProgress?.('Checking Loop context');
  const loopInsights = analyzeLoopContext(params.evidence);

  params.onProgress?.('Comparing settings');
  const settingsInsights = analyzeSettingsDiffs(params.evidence);

  const localInsights = dedupeInsights([
    ...agpInsights,
    ...mealInsights,
    ...correctionInsights,
    ...loopInsights,
    ...settingsInsights,
  ]);

  const localResult = buildResult(params.evidence, localInsights, false);
  if (!params.provider || !params.model || localInsights.length === 0) {
    return localResult;
  }

  try {
    params.onProgress?.('Writing final analysis');
    const refined = await refineWithLlm({
      evidence: params.evidence,
      localInsights,
      provider: params.provider,
      model: params.model,
      abortSignal: params.abortSignal,
    });
    if (!refined) {
      return localResult;
    }
    return {
      evidence: params.evidence,
      insights: refined.insights.length ? refined.insights : localInsights,
      summaryHe: refined.summaryHe || localResult.summaryHe,
      summaryEn: refined.summaryEn || localResult.summaryEn,
      generatedAt: Date.now(),
      usedLlm: true,
    };
  } catch {
    return localResult;
  }
}

function buildResult(
  evidence: AgpComparisonEvidence,
  insights: AgpComparisonInsight[],
  usedLlm: boolean,
): AgpComparisonAnalysisResult {
  return {
    evidence,
    insights,
    summaryHe: buildSummary(insights, 'he'),
    summaryEn: buildSummary(insights, 'en'),
    generatedAt: Date.now(),
    usedLlm,
  };
}

async function refineWithLlm(params: {
  evidence: AgpComparisonEvidence;
  localInsights: AgpComparisonInsight[];
  provider: LlmProvider;
  model: string;
  abortSignal?: AbortSignal;
}): Promise<Pick<
  AgpComparisonAnalysisResult,
  'summaryHe' | 'summaryEn' | 'insights'
> | null> {
  const messages: LlmChatMessage[] = [
    {role: 'system', content: buildAgpComparisonSystemPrompt()},
    {
      role: 'user',
      content: buildAgpComparisonUserPrompt({
        evidence: params.evidence,
        localInsights: params.localInsights,
      }),
    },
  ];
  const response = await params.provider.sendChat({
    model: params.model,
    messages,
    temperature: 0.2,
    maxOutputTokens: 1400,
    abortSignal: params.abortSignal,
  });
  return parseRefinedResponse(response.content, params.localInsights);
}

function parseRefinedResponse(
  raw: string,
  fallbackInsights: AgpComparisonInsight[],
) {
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    const insights = Array.isArray(parsed?.insights)
      ? parsed.insights
          .map((candidate: any) =>
            mergeWithFallback(candidate, fallbackInsights),
          )
          .filter(Boolean)
      : [];
    return {
      summaryHe: typeof parsed?.summaryHe === 'string' ? parsed.summaryHe : '',
      summaryEn: typeof parsed?.summaryEn === 'string' ? parsed.summaryEn : '',
      insights,
    };
  } catch {
    return null;
  }
}

function mergeWithFallback(
  candidate: any,
  fallbackInsights: AgpComparisonInsight[],
): AgpComparisonInsight | null {
  const id = typeof candidate?.id === 'string' ? candidate.id : '';
  const fallback = fallbackInsights.find(insight => insight.id === id);
  if (!fallback) {
    return null;
  }
  return {
    ...fallback,
    titleHe: text(candidate.titleHe, fallback.titleHe),
    titleEn: text(candidate.titleEn, fallback.titleEn),
    whatChangedHe: text(candidate.whatChangedHe, fallback.whatChangedHe),
    whatChangedEn: text(candidate.whatChangedEn, fallback.whatChangedEn),
    possibleDriversHe: stringArray(
      candidate.possibleDriversHe,
      fallback.possibleDriversHe,
    ),
    possibleDriversEn: stringArray(
      candidate.possibleDriversEn,
      fallback.possibleDriversEn,
    ),
    evidenceHe: stringArray(candidate.evidenceHe, fallback.evidenceHe),
    evidenceEn: stringArray(candidate.evidenceEn, fallback.evidenceEn),
    settingsContextHe: text(
      candidate.settingsContextHe,
      fallback.settingsContextHe,
    ),
    settingsContextEn: text(
      candidate.settingsContextEn,
      fallback.settingsContextEn,
    ),
  };
}

function buildSummary(insights: AgpComparisonInsight[], language: 'he' | 'en') {
  if (!insights.length) {
    return language === 'he'
      ? 'לא נמצאו הבדלים משמעותיים מספיק להסבר אוטומטי בין התקופות.'
      : 'No sufficiently meaningful period differences were found for automatic explanation.';
  }
  const highOrMedium = insights.filter(insight => insight.confidence !== 'low');
  const count = highOrMedium.length || insights.length;
  return language === 'he'
    ? `נמצאו ${count} הבדלים שווים בדיקה בין התקופות. כל ממצא מוצג עם ראיות ורמת ביטחון.`
    : `Found ${count} period differences worth checking. Each finding includes evidence and confidence.`;
}

function dedupeInsights(insights: AgpComparisonInsight[]) {
  const seen = new Set<string>();
  return insights.filter(insight => {
    if (seen.has(insight.id)) {
      return false;
    }
    seen.add(insight.id);
    return true;
  });
}

function stripCodeFence(raw: string) {
  return String(raw ?? '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function text(value: unknown, fallback: string | undefined) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : fallback ?? '';
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.map(item => String(item)).filter(Boolean)
    : fallback;
}
