# Loop Settings Impact Analysis - High-Level Design (HLD)

> **Version:** 1.0  
> **Date:** January 31, 2026  
> **Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Architecture Overview](#3-architecture-overview)
4. [Domain Model & Type Contracts](#4-domain-model--type-contracts)
5. [Service Layer Design](#5-service-layer-design)
6. [Hook Layer Design](#6-hook-layer-design)
7. [UI Components](#7-ui-components)
8. [LLM Integration Strategy](#8-llm-integration-strategy)
9. [Data Flow & State Management](#9-data-flow--state-management)
10. [Error Handling & Edge Cases](#10-error-handling--edge-cases)
11. [Performance Considerations](#11-performance-considerations)
12. [Testing Strategy](#12-testing-strategy)
13. [Folder Structure](#13-folder-structure)
14. [Implementation Phases](#14-implementation-phases)
15. [Open Questions & Future Enhancements](#15-open-questions--future-enhancements)

---

## 1. Executive Summary

This document describes the architecture for the **Loop Settings Impact Analysis** feature, which allows users to:

1. **View a history** of profile/settings changes from their Loop system (DIY Loop iOS, AndroidAPS)
2. **Analyze the clinical impact** of each change by comparing glucose metrics before and after
3. **Visualize pattern shifts** via an overlay "ghost" chart showing old vs. new glucose patterns
4. **Get AI-powered insights** through natural language queries about settings changes

The design follows a **Service-Oriented Architecture (SOA)** with a clear separation between:
- **Pure functions** (stateless, testable business logic)
- **Services** (data fetching, caching, orchestration)
- **Hooks** (React state management, UI binding)
- **Components** (presentation layer)

This architecture ensures the analysis logic is **headless** and can be consumed by both the UI and the LLM tool system.

---

## 2. Goals & Non-Goals

### Goals

| Priority | Goal |
|----------|------|
| P0 | Detect profile/settings change events from Nightscout treatments |
| P0 | Calculate pre/post comparison metrics (TIR, Avg BG, Hypos, Variability) |
| P0 | Surface statistically meaningful deltas with clear UI indicators |
| P1 | Render "Ghost Chart" overlay comparing hourly glucose patterns |
| P1 | Expose analysis as an LLM tool for AI Analyst integration |
| P2 | Support AndroidAPS profile switch events |
| P2 | Allow configurable comparison windows (3, 7, 14, 30 days) |

### Non-Goals (Out of Scope for v1)

- Manual settings entry (we only detect from Nightscout data)
- Specific Loop parameter diff visualization (ISF/CR/Basal values)
- Causal inference or ML-based predictions
- Cross-profile comparisons (only before/after same profile)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                            │
├─────────────────────────────────────────────────────────────────────────┤
│  SettingsAuditScreen     │   ImpactDetailScreen    │   GhostChartView   │
│  (List of changes)       │   (Before/After card)   │   (Overlay graph)  │
└─────────────┬────────────┴────────────┬────────────┴─────────┬──────────┘
              │                         │                      │
              ▼                         ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              HOOK LAYER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│   useProfileHistory()     │    useSettingsImpact()    │  (React Query)  │
│   - Fetches change events │    - Runs analysis        │                 │
│   - Caching & pagination  │    - Returns typed result │                 │
└─────────────┬─────────────┴────────────┬──────────────┴─────────────────┘
              │                          │
              ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            SERVICE LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  profileHistoryService.ts  │   impactAnalysisService.ts                 │
│  - Parse treatment events  │   - Fetch BG for windows                   │
│  - Normalize across Loop   │   - Compute PeriodStats                    │
│    variants                │   - Compute hourly aggregates              │
└─────────────┬──────────────┴────────────┬───────────────────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PURE FUNCTIONS LAYER                             │
├─────────────────────────────────────────────────────────────────────────┤
│  impactAnalysis.utils.ts   │   profileParsing.utils.ts                  │
│  - calculatePeriodStats()  │   - parseLoopProfileSwitch()               │
│  - computeHourlyAverages() │   - parseAndroidAPSSwitch()                │
│  - computeDeltas()         │   - normalizeProfileChangeEvent()          │
│  - isStatisticallySignif() │                                            │
└─────────────┬──────────────┴────────────┬───────────────────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA / API LAYER                                │
├─────────────────────────────────────────────────────────────────────────┤
│  apiRequests.ts            │   Existing Nightscout instance              │
│  - fetchTreatmentsForDate  │   - /api/v1/treatments                     │
│  - fetchBgDataForDateRange │   - /api/v1/entries                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Headless-First**: All analysis logic lives in pure functions and services, not hooks
2. **Contract-Driven**: Strict TypeScript interfaces define the "bridge" between layers
3. **Reuse Existing Patterns**: Follow `oracle/` service patterns for caching and computation
4. **LLM-Ready**: Output shapes are JSON-serializable for AI tool consumption
5. **Progressive Enhancement**: Start with basic metrics, add statistical tests later

---

## 4. Domain Model & Type Contracts

### 4.1 Profile Change Event Types

```typescript
// src/types/loopAnalysis.types.ts

/**
 * Source system that detected the profile change.
 */
export type LoopSystemSource = 'loop-ios' | 'androidaps' | 'unknown';

/**
 * Normalized representation of a profile/settings change event.
 * This is the "canonical" shape regardless of source system.
 */
export interface ProfileChangeEvent {
  /** Unique identifier (derived from timestamp + source). */
  id: string;
  
  /** When the change was detected (ms since epoch). */
  timestamp: number;
  
  /** Source system that reported the change. */
  source: LoopSystemSource;
  
  /** Raw event type from Nightscout (e.g., "Profile Switch", "Note"). */
  eventType: string;
  
  /** Profile name if available (e.g., "High Activity", "Default"). */
  profileName?: string;
  
  /** Human-readable summary of what changed. */
  summary: string;
  
  /** Raw Nightscout treatment object for debugging. */
  _raw?: unknown;
}

/**
 * Filter criteria for querying profile change history.
 */
export interface ProfileHistoryFilter {
  /** Start of the date range (ms). */
  startMs?: number;
  /** End of the date range (ms). */
  endMs?: number;
  /** Filter by source system. */
  source?: LoopSystemSource;
  /** Maximum number of events to return. */
  limit?: number;
}
```

### 4.2 Period Statistics

```typescript
// src/types/loopAnalysis.types.ts (continued)

/**
 * Aggregated glucose statistics for a time period.
 * All percentages are 0-100 scale.
 */
export interface PeriodStats {
  /** Start of the period (ms). */
  startMs: number;
  /** End of the period (ms). */
  endMs: number;
  
  /** Number of valid CGM readings in the period. */
  sampleCount: number;
  
  /** Mean glucose (mg/dL). */
  averageBg: number;
  
  /** Standard deviation of glucose (mg/dL). */
  stdDev: number;
  
  /** Coefficient of variation (stdDev / mean * 100). */
  cv: number;
  
  /** Time in Range percentages. */
  timeInRange: {
    veryLow: number;  // <= 54 mg/dL
    low: number;      // 55-69 mg/dL
    target: number;   // 70-180 mg/dL (or user-configured)
    high: number;     // 181-250 mg/dL
    veryHigh: number; // > 250 mg/dL
  };
  
  /** Count of distinct hypoglycemic events (< 70 mg/dL). */
  hypoEventCount: number;
  
  /** Count of distinct hyperglycemic events (> 180 mg/dL). */
  hyperEventCount: number;
  
  /** Average total daily insulin (units) if available. */
  totalInsulinDailyAverage: number | null;
  
  /** GMI (Glucose Management Indicator) estimated A1c. */
  gmi: number | null;
}

/**
 * Hourly glucose aggregate for pattern visualization.
 */
export interface HourlyAggregate {
  /** Hour of day (0-23). */
  hour: number;
  /** Mean glucose for this hour (mg/dL). */
  meanBg: number;
  /** P10 glucose (10th percentile). */
  p10: number;
  /** P25 glucose (25th percentile). */
  p25: number;
  /** Median glucose (P50). */
  median: number;
  /** P75 glucose (75th percentile). */
  p75: number;
  /** P90 glucose (90th percentile). */
  p90: number;
  /** Sample count for this hour. */
  count: number;
}
```

### 4.3 Impact Analysis Result

```typescript
// src/types/loopAnalysis.types.ts (continued)

/**
 * Delta metrics comparing two periods.
 */
export interface ImpactDeltas {
  /** TIR difference (postChange.target - preChange.target). */
  tirDelta: number;
  
  /** Average BG difference (postChange.avg - preChange.avg). */
  avgBgDelta: number;
  
  /** CV difference (postChange.cv - preChange.cv). */
  cvDelta: number;
  
  /** Hypo event count difference. */
  hypoCountDelta: number;
  
  /** Hyper event count difference. */
  hyperCountDelta: number;
  
  /** 
   * Whether the change is statistically meaningful.
   * Simple heuristic for v1: |tirDelta| >= 3 OR |avgBgDelta| >= 10.
   */
  isSignificant: boolean;
  
  /**
   * Overall direction of improvement.
   * 'improved' = better TIR or lower avg BG (within reason).
   * 'worsened' = worse metrics.
   * 'neutral' = no significant change.
   */
  overallTrend: 'improved' | 'worsened' | 'neutral';
}

/**
 * Complete analysis result for a settings change.
 * This is the "contract" consumed by both UI and LLM tools.
 */
export interface ImpactAnalysisResult {
  /** The profile change event being analyzed. */
  changeEvent: ProfileChangeEvent;
  
  /** Comparison window size in days. */
  windowDays: number;
  
  /** Statistics for the period BEFORE the change. */
  preChange: PeriodStats;
  
  /** Statistics for the period AFTER the change. */
  postChange: PeriodStats;
  
  /** Pre-computed deltas for easy consumption. */
  deltas: ImpactDeltas;
  
  /** Hourly aggregates for the pre-change period (for ghost chart). */
  preHourlyAggregates: HourlyAggregate[];
  
  /** Hourly aggregates for the post-change period. */
  postHourlyAggregates: HourlyAggregate[];
  
  /** Data quality indicators. */
  dataQuality: {
    prePeriodCoverage: number;  // 0-1, percentage of expected readings present
    postPeriodCoverage: number;
    hasEnoughData: boolean;     // Both periods have >= 70% coverage
    warnings: string[];         // Human-readable quality warnings
  };
  
  /** Timestamp when analysis was computed. */
  computedAt: number;
}

/**
 * Input parameters for impact analysis.
 */
export interface ImpactAnalysisParams {
  /** The profile change event to analyze. */
  changeEvent: ProfileChangeEvent;
  /** Number of days before/after to compare. Default: 7. */
  windowDays?: number;
  /** Custom TIR thresholds (uses defaults if not provided). */
  tirThresholds?: {
    veryLowMax: number;
    targetMin: number;
    targetMax: number;
    highMax: number;
  };
}
```

### 4.4 LLM Tool Definition

```typescript
// src/services/aiAnalyst/loopAnalysisTool.types.ts

/**
 * Tool input schema for LLM consumption.
 */
export interface AnalyzeSettingsImpactToolInput {
  /** ISO date string of the change to analyze. */
  changeDate: string;
  /** Days before/after to compare (default: 7, max: 30). */
  windowDays?: number;
}

/**
 * Tool output schema (subset of ImpactAnalysisResult for LLM).
 */
export interface AnalyzeSettingsImpactToolOutput {
  success: boolean;
  changeDate: string;
  windowDays: number;
  
  preChange: {
    avgBg: number;
    tirPercent: number;
    hypoCount: number;
    cv: number;
  };
  
  postChange: {
    avgBg: number;
    tirPercent: number;
    hypoCount: number;
    cv: number;
  };
  
  deltas: {
    tirDelta: number;
    avgBgDelta: number;
    isSignificant: boolean;
    overallTrend: 'improved' | 'worsened' | 'neutral';
  };
  
  /** Natural language summary for the LLM to use. */
  summary: string;
  
  /** Data quality warning if applicable. */
  warning?: string;
}
```

---

## 5. Service Layer Design

### 5.1 Profile History Service

**File:** `src/services/loopAnalysis/profileHistoryService.ts`

```typescript
/**
 * Fetches and normalizes profile change events from Nightscout.
 * Supports both DIY Loop (iOS) and AndroidAPS event types.
 */

import {fetchTreatmentsForDateRangeUncached} from 'app/api/apiRequests';
import {
  ProfileChangeEvent,
  ProfileHistoryFilter,
  LoopSystemSource,
} from 'app/types/loopAnalysis.types';
import {
  isProfileSwitchTreatment,
  parseProfileChangeFromTreatment,
} from './profileParsing.utils';

const DEFAULT_LOOKBACK_DAYS = 180;
const MAX_EVENTS = 100;

export async function fetchProfileChangeHistory(
  filter?: ProfileHistoryFilter
): Promise<ProfileChangeEvent[]> {
  const endMs = filter?.endMs ?? Date.now();
  const startMs = filter?.startMs ?? endMs - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const limit = filter?.limit ?? MAX_EVENTS;

  const treatments = await fetchTreatmentsForDateRangeUncached(
    new Date(startMs),
    new Date(endMs)
  );

  const events: ProfileChangeEvent[] = [];

  for (const t of treatments) {
    if (!isProfileSwitchTreatment(t)) continue;
    
    const event = parseProfileChangeFromTreatment(t);
    if (!event) continue;
    
    // Apply source filter if specified
    if (filter?.source && event.source !== filter.source) continue;
    
    events.push(event);
  }

  // Sort by timestamp descending (most recent first)
  events.sort((a, b) => b.timestamp - a.timestamp);

  return events.slice(0, limit);
}
```

### 5.2 Impact Analysis Service

**File:** `src/services/loopAnalysis/impactAnalysisService.ts`

```typescript
/**
 * Core analysis service that computes before/after comparison.
 * This is the "headless" engine consumed by hooks and LLM tools.
 */

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {
  ImpactAnalysisParams,
  ImpactAnalysisResult,
  PeriodStats,
  HourlyAggregate,
  ImpactDeltas,
} from 'app/types/loopAnalysis.types';
import {BgSample} from 'app/types/day_bgs.types';
import {
  calculatePeriodStats,
  computeHourlyAggregates,
  computeDeltas,
  assessDataQuality,
} from './impactAnalysis.utils';
import {cgmRange} from 'app/constants/PLAN_CONFIG';

const DEFAULT_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function analyzeSettingsImpact(
  params: ImpactAnalysisParams
): Promise<ImpactAnalysisResult> {
  const {changeEvent} = params;
  const windowDays = Math.min(30, Math.max(1, params.windowDays ?? DEFAULT_WINDOW_DAYS));
  const windowMs = windowDays * MS_PER_DAY;

  const thresholds = params.tirThresholds ?? {
    veryLowMax: cgmRange.VERY_LOW ?? 54,
    targetMin: cgmRange.TARGET?.min ?? 70,
    targetMax: cgmRange.TARGET?.max ?? 180,
    highMax: cgmRange.VERY_HIGH ?? 250,
  };

  // Calculate date ranges
  const preStartMs = changeEvent.timestamp - windowMs;
  const preEndMs = changeEvent.timestamp;
  const postStartMs = changeEvent.timestamp;
  const postEndMs = changeEvent.timestamp + windowMs;

  // Fetch BG data for both periods in parallel
  const [preBgData, postBgData] = await Promise.all([
    fetchBgDataForDateRangeUncached(new Date(preStartMs), new Date(preEndMs)),
    fetchBgDataForDateRangeUncached(new Date(postStartMs), new Date(postEndMs)),
  ]);

  // Calculate statistics
  const preChange = calculatePeriodStats(preBgData, preStartMs, preEndMs, thresholds);
  const postChange = calculatePeriodStats(postBgData, postStartMs, postEndMs, thresholds);

  // Calculate hourly aggregates for ghost chart
  const preHourlyAggregates = computeHourlyAggregates(preBgData);
  const postHourlyAggregates = computeHourlyAggregates(postBgData);

  // Compute deltas
  const deltas = computeDeltas(preChange, postChange);

  // Assess data quality
  const dataQuality = assessDataQuality(preBgData, postBgData, windowDays);

  return {
    changeEvent,
    windowDays,
    preChange,
    postChange,
    deltas,
    preHourlyAggregates,
    postHourlyAggregates,
    dataQuality,
    computedAt: Date.now(),
  };
}
```

---

## 6. Hook Layer Design

### 6.1 useProfileHistory Hook

**File:** `src/hooks/loop/useProfileHistory.ts`

```typescript
/**
 * Hook to fetch and manage profile change history.
 * Provides loading state, error handling, and refresh capability.
 */

import {useCallback, useEffect, useState} from 'react';
import {ProfileChangeEvent, ProfileHistoryFilter} from 'app/types/loopAnalysis.types';
import {fetchProfileChangeHistory} from 'app/services/loopAnalysis/profileHistoryService';

export type ProfileHistoryState = 
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; events: ProfileChangeEvent[]}
  | {status: 'error'; error: string};

export function useProfileHistory(filter?: ProfileHistoryFilter) {
  const [state, setState] = useState<ProfileHistoryState>({status: 'idle'});

  const fetch = useCallback(async () => {
    setState({status: 'loading'});
    try {
      const events = await fetchProfileChangeHistory(filter);
      setState({status: 'success', events});
    } catch (err: any) {
      setState({status: 'error', error: err?.message ?? 'Failed to load profile history'});
    }
  }, [filter?.startMs, filter?.endMs, filter?.source, filter?.limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    ...state,
    events: state.status === 'success' ? state.events : [],
    isLoading: state.status === 'loading',
    error: state.status === 'error' ? state.error : null,
    refresh: fetch,
  };
}
```

### 6.2 useSettingsImpact Hook

**File:** `src/hooks/loop/useSettingsImpact.ts`

```typescript
/**
 * Hook to analyze the impact of a specific settings change.
 * Exposes the same logic used by the LLM tool.
 */

import {useCallback, useState} from 'react';
import {
  ImpactAnalysisParams,
  ImpactAnalysisResult,
  ProfileChangeEvent,
} from 'app/types/loopAnalysis.types';
import {analyzeSettingsImpact} from 'app/services/loopAnalysis/impactAnalysisService';

export type ImpactAnalysisState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; result: ImpactAnalysisResult}
  | {status: 'error'; error: string};

export function useSettingsImpact() {
  const [state, setState] = useState<ImpactAnalysisState>({status: 'idle'});

  const analyze = useCallback(async (
    event: ProfileChangeEvent,
    windowDays?: number
  ) => {
    setState({status: 'loading'});
    try {
      const result = await analyzeSettingsImpact({
        changeEvent: event,
        windowDays,
      });
      setState({status: 'success', result});
      return result;
    } catch (err: any) {
      const error = err?.message ?? 'Analysis failed';
      setState({status: 'error', error});
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState({status: 'idle'});
  }, []);

  return {
    ...state,
    result: state.status === 'success' ? state.result : null,
    isLoading: state.status === 'loading',
    error: state.status === 'error' ? state.error : null,
    analyze,
    reset,
  };
}
```

---

## 7. UI Components

### 7.1 Component Hierarchy

```
LoopTunerTab (Container)
├── SettingsAuditScreen
│   ├── SettingsAuditHeader
│   ├── WindowSelectorPills (3d, 7d, 14d, 30d)
│   └── ProfileChangeList
│       └── ProfileChangeCard (x N)
│           ├── ChangeDate
│           ├── ChangeSourceBadge
│           └── QuickImpactPreview (TIR delta)
│
└── ImpactDetailScreen (on card press)
    ├── ImpactHeader
    │   ├── ChangeEventSummary
    │   └── WindowIndicator
    ├── ImpactSummaryCard
    │   ├── MetricRow (TIR)
    │   ├── MetricRow (Avg BG)
    │   ├── MetricRow (CV / Variability)
    │   └── MetricRow (Hypo Count)
    ├── GhostChartSection
    │   ├── GhostChartLegend
    │   └── GhostChart (24h overlay)
    └── DataQualityDisclaimer
```

### 7.2 Key Component Specifications

#### ProfileChangeCard

| Prop | Type | Description |
|------|------|-------------|
| `event` | `ProfileChangeEvent` | The change event to display |
| `onPress` | `() => void` | Navigate to detail screen |
| `quickImpact` | `{tirDelta: number} \| null` | Pre-fetched TIR delta for preview |

#### ImpactSummaryCard

| Prop | Type | Description |
|------|------|-------------|
| `preChange` | `PeriodStats` | Before stats |
| `postChange` | `PeriodStats` | After stats |
| `deltas` | `ImpactDeltas` | Pre-computed deltas |

**Visual Design:**
- Green upward arrow for improvements (TIR up, BG down)
- Red downward arrow for worsening
- Gray horizontal line for neutral
- Bold text for statistically significant changes

#### GhostChart

| Prop | Type | Description |
|------|------|-------------|
| `preHourly` | `HourlyAggregate[]` | Old pattern (dashed/ghost) |
| `postHourly` | `HourlyAggregate[]` | New pattern (solid) |
| `showConfidenceBands` | `boolean` | Show P25-P75 bands |

**Rendering:**
- Use existing VictoryChart or custom SVG path generator
- Pre-change: dashed line, 50% opacity, gray/red tint
- Post-change: solid line, full opacity, blue/green tint
- X-axis: 0-24 hours
- Y-axis: glucose mg/dL (auto-scaled with padding)

---

## 8. LLM Integration Strategy

### 8.1 Tool Registration

Add to `src/services/aiAnalyst/aiAnalystLocalTools.ts`:

```typescript
export type AiAnalystToolName =
  | 'getCgmSamples'
  | 'getCgmData'
  | 'getTreatments'
  | 'getInsulinSummary'
  | 'getHypoDetectiveContext'
  | 'getGlycemicEvents'
  | 'getPumpProfile'
  | 'analyzeSettingsImpact'      // NEW
  | 'getProfileChangeHistory';   // NEW
```

### 8.2 Tool Implementations

```typescript
case 'getProfileChangeHistory': {
  const rangeDays = clampInt(args?.rangeDays, 7, 180, 90);
  const endMs = Date.now();
  const startMs = endMs - rangeDays * 24 * 60 * 60 * 1000;
  
  const events = await fetchProfileChangeHistory({startMs, endMs, limit: 20});
  
  return {
    ok: true,
    result: {
      count: events.length,
      events: events.map(e => ({
        date: new Date(e.timestamp).toISOString(),
        source: e.source,
        summary: e.summary,
        profileName: e.profileName,
      })),
    },
  };
}

case 'analyzeSettingsImpact': {
  const changeDate = args?.changeDate;
  const windowDays = clampInt(args?.windowDays, 1, 30, 7);
  
  if (!changeDate) {
    return {ok: false, error: 'changeDate is required'};
  }
  
  const timestamp = Date.parse(changeDate);
  if (!Number.isFinite(timestamp)) {
    return {ok: false, error: 'Invalid changeDate format'};
  }
  
  // Find nearest profile change event
  const events = await fetchProfileChangeHistory({
    startMs: timestamp - 24 * 60 * 60 * 1000,
    endMs: timestamp + 24 * 60 * 60 * 1000,
    limit: 1,
  });
  
  if (!events.length) {
    return {ok: false, error: 'No profile change found near that date'};
  }
  
  const result = await analyzeSettingsImpact({
    changeEvent: events[0],
    windowDays,
  });
  
  // Transform to LLM-friendly output
  return {
    ok: true,
    result: {
      changeDate: new Date(result.changeEvent.timestamp).toISOString(),
      windowDays: result.windowDays,
      preChange: {
        avgBg: Math.round(result.preChange.averageBg),
        tirPercent: Math.round(result.preChange.timeInRange.target),
        hypoCount: result.preChange.hypoEventCount,
        cv: Math.round(result.preChange.cv),
      },
      postChange: {
        avgBg: Math.round(result.postChange.averageBg),
        tirPercent: Math.round(result.postChange.timeInRange.target),
        hypoCount: result.postChange.hypoEventCount,
        cv: Math.round(result.postChange.cv),
      },
      deltas: {
        tirDelta: Math.round(result.deltas.tirDelta * 10) / 10,
        avgBgDelta: Math.round(result.deltas.avgBgDelta),
        isSignificant: result.deltas.isSignificant,
        overallTrend: result.deltas.overallTrend,
      },
      summary: generateNaturalLanguageSummary(result),
      warning: result.dataQuality.hasEnoughData ? undefined : 
        'Limited data available for accurate comparison.',
    },
  };
}
```

### 8.3 Tool Definition for LLM

```json
{
  "name": "analyzeSettingsImpact",
  "description": "Analyzes how a specific Loop/pump settings change affected glucose control. Compares Time in Range, average glucose, variability, and hypo frequency before vs after the change.",
  "parameters": {
    "type": "object",
    "properties": {
      "changeDate": {
        "type": "string",
        "description": "ISO date string of the settings change to analyze (e.g., '2026-01-15T10:00:00Z')"
      },
      "windowDays": {
        "type": "integer",
        "description": "Number of days before/after to compare (1-30, default 7)"
      }
    },
    "required": ["changeDate"]
  }
}
```

---

## 9. Data Flow & State Management

### 9.1 Sequence Diagram: User Views Impact

```
User            SettingsAuditScreen    useProfileHistory    profileHistoryService    Nightscout
  │                     │                      │                      │                   │
  │──── Opens Tab ─────>│                      │                      │                   │
  │                     │───── fetch() ───────>│                      │                   │
  │                     │                      │─── fetchHistory() ──>│                   │
  │                     │                      │                      │── GET treatments ─>│
  │                     │                      │                      │<─── treatments ────│
  │                     │                      │<── ProfileEvents[] ──│                   │
  │                     │<─── {events} ────────│                      │                   │
  │<── Render List ─────│                      │                      │                   │
  │                     │                      │                      │                   │
  │── Tap Event Card ──>│                      │                      │                   │
  │                     │                      │                      │                   │
```

### 9.2 Sequence Diagram: Impact Analysis

```
User        ImpactDetailScreen    useSettingsImpact    impactAnalysisService    Nightscout
  │                 │                     │                      │                   │
  │── Nav to Detail ─>│                   │                      │                   │
  │                 │─── analyze(event) ──>│                     │                   │
  │                 │                     │─ analyzeImpact() ───>│                   │
  │                 │                     │                      │─ GET BG (pre) ───>│
  │                 │                     │                      │<─── bgData[] ─────│
  │                 │                     │                      │─ GET BG (post) ──>│
  │                 │                     │                      │<─── bgData[] ─────│
  │                 │                     │                      │                   │
  │                 │                     │                      │ calculateStats()  │
  │                 │                     │                      │ computeHourly()   │
  │                 │                     │                      │ computeDeltas()   │
  │                 │                     │                      │                   │
  │                 │                     │<── AnalysisResult ───│                   │
  │                 │<── {result} ────────│                      │                   │
  │<── Render UI ───│                     │                      │                   │
```

---

## 10. Error Handling & Edge Cases

### 10.1 Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| **Network** | Nightscout unreachable | Show retry button, cache previous results |
| **Data Quality** | < 50% CGM coverage | Show warning banner, still compute stats |
| **No Events** | No profile switches found | Show empty state with explanation |
| **Invalid Range** | Post-change period is in future | Limit post-window to now, show partial results |
| **Conflicting Changes** | Multiple changes within window | Warn user, suggest shorter window |

### 10.2 Data Quality Rules

```typescript
function assessDataQuality(
  preBg: BgSample[],
  postBg: BgSample[],
  windowDays: number
): DataQualityAssessment {
  const expectedReadings = windowDays * 288; // 5-minute CGM
  const warnings: string[] = [];

  const preCoverage = preBg.length / expectedReadings;
  const postCoverage = postBg.length / expectedReadings;

  if (preCoverage < 0.5) {
    warnings.push('Limited data before the change may affect accuracy.');
  }
  if (postCoverage < 0.5) {
    warnings.push('Limited data after the change may affect accuracy.');
  }

  // Check for gaps > 2 hours
  const preGaps = findLargeGaps(preBg, 2 * 60 * 60 * 1000);
  const postGaps = findLargeGaps(postBg, 2 * 60 * 60 * 1000);
  
  if (preGaps > 0 || postGaps > 0) {
    warnings.push('Significant data gaps detected in one or both periods.');
  }

  return {
    prePeriodCoverage: preCoverage,
    postPeriodCoverage: postCoverage,
    hasEnoughData: preCoverage >= 0.7 && postCoverage >= 0.7,
    warnings,
  };
}
```

---

## 11. Performance Considerations

### 11.1 Optimizations

| Area | Strategy |
|------|----------|
| **Parallel Fetching** | Fetch pre/post BG data simultaneously via `Promise.all` |
| **Lazy Loading** | Only compute full analysis when user taps a card |
| **Quick Preview** | Pre-compute TIR delta for list preview (lighter query) |
| **Caching** | Cache analysis results by (eventId, windowDays) in memory |
| **Debounce** | Debounce window size changes to avoid re-computing rapidly |

### 11.2 Memory Considerations

- Typical 30-day window: ~8,640 BG samples × 2 = ~17,280 samples
- Each sample ~50 bytes → ~860 KB for raw data
- Aggregates reduce this to 48 hourly points (negligible)
- **Recommendation:** Compute hourly aggregates server-side for very long ranges in future

---

## 12. Testing Strategy

### 12.1 Unit Tests

**File:** `__tests__/loopAnalysis/impactAnalysis.utils.test.ts`

```typescript
describe('calculatePeriodStats', () => {
  it('computes correct TIR percentages', () => {
    const samples = generateMockBgSamples({count: 100, avgBg: 120, stdDev: 20});
    const stats = calculatePeriodStats(samples, startMs, endMs, thresholds);
    
    expect(stats.timeInRange.target).toBeGreaterThan(0);
    expect(stats.timeInRange.target + stats.timeInRange.low + 
           stats.timeInRange.high + stats.timeInRange.veryLow + 
           stats.timeInRange.veryHigh).toBeCloseTo(100, 1);
  });

  it('handles empty samples gracefully', () => {
    const stats = calculatePeriodStats([], startMs, endMs, thresholds);
    expect(stats.sampleCount).toBe(0);
    expect(stats.averageBg).toBe(0);
  });
});

describe('computeDeltas', () => {
  it('marks improvement when TIR increases significantly', () => {
    const preChange = {timeInRange: {target: 60}};
    const postChange = {timeInRange: {target: 75}};
    
    const deltas = computeDeltas(preChange, postChange);
    expect(deltas.tirDelta).toBe(15);
    expect(deltas.isSignificant).toBe(true);
    expect(deltas.overallTrend).toBe('improved');
  });
});

describe('computeHourlyAggregates', () => {
  it('groups samples by hour of day', () => {
    const samples = generateSamplesAcross24Hours();
    const hourly = computeHourlyAggregates(samples);
    
    expect(hourly.length).toBe(24);
    expect(hourly[0].hour).toBe(0);
    expect(hourly[23].hour).toBe(23);
  });
});
```

### 12.2 Integration Tests

**File:** `__tests__/loopAnalysis/impactAnalysisService.test.ts`

```typescript
describe('analyzeSettingsImpact', () => {
  it('fetches correct date ranges for 7-day window', async () => {
    const fetchSpy = jest.spyOn(apiRequests, 'fetchBgDataForDateRangeUncached');
    
    await analyzeSettingsImpact({
      changeEvent: mockChangeEvent,
      windowDays: 7,
    });
    
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Verify date ranges...
  });
});
```

### 12.3 E2E Tests

**File:** `e2e/maestro/loop-tuner-smoke.yaml`

```yaml
appId: com.shani.dms22
---
- launchApp
- tapOn: "Loop Tuner"
- assertVisible: "Settings History"
- tapOn:
    id: "profile-change-card-0"
- assertVisible: "Impact Analysis"
- assertVisible: "Time in Range"
- assertVisible: "Before"
- assertVisible: "After"
```

---

## 13. Folder Structure

```
src/
├── types/
│   └── loopAnalysis.types.ts          # All type definitions
│
├── services/
│   └── loopAnalysis/
│       ├── index.ts                    # Public exports
│       ├── profileHistoryService.ts    # Fetch profile changes
│       ├── impactAnalysisService.ts    # Core analysis engine
│       ├── profileParsing.utils.ts     # Parse treatment events
│       └── impactAnalysis.utils.ts     # Pure calculation functions
│
├── hooks/
│   └── loop/
│       ├── index.ts
│       ├── useProfileHistory.ts
│       └── useSettingsImpact.ts
│
├── containers/
│   └── MainTabsNavigator/
│       └── Containers/
│           └── LoopTuner/
│               ├── index.ts
│               ├── LoopTunerTab.tsx            # Main tab container
│               ├── SettingsAuditScreen.tsx     # History list
│               ├── ImpactDetailScreen.tsx      # Detail view
│               ├── components/
│               │   ├── ProfileChangeCard.tsx
│               │   ├── ImpactSummaryCard.tsx
│               │   ├── GhostChart.tsx
│               │   ├── MetricRow.tsx
│               │   └── WindowSelectorPills.tsx
│               └── styles/
│                   └── loopTuner.styles.ts
│
└── __tests__/
    └── loopAnalysis/
        ├── impactAnalysis.utils.test.ts
        ├── profileParsing.utils.test.ts
        └── impactAnalysisService.test.ts
```

---

## 14. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create type definitions (`loopAnalysis.types.ts`)
- [ ] Implement profile parsing utils (`profileParsing.utils.ts`)
- [ ] Implement `fetchProfileChangeHistory` service
- [ ] Write unit tests for parsing logic
- [ ] Verify sample Nightscout data has profile switch events

### Phase 2: Analysis Engine (Week 2)
- [ ] Implement `impactAnalysis.utils.ts` (pure functions)
- [ ] Implement `impactAnalysisService.ts`
- [ ] Write unit tests for stats calculations
- [ ] Create hooks (`useProfileHistory`, `useSettingsImpact`)

### Phase 3: UI - List View (Week 3)
- [ ] Create `LoopTunerTab` container
- [ ] Create `SettingsAuditScreen` with `ProfileChangeCard`
- [ ] Add navigation route to main tabs
- [ ] Style according to existing theme

### Phase 4: UI - Detail View (Week 4)
- [ ] Create `ImpactDetailScreen`
- [ ] Implement `ImpactSummaryCard` with deltas
- [ ] Implement `GhostChart` overlay visualization
- [ ] Add window size selector

### Phase 5: LLM Integration (Week 5)
- [ ] Add `analyzeSettingsImpact` tool to `aiAnalystLocalTools.ts`
- [ ] Add `getProfileChangeHistory` tool
- [ ] Write natural language summary generator
- [ ] Test with AI Analyst chat

### Phase 6: Polish & Testing (Week 6)
- [ ] E2E tests with Maestro
- [ ] Performance profiling
- [ ] Error state handling and empty states
- [ ] Documentation updates

---

## 15. Open Questions & Future Enhancements

### Open Questions

1. **Profile Switch Detection**: What is the exact `eventType` string in your Nightscout for Loop iOS profile switches? Need to verify with sample data.

2. **Settings Diff**: Should we display what specifically changed (e.g., "ISF: 50→45")? This requires parsing Loop's profile payload structure.

3. **Multiple Changes**: How to handle rapid successive changes (e.g., 3 changes in 2 days)? Options:
   - Warn and suggest longer window
   - Auto-exclude overlapping windows
   - Show "composite" analysis

4. **Statistical Significance**: Current heuristic is simple (|TIR delta| >= 3%). Should we implement proper statistical tests (paired t-test, Wilcoxon)?

### Future Enhancements

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| Settings Diff Viewer | P2 | Show ISF/CR/Basal changes in a table |
| Trend Prediction | P3 | Project future TIR based on current trajectory |
| Export to PDF | P3 | Generate shareable report for clinician |
| Undo Recommendation | P3 | "Your TIR dropped 8%, consider reverting" |
| Cross-Device Sync | P4 | Share analysis history across devices |

---

## Appendix A: Sample Nightscout Profile Switch Event

```json
{
  "_id": "65f8a3b2c8e4a1001234abcd",
  "eventType": "Profile Switch",
  "created_at": "2026-01-15T10:30:00.000Z",
  "profile": "High Activity",
  "duration": 0,
  "enteredBy": "Loop",
  "notes": "Profile changed to High Activity",
  "mills": 1736937000000
}
```

---

## Appendix B: Statistical Formulas

### Coefficient of Variation (CV)

$$CV = \frac{\sigma}{\mu} \times 100$$

Where $\sigma$ is standard deviation and $\mu$ is mean.

### GMI (Glucose Management Indicator)

$$GMI = 3.31 + 0.02392 \times \bar{G}$$

Where $\bar{G}$ is mean glucose in mg/dL.

### Time in Range

$$TIR = \frac{\text{Readings in } [70, 180]}{\text{Total Valid Readings}} \times 100$$

---

*End of HLD Document*
