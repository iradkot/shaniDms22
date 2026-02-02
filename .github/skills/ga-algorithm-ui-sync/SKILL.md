---
name: ga-algorithm-ui-sync
description: 'Keep the UI synchronized with GA algorithm changes. Use when you modify genetic algorithm logic (genes, gates, libraries, injection, telemetry) and need to identify and update affected UI components across tabs (Dashboard, DNA, Genes, Library, Analysis, etc.) and shared surfaces (ControlPanel, SimulationStatusSidebar). Maps algorithm state to UI representations.'
---

# GA Algorithm UI Sync

When you change the genetic algorithm (GA) implementation—whether adding new gene types, introducing injection mechanisms, modifying telemetry, or refactoring selection logic—the UI must be updated to reflect these changes. This skill identifies which UI components need updates and provides specific, actionable guidance for each.

## When to Use This Skill

- You modify `src/algorithm/` core logic
- You change gene types, gate definitions, or node operations
- You implement new telemetry (e.g., injection stats, eligibility diagnostics)
- You adjust mutation strategies or population dynamics
- You add/modify worker messages or state structures
- You want to ensure UI consistency across all tabs after algorithm changes
- You're unsure which components are affected by a GA change

**Keywords:** algorithm, GA, genes, gates, injection, library, mutation, population, telemetry, UI sync, components, tabs

## How This Skill Works

This skill maps GA algorithm changes to UI surfaces in your application:

### 1. Identify the Change Type
Determine what part of the algorithm changed:
- **Gene/Gate definitions** (types, parameters, logic)
- **Library system** (injection, elite/protected status, tenure)
- **Mutation strategy** (structural, parametric, smart injection)
- **Telemetry** (new stats, logs, diagnostic data)
- **Population dynamics** (selection, crossover, reproduction)
- **Worker communication** (new messages, state payloads)

### 2. Map to Affected Components
Use the component matrix below to identify all affected surfaces.

### 3. Apply Recommendations
For each affected component, apply the specific update recommendations provided.

## UI Component Architecture

### Shared / Always-Visible Components
These appear in **all tabs** and should be updated first:

#### `src/components/SimulationStatusSidebar.tsx`
- **Purpose:** Main configuration panel + live status display
- **Affected by:** mutation rates, injection config, real-time stats
- **Update trigger:** telemetry changes, config additions, status updates
- **Key props:** population size, mutation rate, injection rate, library stats

#### `src/components/ControlPanel.tsx`
- **Purpose:** GA parameter tuning (in sidebar tabs: GENERAL, GENERATION, DNA)
- **Affected by:** new GA parameters, library configuration
- **Tabs:**
  - `GENERAL`: symbol, run/stop, data sync, exports
  - `GENERATION`: population, mutation, time step, tournament
  - `DNA`: action threshold, genes per DNA, tree configuration
  - *Implicit:* Gene Library section (injection rate slider)
- **Update trigger:** new configurable parameters, slider ranges, slider labels

#### `src/components/LoadingOverlay.tsx`
- **Purpose:** Show blocking loading states
- **Affected by:** new long-running initialization phases (e.g., library warmup)
- **Update trigger:** new status strings like "Library warmup", "Calculating eligibility"

### Tab-Specific Components

#### 1) Dashboard
**File:** `src/components/Dashboard.tsx`

**Current:** Market chart, generation summary, oracle history.

**Affected by:**
- Library health stats (elite count, protected count, total nodes)
- Injection rate and efficiency metrics
- Gene/Gate category breakdown

**Update recommendations:**
- Add `GenePoolHealthWidget` component for library overview
- Show elite/protected/node counts
- Display recycling rates (library vs random actual %)
- Add category breakdown (Trend, Oscillator, Volatility, etc.)

---

#### 2) Trade Log
**File:** `src/components/TradeLog.tsx`

**Current:** Filterable trade list with profit, action, execution details.

**Affected by:**
- Gene/gate source attribution (Random vs Library Injection)
- Trade triggering node details

**Update recommendations:**
- Add optional **source filter** (All / Random / Library Injected)
- Display source badge in trade rows (if available in telemetry)
- Link to Library tab for injected genes

---

#### 3) Top DNA
**File:** `src/components/TopStrategiesView.tsx` and `src/components/topGenes/panels/TreeStructurePanel.tsx`

**Current:** Top strategies list + tree visualization + GA concepts.

**Affected by:**
- Gene/gate library status (elite, protected, blacklisted)
- Gene source (random vs library injection)
- Global node performance stats

**Update recommendations:**
- Add **halo markers** on tree nodes:
  - 🏆 Gold halo for Elite Injected genes/gates
  - 🛡️ Blue halo for Protected (untested) nodes
- Add **hover tooltips** showing:
  - Global profit, activations, quality score
  - Confidence level, status
  - First/last seen generation
- Update "Genetic Concepts" panel to explain:
  - Smart Injection vs random mutation
  - Elite vs Protected node lifecycle
  - Tenure protection mechanism
- Wire tree visualization to library data

---

#### 4) Top Genes
**File:** `src/components/TopGenesView.tsx`

**Current:** Per-generation gene frequency, weight, presence timelines.

**Affected by:**
- Global library stats (vs per-generation local stats)
- Gene status indicators

**Update recommendations:**
- **Reframe** as "Population Genes (Per-Generation)" to distinguish from global Library
- Add **toggle:** "Local (Current Gen) ↔ Global (Library)"
  - Local view: per-generation stats (current behavior)
  - Global view: links to Library tab
- Add status badges (Elite, Protected, Blacklisted)
- Consider **deprecation** if Library tab becomes the primary gene insight surface
- If kept, position as a "generation snapshot" complement to Library

---

#### 5) Library
**File:** `src/components/GeneLibrary/GeneLibraryExplorer.tsx` + supporting components

**Current:** Exists but not wired (librarySummary is `null`).

**Affected by:**
- NodeLibraryEntry structure and stats
- LibrarySummary payload format
- InjectionStats, EligibilityStats from worker
- User actions (lock, unlock, blacklist)

**Update recommendations:**
- **Wire library summary + entries** from worker state:
  - Pass `librarySummary` from `genComplete` event
  - Implement paged API for `currentEntries`
  - Cache entries in `useEvolution` hook
- **Enable LIBRARY_ACTION handling:**
  - Wire lock/unlock/blacklist buttons to worker messages
  - Show success/error feedback
- **Add filters:**
  - Gene vs Gate (NodeType)
  - Confidence (LOW / MEDIUM / HIGH)
  - Status (Elite, Protected, Normal, Blacklisted)
  - Category (Trend, Oscillator, Volatility, Volume, Time, Realm)
- **Add sorting:**
  - By total profit, quality score, activations
  - By first/last seen generation
- **Display injection stats panel:**
  - Total injections vs random mutations this generation
  - Injection miss counts (no eligible candidates)
  - Actual injection rate % vs configured rate
- **Add export:**
  - JSON dump of current library
  - CSV with selected columns

---

#### 6) Analysis
**File:** `src/components/DNAAnalysis/DNAAnalysisDashboard.tsx`

**Current:** Detailed fitness breakdown, decision points, trade simulation for selected DNA.

**Affected by:**
- Gene/gate library attribution (source, status)
- Node performance in context of global library

**Update recommendations:**
- Add **"Gene Library Attribution"** section for each gene/gate:
  - Status (Elite ⭐ / Protected 🛡️ / Normal / Blacklisted 💀)
  - Global profit and activations
  - Quality score and confidence
  - Source (Random vs Library Injection)
- Add **"Jump to Library"** button for each node
  - Clicking links to Library tab with node pre-selected
- Show how library stats compare to this DNA's performance
- Highlight if genes contributed to above/below average profit

---

#### 7) Investigate
**File:** `src/components/GAInvestigation/GAInvestigation.tsx`

**Current:** GA diagnostic tooling (mutation fairness, population state, telemetry).

**Affected by:**
- LibrarySummary telemetry (library size, elite count, protected count)
- InjectionStats (injections vs random per generation)
- EligibilityStats (eligible, highConf, elitePool, quality thresholds)

**Update recommendations:**
- Add **Gene Library Telemetry** charts:
  - Line chart: library size (genes + gates) over generations
  - Line chart: elite count + protected count over generations
  - Area chart: injection rate (%) over generations
  - Area chart: injection misses over generations
  - Stacked bar: injection attempts vs misses per generation
- Add **Eligibility Diagnostics** charts:
  - Bar: eligible (10+ acts) vs highConf (30+ acts) vs elitePool (50+ acts) vs highQ
  - Line: average quality score vs elite quality threshold over time
  - Scatter: activations vs quality score per node
- Explain what each metric means:
  - "Library warmup": low eligible count early is normal
  - "High miss rate": library is too restrictive
  - "Elite threshold too high": adjust eliteQualityThreshold config

---

#### 8) Academy
**File:** `src/components/Academy/Academy.tsx`

**Current:** Educational content on GA concepts (selection, crossover, etc.).

**Affected by:**
- Gene Library introduction (new feature with concepts)
- Smart injection mechanism
- Elite/protected lifecycle

**Update recommendations:**
- Add **Gene Library module** with sections:
  - **What is a Gene Library?** Persistent cross-generational tracking
  - **Elite vs Protected:** High performers vs untested candidates
  - **Smart Injection:** Preferential use of proven genes
  - **Tenure Protection:** How untested genes avoid premature deletion
  - **Injection Rate:** User control slider and its effect
  - **Quality Score:** How nodes are ranked (profit × confidence)
- Add **diagrams:**
  - Node lifecycle (created → protected → normal → elite)
  - Injection decision flow (inject from library vs create random)
  - Example: same gene appearing in multiple DNAs

---

#### 9) Strategy Lab
**File:** `src/components/StrategyLab.tsx`

**Current:** Manual gene selection UI.

**Affected by:**
- Gene/gate availability from library
- Status indicators for each gene

**Update recommendations:**
- Add **"Import from Library"** button/dropdown:
  - Allow users to seed strategies from elite genes/gates
  - Show top N genes ranked by quality score
- Add **status badges** in gene list:
  - 🏆 Elite, 🛡️ Protected, 💀 Blacklisted
- Filter view by category (Trend, Oscillator, etc.)
- Show global profit/activations for each gene inline

---

#### 10) Execute
**File:** `src/components/DNAExecution/DNAExecution.tsx`

**Current:** Run a single DNA and view detailed analytics.

**Affected by:**
- Library lineage of DNA (which genes were injected)
- Ability to lock/promote genes to library

**Update recommendations:**
- Add **"Library Lineage"** section showing:
  - Which genes/gates in this DNA came from library vs random
  - Source tag for each node
  - Status of each injected gene
- Add **"Lock to Library"** toggle for successful runs:
  - Allow users to force-include winning genes in library
  - Archive this execution's DNA to hall of fame (optional)
- Show how nodes' individual performance compared to global stats

---

## Telemetry / Log Mapping

The worker logs gene library stats at each generation:

```
[GeneLib][Gen X] library=1247 nodes genes=850 gates=397 elite=42 protected=156 eligible=203 highConf=89 elitePool=31 highQ=45 act10+=203 act30+=89 avgQ=0.156 eliteQ=0.250 injected=47(63%) random=28 geneInj=42 gateInj=5 misses=3
```

**Map these fields to UI:**
- `library=`, `genes=`, `gates=`: Summary cards (Dashboard, Sidebar)
- `elite=`, `protected=`: Status breakdown
- `eligible=`, `highConf=`, `elitePool=`, `highQ=`: Eligibility diagnostics (Investigate)
- `avgQ=`, `eliteQ=`: Quality threshold charts
- `injected=`, `random=`, `*Inj=`: Injection stats panel (Library tab)
- `misses=`: Miss rate indicator

## Step-by-Step: Updating for a New Algorithm Feature

### Example: Adding a New Telemetry Metric (e.g., "diversityIndex")

1. **Implement in algorithm:**
   - Add `diversityIndex` to `LibrarySummary` type
   - Log it in worker: `diversity=0.73`
   - Send in `genComplete` payload

2. **Update Sidebar:**
   - Add to library status strip in `SimulationStatusSidebar.tsx`
   - Display as a metric with tooltip

3. **Update Dashboard:**
   - Add to `GenePoolHealthWidget`
   - Show as a gauge or mini chart

4. **Update Investigate:**
   - Add line chart for diversity over generations
   - Explain what "good diversity" looks like

5. **Update Academy:**
   - Add explanation of diversity metric

6. **Wire state:**
   - Ensure `useEvolution` hook parses and memoizes the metric
   - Pass to all affected components

### Example: Adding a New Configuration Parameter (e.g., "draftPickRatio")

1. **Add to ControlPanel:**
   - Add slider to DNA tab or new LIBRARY tab
   - Range: 0% (always elite) to 100% (always untested)
   - Update label: "Draft Pick Ratio" with helpful description

2. **Update SimulationStatusSidebar:**
   - Show current value in library status strip
   - Optional: show impact on injection behavior

3. **Update Academy:**
   - Explain draft pick strategy and when to adjust

4. **Wire to worker:**
   - Pass in `StartPayload` and `UpdateConfigPayload`
   - Set in `SmartInjector` config

### Example: Adding a New Gene Type

1. **Register gene:**
   - Implement in `src/algorithm/indicators/`
   - Register in gene registry

2. **Update Strategy Lab:**
   - Gene appears in manual selection UI
   - Auto-detect category (Trend, Oscillator, etc.)

3. **Update Analysis:**
   - Show new gene type if used in selected DNA
   - Display its global stats from library

4. **Update Dashboard:**
   - Adjust category breakdown to include new type
   - Show in library health widget category distribution

5. **Update Academy:**
   - Explain new gene type and use cases

## Prerequisites

- Access to `src/algorithm/` to understand the GA change
- Familiarity with `src/components/` structure
- Understanding of `useEvolution` hook and worker state
- Knowledge of telemetry fields logged by worker

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Component doesn't see new library data | Ensure `useEvolution` hook is updated to parse worker payload. Check `genComplete` listener. |
| UI shows stale library stats | Memoization issue. Verify `useMemo` dependencies include library summary. |
| Slider doesn't affect GA behavior | Check that `StartPayload` includes the new config and worker reads it. |
| Library widgets show no data | Ensure worker has initialized library. Check `GeneLibraryWorkerIntegration` is instantiated in `handleStart`. |
| Gene not appearing in Library tab | Node key generation may differ. Check `nodeToKey()` function and quantization rules match. |

## References

- [Gene Library HLD](../../docs/HLD-GeneLibrary-SmartInjection.md)
- [UI Recommendations](../../docs/gene-library-ui-recommendations.md)
- [App Tabs Config](src/config/constants.ts) - UI.TABS definitions
- [useEvolution Hook](src/hooks/useEvolution/index.ts) - State management
- [Worker Types](src/simulation/runtime-worker/workerTypes.ts) - Message payloads
- [ControlPanel](src/components/ControlPanel.tsx) - Configuration UI
- [SimulationStatusSidebar](src/components/SimulationStatusSidebar.tsx) - Shared sidebar

## Related Skills

- **GA Algorithm Development:** Implement core GA logic
- **Worker Communication:** Debug worker messages and state
- **Component Architecture:** Refactor UI component hierarchy
