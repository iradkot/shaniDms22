# GA Algorithm to UI Component Dependency Map

A quick lookup for which algorithm changes affect which UI components.

## By Algorithm Change Type

### Gene / Gate Definitions
**Files changed:** `src/algorithm/indicators/`, `src/algorithm/types.ts`, `src/algorithm/GeneRegistry.ts`

| Component | Impact | Update |
|-----------|--------|--------|
| Strategy Lab | New genes appear in selector | Auto-detect; add category badges |
| Analysis | Show gene details if used | Display global stats from library |
| Dashboard | Category breakdown changes | Recalculate for new category |
| Top DNA | Halo if elite/protected | Update highlighting logic |
| Library | New entry type discovered | Filter/sort by new type |

---

### Library System (Injection, Elite/Protected, Tenure)
**Files changed:** `src/algorithm/geneLibrary/*`, `src/algorithm/dna/mutation.ts`

| Component | Impact | Update |
|-----------|--------|--------|
| SimulationStatusSidebar | Library stats change | Add/update library status strip |
| Dashboard | Pool health changes | Add/update GenePoolHealthWidget |
| Library tab | Entries, stats, actions | Wire summary + enable actions |
| Top DNA | Node halos | Gold (elite injected) / Blue (protected) |
| Analysis | Node attribution | Show status, source, global stats |
| Investigate | Telemetry metrics | Add library size, elite, protected charts |
| Strategy Lab | Import from library | Seed genes from elite pool |
| Execute | Library lineage | Show source (Random vs Injected) |

---

### Mutation Strategy (Parametric, Structural, Smart Injection)
**Files changed:** `src/algorithm/dna/mutation.ts`, `src/algorithm/dna/treeMutation.ts`, SmartInjector.ts

| Component | Impact | Update |
|-----------|--------|--------|
| ControlPanel | New parameters | Add sliders/inputs (mutation rate, tree depth, etc.) |
| Investigate | Mutation fairness changes | Update charts/metrics |
| Academy | Mutation explanation | Update content |

---

### Telemetry / Logging
**Files changed:** `src/workers/evolution/telemetry/*`, `src/simulation/runtime-worker/workerTypes.ts`

| Component | Impact | Update |
|-----------|--------|--------|
| SimulationStatusSidebar | New stats available | Parse and display in status strip |
| Dashboard | New metrics | Add widgets for new stats |
| Investigate | New diagnostic data | Create charts for new telemetry |
| Export (logs) | Schema changes | Update export format if needed |

---

### Population Dynamics (Selection, Crossover, Reproduction)
**Files changed:** `src/algorithm/population/*`, `src/algorithm/Population.ts`

| Component | Impact | Update |
|-----------|--------|--------|
| Top DNA | Selection changes | May affect ranking logic |
| Investigate | Population metrics | Update charts |

---

### Worker Communication (Messages, State, Payloads)
**Files changed:** `src/simulation/runtime-worker/workerTypes.ts`, `src/workers/evolution/*`

| Component | Impact | Update |
|-----------|--------|--------|
| useEvolution hook | New fields in payloads | Parse new state, add to return |
| All consumers | Data availability changes | Update if/where data flows |

---

## By UI Component

### Shared / Always-Visible

#### SimulationStatusSidebar
- **Affected by:** Library stats, injection rate, config parameters
- **Signals to check:**
  - Is there new telemetry?
  - Is there a new config parameter?
  - Did library structure change?
- **Update:** Add metrics to status strip, wire config sliders

#### ControlPanel
- **Affected by:** New GA parameters, library injection ratio
- **Signals to check:**
  - New configurable values?
  - New parameter ranges?
- **Update:** Add form controls in appropriate tab (GENERAL, GENERATION, DNA, or new LIBRARY tab)

---

### Tab-Specific

#### Dashboard
- **Affected by:** Library health, injection efficiency, category breakdown
- **Update:** GenePoolHealthWidget, add/modify cards

#### Trade Log
- **Affected by:** Gene/gate source attribution (Random vs Injected)
- **Update:** Optional source filter, badge in rows

#### Top DNA
- **Affected by:** Gene/gate library status (elite, protected)
- **Update:** Halo markers, tooltips with global stats, GA concepts

#### Top Genes
- **Affected by:** Global library vs per-gen distinction
- **Update:** Toggle for Local/Global view, deprecation decision

#### Library
- **Affected by:** Library entries structure, summary format, actions
- **Update:** Wire data, enable actions, add filters/sorting

#### Analysis
- **Affected by:** Gene/gate status, source, global stats
- **Update:** Attribution section, jump to library

#### Investigate
- **Affected by:** Telemetry metrics, library diagnostics
- **Update:** Charts for library size, elite, protected, injection, eligibility

#### Academy
- **Affected by:** New concepts (Gene Library, injection, tenure)
- **Update:** New modules, diagrams, explanations

#### Strategy Lab
- **Affected by:** Gene availability, status indicators, import capability
- **Update:** Gene list badges, import from library

#### Execute
- **Affected by:** Library lineage, ability to lock genes
- **Update:** Lineage section, lock toggle

---

## Checklist for Algorithm Change

- [ ] **Identify change type** (Gene? Library? Mutation? Telemetry? Population? Worker?)
- [ ] **Update algorithm files** in `src/algorithm/`
- [ ] **Update worker** if payloads or messages change
- [ ] **Update `useEvolution` hook** to parse new state
- [ ] **Update ControlPanel** if new config parameters
- [ ] **Update SimulationStatusSidebar** if new live stats
- [ ] **Update affected tabs** per dependency map above
- [ ] **Update Academy** if introducing new concepts
- [ ] **Update tests** (E2E, unit)
- [ ] **Manual QA:** Verify all touched components render and function

---

## Data Flow: Worker → Hook → Components

```
Worker (src/workers/evolution/)
    ↓
    [genComplete message]
    ↓
useEvolution Hook (src/hooks/useEvolution/index.ts)
    ↓
    [setState(newState)]
    ↓
Components (src/components/)
    ├── SimulationStatusSidebar
    │   ├── ControlPanel
    │   └── DecisionDiagnosticsPanel
    ├── Dashboard
    ├── TradeLog
    ├── TopStrategiesView (Top DNA tab)
    ├── TopGenesView (Top Genes tab)
    ├── GeneLibraryExplorer (Library tab)
    ├── DNAAnalysisDashboard (Analysis tab)
    ├── GAInvestigation (Investigate tab)
    ├── Academy
    ├── StrategyLab
    └── DNAExecution (Execute tab)
```

**Key:** If you add state in `useEvolution`, it must be threaded to all components that need it.
