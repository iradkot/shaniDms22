export type RankTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';

export interface RankMetrics {
  tir: number;
  lows: number;
  highs: number;
}

export interface RankBreakdown {
  base: number;
  tirBonus: number;
  lowPenalty: number;
  highPenalty: number;
}

export interface RankState {
  tier: RankTier;
  score: number;
  nextTier: RankTier | null;
  progressToNextPct: number;
  shortGoal: string;
  breakdown: RankBreakdown;
}

const TIERS: Array<{tier: RankTier; minScore: number}> = [
  {tier: 'Bronze', minScore: 0},
  {tier: 'Silver', minScore: 35},
  {tier: 'Gold', minScore: 55},
  {tier: 'Platinum', minScore: 75},
  {tier: 'Diamond', minScore: 90},
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function computeRank(metrics: RankMetrics): RankState {
  const base = 35;
  const tirBonus = clamp((metrics.tir - 50) * 1.2, 0, 60);
  const lowPenalty = clamp(metrics.lows * 2.8, 0, 30);
  const highPenalty = clamp(metrics.highs * 0.6, 0, 25);

  const score = Math.round(clamp(base + tirBonus - lowPenalty - highPenalty, 0, 100));

  let tier: RankTier = 'Bronze';
  for (const t of TIERS) {
    if (score >= t.minScore) tier = t.tier;
  }

  const idx = TIERS.findIndex(t => t.tier === tier);
  const next = TIERS[idx + 1] ?? null;

  const progressToNextPct = next
    ? Math.round(clamp(((score - TIERS[idx].minScore) / (next.minScore - TIERS[idx].minScore)) * 100, 0, 100))
    : 100;

  let shortGoal = 'Maintain your pattern.';
  if (metrics.lows > 0) shortGoal = 'Reduce low events this week.';
  else if (metrics.tir < 75) shortGoal = 'Raise weekly TIR above 75%.';
  else if (metrics.highs > 20) shortGoal = 'Reduce post-meal highs.';

  return {
    tier,
    score,
    nextTier: next?.tier ?? null,
    progressToNextPct,
    shortGoal,
    breakdown: {
      base,
      tirBonus: Math.round(tirBonus),
      lowPenalty: Math.round(lowPenalty),
      highPenalty: Math.round(highPenalty),
    },
  };
}
