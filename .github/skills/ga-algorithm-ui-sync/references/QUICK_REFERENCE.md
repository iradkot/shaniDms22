# Quick Reference: Common Algorithm → UI Updates

Use this as a fast lookup when you need to sync the UI with a GA change.

## Add a New Configuration Parameter

### 1. Algorithm
```typescript
// src/algorithm/geneLibrary/SmartInjector.ts or similar
export interface SmartInjectorConfig {
  myNewParam: number; // new
}
```

### 2. Worker
```typescript
// src/simulation/runtime-worker/workerTypes.ts
export interface StartPayload {
  myNewParam?: number; // new
}

// src/workers/evolution/handlers/startHandler.ts
const integration = new GeneLibraryWorkerIntegration({
  injectorConfig: {
    myNewParam: payload.myNewParam ?? 0.5,
  },
});
```

### 3. Hook
```typescript
// src/hooks/useEvolution/index.ts
export interface UseEvolutionProps {
  myNewParam?: number; // new
}

// Inside hook, in the worker message:
const payload: StartPayload = {
  myNewParam: myNewParam ?? defaults,
};
```

### 4. ControlPanel
```typescript
// src/components/ControlPanel.tsx
// Add to appropriate tab (GENERAL, GENERATION, DNA, or LIBRARY):

<div className="control-group">
  <label>My New Param: {myNewParam}</label>
  <input
    type="range"
    min="0" max="1" step="0.05"
    value={myNewParam}
    onChange={(e) => setMyNewParam(Number(e.target.value))}
  />
</div>
```

### 5. SimulationStatusSidebar
```typescript
// src/components/SimulationStatusSidebar.tsx
// Pass prop to ControlPanel:
<ControlPanel
  myNewParam={myNewParam}
  setMyNewParam={setMyNewParam}
  {...otherProps}
/>

// In App.tsx, add state:
const [myNewParam, setMyNewParam] = useState(defaults);

// Pass to SimulationStatusSidebar:
<SimulationStatusSidebar
  myNewParam={myNewParam}
  setMyNewParam={setMyNewParam}
  {...otherProps}
/>
```

---

## Add a New Telemetry Field to LibrarySummary

### 1. Algorithm
```typescript
// src/algorithm/geneLibrary/types.ts
export interface LibrarySummary {
  // ... existing fields
  myNewMetric: number; // new
}
```

### 2. Worker
```typescript
// src/algorithm/geneLibrary/NodeLibrary.ts
getSummary(): LibrarySummary {
  return {
    // ... existing
    myNewMetric: this.calculateMyMetric(),
  };
}

// src/workers/evolution/telemetry/perfLogging.ts
if (summary) {
  parts.push(`myNewMetric=${summary.myNewMetric.toFixed(2)}`);
}
```

### 3. Hook
```typescript
// src/hooks/useEvolution/index.ts
// In worker message listener (genComplete):
const librarySummary = payload.librarySummary;
// Memoize or store in state

// Return from hook for consumers:
return {
  librarySummary, // add if not already present
  // ...
};
```

### 4. SimulationStatusSidebar
```typescript
// src/components/SimulationStatusSidebar.tsx
// In library status strip:
<div>
  <strong>My New Metric:</strong> {librarySummary?.myNewMetric.toFixed(2)}
</div>
```

### 5. Dashboard
```typescript
// src/components/Dashboard.tsx
// Or add to GenePoolHealthWidget:
<div>
  <span>My New Metric</span>
  <span>{librarySummary?.myNewMetric.toFixed(2)}</span>
</div>
```

### 6. Investigate
```typescript
// src/components/GAInvestigation/GAInvestigation.tsx
// Add a chart component:
<LineChart
  data={generationTimeline.map(g => ({
    generation: g.generation,
    value: g.librarySummary?.myNewMetric,
  }))}
/>
```

---

## Add a New Status or Badge (e.g., "QUARANTINED")

### 1. Algorithm
```typescript
// src/algorithm/geneLibrary/types.ts
export type NodeStatus = 
  | 'ELITE'
  | 'PROTECTED'
  | 'NORMAL'
  | 'BLACKLISTED'
  | 'QUARANTINED'; // new
```

### 2. Library Logic
```typescript
// Update NodeLibrary.updateStatus() to set/unset QUARANTINED
```

### 3. Components

**Library Tab:**
```typescript
// src/components/GeneLibrary/EntryDetailsPanel.tsx
const statusIcon = {
  ELITE: '🏆',
  PROTECTED: '🛡️',
  NORMAL: '⭐',
  BLACKLISTED: '💀',
  QUARANTINED: '⚠️', // new
};
```

**Top DNA:**
```typescript
// src/components/topGenes/panels/TreeStructurePanel.tsx
// In halo logic:
if (entry?.status === 'QUARANTINED') {
  return 'orange'; // new halo color
}
```

**Academy:**
```typescript
// Update module to explain QUARANTINED status
```

---

## Add a New Node Type (e.g., "SIGNAL")

### 1. Algorithm
```typescript
// src/algorithm/geneLibrary/types.ts
export type NodeType = 'GENE' | 'GATE' | 'SIGNAL'; // new
```

### 2. Harvester & Library
```typescript
// Update NodeHarvester to recognize SIGNAL nodes
// Update NodeLibrary queries to handle SIGNAL
```

### 3. UI Components

**Library Tab:**
```typescript
// Add filter: "Type: Genes / Gates / Signals / All"
// Update table to show SIGNAL entries
```

**Dashboard:**
```typescript
// Update health widget:
// signals: 42
// genCount: 850
// gateCount: 397
```

**Investigate:**
```typescript
// Add to breakdown: "Signal count over time"
```

---

## Update Top Genes Tab Behavior

### Current
Sidebar shows per-generation gene stats.

### To Make "Local vs Global" Toggle

```typescript
// src/components/TopGenesView.tsx
const [showGlobal, setShowGlobal] = useState(false);

if (showGlobal) {
  return <LibraryView />;
} else {
  return <PerGenView />; // current behavior
}

// Add button:
<button onClick={() => setShowGlobal(!showGlobal)}>
  {showGlobal ? 'Local (Per-Gen)' : 'Global (Library)'}
</button>
```

---

## Add Halo to Tree Nodes

### Files
- `src/components/topGenes/panels/TreeStructurePanel.tsx`
- `src/components/topGenes/ui/styles.ts` (CSS)

### Code
```typescript
// In TreeStructurePanel, for each leaf:
const entry = libraryStats?.getNodeStats(nodeKey);
const haloType = getHaloType(entry);

// Render with halo:
<div className={`tree-node tree-node--halo-${haloType}`}>
  {/* node content */}
</div>

// Helper:
function getHaloType(entry?: NodeLibraryEntry): 'gold' | 'blue' | 'none' {
  if (entry?.status === 'ELITE' && entry?.source === 'LIBRARY_INJECTION') {
    return 'gold';
  }
  if (entry?.status === 'PROTECTED') {
    return 'blue';
  }
  return 'none';
}
```

### CSS
```css
/* src/components/topGenes/ui/styles.ts or .css file */
.tree-node--halo-gold {
  box-shadow: 0 0 12px 3px rgba(255, 215, 0, 0.6);
  border: 1px solid rgba(255, 215, 0, 0.8);
}

.tree-node--halo-blue {
  box-shadow: 0 0 12px 3px rgba(100, 149, 237, 0.6);
  border: 1px solid rgba(100, 149, 237, 0.8);
}
```

---

## Wire Library Summary to Components

### In useEvolution Hook
```typescript
const [librarySummary, setLibrarySummary] = useState<LibrarySummary | null>(null);

// In worker message handler:
if (payload.genComplete?.librarySummary) {
  setLibrarySummary(payload.genComplete.librarySummary);
}

// Return:
return {
  librarySummary,
  // ...
};
```

### In Components
```typescript
// src/components/GeneLibrary/GeneLibraryExplorer.tsx
export const GeneLibraryExplorer: React.FC<Props> = ({ librarySummary, ... }) => {
  return (
    <>
      <h2>Gene Library</h2>
      <div>Size: {librarySummary?.totalNodes}</div>
      <div>Elite: {librarySummary?.eliteCount}</div>
      {/* ... */}
    </>
  );
};

// In App.tsx:
<GeneLibraryExplorer
  librarySummary={librarySummary}
  // ... other props
/>
```

---

## File Checklist

When making an algorithm change, check these files:

- [ ] `src/algorithm/geneLibrary/types.ts` — Type definitions
- [ ] `src/algorithm/geneLibrary/NodeLibrary.ts` — Library logic
- [ ] `src/algorithm/geneLibrary/SmartInjector.ts` — Injection logic
- [ ] `src/simulation/runtime-worker/workerTypes.ts` — Message payloads
- [ ] `src/workers/evolution/handlers/startHandler.ts` — Initialization
- [ ] `src/workers/evolution/telemetry/perfLogging.ts` — Telemetry logs
- [ ] `src/hooks/useEvolution/index.ts` — Hook state parsing
- [ ] `src/hooks/useEvolution/types.ts` — Hook prop types
- [ ] `src/components/ControlPanel.tsx` — Config UI
- [ ] `src/components/SimulationStatusSidebar.tsx` — Status display
- [ ] `src/components/Dashboard.tsx` — Dashboard widgets
- [ ] `src/components/GeneLibrary/GeneLibraryExplorer.tsx` — Library tab
- [ ] `src/components/Analysis/DNAAnalysisDashboard.tsx` — Analysis details
- [ ] `src/components/GAInvestigation/GAInvestigation.tsx` — Diagnostics
- [ ] `src/config/constants.ts` — Config defaults if changed
