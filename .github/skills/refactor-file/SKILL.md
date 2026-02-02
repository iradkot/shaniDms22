---
name: refactor-file
description: 'Comprehensive behavior-preserving refactoring of TypeScript files following SOLID principles, performance-first design, and feature-folder structure. Use when asked to refactor a file, clean up code, improve structure, extract helpers, organize imports, apply architectural best practices, or when user mentions a specific file or module needs refactoring (e.g., "example.ts needs a refactor", "please refactor it", "this file needs refactoring", "refactor the example module"). Automatically updates tests, types, and all usages.'
---

# Refactor File Skill

A comprehensive skill for refactoring TypeScript files in this stock-prediction-ui repository with strict behavior preservation, SOLID principles, performance-first design, and feature-folder organization.

## When to Use This Skill

- User asks to "refactor a file", "clean up this file", "improve code structure"
- File exceeds **150 lines** (big file threshold)
- Function exceeds **40 lines** (big function threshold)
- Nesting depth > 3 levels
- Code has duplicate logic, magic strings/numbers, or unclear naming
- User requests to "extract helpers", "split this up", or "reorganize"

## Prime Directive

**⚠️ STRICTLY BEHAVIOR-PRESERVING REFACTOR ONLY ⚠️**

- No changes to outputs, side-effects, timing/ordering (where it matters), error behavior, or defaults
- If something looks like a bug:
  - **Do NOT "fix" it silently**
  - **Prove it with a test first**
  - Only change behavior if you explicitly choose to (and document why)

---

## Core Principles

### 1) SOLID + Practical TypeScript

- **SRP (Single Responsibility)**: Each function/module should have one clear job. If it has multiple flows, split into helpers.
- **OCP (Open/Closed)**: Prefer extending via new helpers/strategies/handlers rather than rewriting large blocks.
- **LSP (Liskov Substitution)**: If types have subtypes/unions, refactor must keep substitutability (no hidden assumptions).
- **ISP (Interface Segregation)**: Keep interfaces small; don't force callers to provide fields they don't need.
- **DIP (Dependency Inversion)**: High-level logic depends on abstractions (types/interfaces), not concrete implementations.

### 2) Public API + Renames Policy

- **Renaming exported/public APIs is allowed and encouraged** when it improves clarity, even if it requires updating usages across the repo.
  - Example: if `abc()` is vague and there's also `abcRound()`, rename to something explicit (e.g., `roundToAbcRule()`), and update all call sites.
- **Never leave the repo half-migrated**. Any rename must update:
  - All imports/usages
  - Related types
  - Tests
  - Docs/comments where relevant

### 3) "Big Refactor" Mindset

- Prefer **one coherent, root-level refactor** over small micro changes.
- Follow the **Boy Scout Rule**: if you're already in the file, clean related issues in that file too.
- Still keep changes **structured and reviewable**:
  - Group by logical steps (helpers extraction, naming pass, folder split, tests update, etc.)

### 4) File and Function Size Rules (Hard Thresholds)

- **File is "big" if > 150 lines** → refactor toward a clearer structure and likely a dedicated folder
- **Function is "big" if > 40 lines** → split into helpers
- **Nesting depth max ~3** where possible → use early returns, extract helpers, or use strategy maps

### 5) Folder Structure Rules (Feature-Folder First)

Prefer **feature-folder** organization. If a file grows big, it usually deserves its own folder:

```
featureX/
├── FeatureX.ts           # Main entry point
├── helpers/              # or utils/
│   ├── someHelper.ts
│   └── anotherHelper.ts
├── constants.ts          # Feature-specific constants
├── types.ts              # Feature-specific types (if needed)
└── __tests__/            # Tests next to relevant sources
    └── FeatureX.test.ts
```

**Avoid tons of files in one folder.** If a folder starts getting crowded, create subfolders by category.

**Helpers extraction rule**:
- Extract private helpers into a **local `helpers/` or `utils/`** folder for that feature when it improves readability.
- If a helper becomes reused across multiple files/features, **promote it upward** to a more shared location.

### 6) Single Source of Truth Rules

- **No magic strings/numbers.** All repeated or meaningful literals go into constants.
- Prefer **`constants.ts` per domain/feature**.
- If a constant becomes shared and isn't domain-specific, **promote it up** (shared constants area).

### 7) Utility Extraction Rules

- Create shared utilities **only if used at least twice**.
- If used once:
  - Keep it local (private helper or feature-local util)
- If used twice+ across places:
  - Extract and share (and remove duplication)

### 8) Naming Rules (Enforced)

- **camelCase**: variables + functions
- **PascalCase**: types + interfaces + classes
- **UPPER_SNAKE_CASE**: constants
- No single-letter names (`i`, `n`, `x`) except very tight scopes where readability is still obvious (prefer real names anyway).
- Boolean naming:
  - Prefer `isLoading`, `hasAccess`, `shouldRetry`, `canExecute`
  - Avoid vague suffixes like `Flag`, `Val`, `Data` if it hides meaning
- Function naming should describe **what it does + where it does it** when relevant:
  - Prefer `fetchUserFromApi`, `loadUserFromCache`, `parseXFromY`
  - Avoid generic `handle`, `doThing`, `process` unless paired with a meaningful noun

### 9) "Readable Like Pseudo-Code" Structure

Large functions should read like high-level steps:
1. Validate/guard
2. Derive inputs
3. Compute/transform
4. Call side-effects
5. Return result

- Put details into helpers so the main flow is easy to scan.
- Prefer **early returns** to reduce nesting.

### 10) TypeScript Typing Rules

- **TypeScript only** (this is a TS-only repo).
- **Avoid `any`.** Prefer:
  - Precise types
  - `unknown` + narrowing
  - Generics where useful
- Don't weaken types as a "refactor shortcut."
- Keep types aligned with runtime behavior (no lying casts unless absolutely unavoidable, and then explain why).

### 11) Performance is a Top Priority

This is a **performance-critical genetic algorithm application**. Performance comes first.

- Prefer the **more performant approach** when choices are equivalent:
  - Lookup maps vs long switch/if chains when it reduces branching
  - Avoid unnecessary allocations / copies in hot paths
  - Avoid extra abstraction layers that add overhead in critical code
- Don't add logging or heavy debug work in runtime hot paths.
- Prefer efficient libraries/patterns already in the codebase:
  - **`@tanstack/react-query`** hooks for data fetching
  - **`date-fns`** for date handling (unless a clearly more performant approach is needed)
  - **Typed arrays (`Float64Array`, `Uint8Array`, etc.)** for hot-path numerical operations

### 12) Comments & Docs Rules

- Prefer **code clarity over comments**, but keep:
  - Short **"why" comments** where intent isn't obvious
- Use **simple language** in comments.
- Use **TSDoc** for exported/public utilities when it improves usage clarity.
- In complex areas, longer comments are OK (still simple and direct).

### 13) Error Handling Rules

- Preserve existing error semantics.
- Allowed patterns (choose what fits the current code style/context):
  - Throwing errors
  - Returning `Result`-style objects
- Don't convert between "throw" and "Result" unless the surrounding code already uses that pattern (or you refactor the whole flow consistently without behavior changes).

### 14) Logging Rules

- **Preserve existing logging behavior.**
- Avoid adding new logs by default (performance concern + consistency).
- If you suspect logs are needed, treat it as a separate decision (not automatic in refactor).

### 15) Imports and Exports Rules

- `index.ts` barrels are allowed **at folder boundaries** (not everywhere).
- Avoid creating exports that aren't used.
- **Delete unused files/unused code during refactor** (no "unfinished" leftovers).
- Import order (if not auto-sorted by ESLint):
  1. External libraries
  2. Internal absolute imports (e.g., `@shared`)
  3. Relative imports (parent → sibling → child)

---

## Repository-Specific Context

### Project Structure

```
src/
├── algorithm/           # GA core logic (performance-critical)
│   ├── indicators/      # Technical indicator genes
│   ├── dna/             # DNA tree logic, crossover, pruning
│   ├── population/      # Population management
│   └── geneLibrary/     # Gene library and injection
├── simulation/          # Market simulation engines
├── components/          # React UI components
├── hooks/               # React hooks (@tanstack/react-query)
├── utils/               # Shared utilities
├── types/               # Shared type definitions
└── workers/             # Web Workers for GA execution

e2e/                     # Playwright end-to-end tests
scripts/                 # Build/perf testing scripts
server/                  # Backend (separate Node.js server)
```

### Testing Infrastructure

**Unit Tests (Vitest):**
- Run with: `npm test` (runs all src tests)
- Test files: `**/__tests__/*.test.ts` (co-located with source)
- Configuration: [vite.config.ts](vite.config.ts#L25-L34)
- Performance tests: `npm run perf:fitness`, `npm run perf:ga`, `npm run perf:ga:heavy`
- Performance test config: [vitest.perf.config.ts](vitest.perf.config.ts)

**E2E Tests (Playwright):**
- Run with: `npm run e2e` (via [scripts/run-e2e.mjs](scripts/run-e2e.mjs))
- Smoke tests: `npm run e2e:smoke`
- Test files: `e2e/*.spec.ts`
- Configuration: [playwright.config.ts](playwright.config.ts)

**Test Requirements:**
- All tests must pass before refactor is "done"
- Add coverage if the refactored area lacks tests (at least minimal but meaningful)
- Use `describe`, `it`, `expect` from `vitest`
- Mock external dependencies where appropriate

### Linting & Type Checking

- **ESLint**: `npm run lint`
  - Configuration: [eslint.config.js](eslint.config.js)
  - Rules: `@typescript-eslint/no-explicit-any` is `warn` (used sparingly in charts/tests)
  - `no-empty` with `allowEmptyCatch: true` (common for optional operations)
- **TypeScript**: `tsc -b` (build-time type check)
  - Configuration: [tsconfig.json](tsconfig.json), [tsconfig.app.json](tsconfig.app.json), [tsconfig.node.json](tsconfig.node.json)

### Build & Dev Commands

- **Dev**: `npm run dev` (Vite dev server on port 45678)
- **Dev with server**: `npm run dev:all` (concurrent frontend + backend)
- **Build**: `npm run build` (TypeScript compile + Vite build)
- **Preview**: `npm run preview`

### Key Dependencies & Patterns

- **React 19** with hooks (`useState`, `useEffect`, custom hooks)
- **@tanstack/react-query** for data fetching (replaces manual fetch state management)
- **date-fns** for date manipulation
- **Recharts** for visualization
- **lucide-react** for icons
- **Web Workers** for GA computation (see `src/workers/`)

### Common Refactor Scenarios in This Repo

1. **Algorithm files** (`src/algorithm/`):
   - Performance-critical hot paths
   - Heavy use of typed arrays
   - Genes, DNA, population management
   - Refactor for clarity WITHOUT losing performance

2. **Simulation files** (`src/simulation/`):
   - Market engines, data processing
   - Heavy numerical computation
   - Prefer typed arrays for data

3. **Component files** (`src/components/`):
   - React components with hooks
   - Extract custom hooks for complex logic
   - Prefer `@tanstack/react-query` for data fetching
   - Co-locate types and helpers in component folders

4. **Utility files** (`src/utils/`):
   - Shared helpers across features
   - Only promote here if used 2+ times
   - Keep focused and testable

---

## Step-by-Step Refactoring Workflow

### Step 1: Analyze the File

1. **Read the full file** to understand:
   - Purpose and responsibilities
   - Dependencies (imports/exports)
   - Current structure
   - Tests (if any)
2. **Identify issues**:
   - File size (> 150 lines?)
   - Function size (> 40 lines?)
   - Nesting depth (> 3 levels?)
   - Magic strings/numbers
   - Unclear naming
   - Code duplication
   - Missing tests
3. **Check for usages** across the repo:
   - Use `list_code_usages` to find all references
   - Plan rename/restructure impact

### Step 2: Plan the Refactor

Create a **todo list** with `manage_todo_list` for complex refactors:

Example plan:
1. Extract constants (magic strings/numbers → `constants.ts`)
2. Extract helpers (big functions → helper functions or `helpers/` folder)
3. Rename unclear variables/functions (update all usages)
4. Simplify control flow (early returns, reduce nesting)
5. Update/add types (improve type safety)
6. Update tests (ensure behavior preserved)
7. Update imports/exports (if folder structure changed)
8. Run all tests + lint + typecheck

### Step 3: Execute the Refactor

**Use `multi_replace_string_in_file` for multiple edits** to maximize efficiency.

For each change:
- Ensure exact string matching (3-5 lines of context before/after)
- Preserve behavior exactly
- Update related code (types, tests, usages) atomically when possible

**Recommended order**:
1. **Extract constants first** (establishes single source of truth)
2. **Extract helpers second** (reduces complexity, improves reusability)
3. **Rename for clarity third** (improves readability)
4. **Simplify control flow fourth** (reduces nesting, improves readability)
5. **Update types/tests last** (ensures everything still works)

### Step 4: Update Tests

- **Run existing tests**: `npm test` (or specific test file)
- **Add missing coverage** if the refactored area lacks tests
- **Update test assertions** if structure changed (but behavior preserved)
- Test file patterns:
  ```typescript
  import { describe, it, expect, beforeEach } from 'vitest';
  
  describe('FeatureName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = ...;
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toBe(expected);
    });
  });
  ```

### Step 5: Verify Quality

Run the full quality checklist:

```powershell
# 1. Type check
npm run build  # or tsc -b

# 2. Lint
npm run lint

# 3. Unit tests
npm test

# 4. E2E tests (if relevant to changes)
npm run e2e:smoke  # or npm run e2e for full suite

# 5. Performance tests (if algorithm changes)
npm run perf:fitness  # or perf:ga
```

**All must pass** before the refactor is considered "done."

### Step 6: Document Changes (if significant)

- Update comments/TSDoc if public APIs changed
- Update related documentation in `docs/` (if algorithm/architecture changed)
- **Do NOT create a summary markdown file** unless explicitly requested

---

## Refactoring Patterns & Examples

### Pattern 1: Extract Constants

**Before:**
```typescript
if (price > 100 && volume > 1000000) {
  // ...
}
```

**After:**
```typescript
// constants.ts
export const MIN_PRICE_THRESHOLD = 100;
export const MIN_VOLUME_THRESHOLD = 1_000_000;

// main.ts
if (price > MIN_PRICE_THRESHOLD && volume > MIN_VOLUME_THRESHOLD) {
  // ...
}
```

### Pattern 2: Extract Helper Functions

**Before:**
```typescript
function processData(data: Data[]): Result {
  // 50 lines of validation
  // 30 lines of transformation
  // 20 lines of aggregation
  return result;
}
```

**After:**
```typescript
function processData(data: Data[]): Result {
  const validated = validateData(data);
  const transformed = transformData(validated);
  const result = aggregateData(transformed);
  return result;
}

function validateData(data: Data[]): Data[] {
  // 50 lines of validation
}

function transformData(data: Data[]): Transformed[] {
  // 30 lines of transformation
}

function aggregateData(data: Transformed[]): Result {
  // 20 lines of aggregation
}
```

### Pattern 3: Feature Folder for Big Files

**Before:**
```
src/
├── bigFeature.ts  (500 lines)
├── bigFeatureTypes.ts
└── bigFeatureUtils.ts
```

**After:**
```
src/
└── bigFeature/
    ├── BigFeature.ts        # Main entry (exports public API)
    ├── types.ts             # Feature-specific types
    ├── constants.ts         # Feature-specific constants
    ├── helpers/
    │   ├── validation.ts
    │   ├── transformation.ts
    │   └── aggregation.ts
    └── __tests__/
        ├── BigFeature.test.ts
        ├── validation.test.ts
        └── transformation.test.ts
```

### Pattern 4: Early Returns to Reduce Nesting

**Before:**
```typescript
function processItem(item: Item): Result {
  if (item.isValid) {
    if (item.hasData) {
      if (item.data.length > 0) {
        // Deep nesting
        return processValidItem(item);
      }
    }
  }
  return null;
}
```

**After:**
```typescript
function processItem(item: Item): Result {
  if (!item.isValid) return null;
  if (!item.hasData) return null;
  if (item.data.length === 0) return null;
  
  return processValidItem(item);
}
```

### Pattern 5: Strategy Map Over Switch/If Chains

**Before:**
```typescript
function getIndicator(type: string): Indicator {
  if (type === 'RSI') return new RSIIndicator();
  if (type === 'MACD') return new MACDIndicator();
  if (type === 'SMA') return new SMAIndicator();
  // ... 20 more types
  throw new Error(`Unknown type: ${type}`);
}
```

**After:**
```typescript
const INDICATOR_REGISTRY: Record<string, () => Indicator> = {
  RSI: () => new RSIIndicator(),
  MACD: () => new MACDIndicator(),
  SMA: () => new SMAIndicator(),
  // ... 20 more types
};

function getIndicator(type: string): Indicator {
  const factory = INDICATOR_REGISTRY[type];
  if (!factory) throw new Error(`Unknown type: ${type}`);
  return factory();
}
```

---

## Decision Trees

### Should I Extract a Helper?

```
Is the logic > 40 lines OR used in multiple places?
├─ YES → Extract to helper function
│   └─ Is it used only in this file?
│       ├─ YES → Keep in same file (or local helpers/ folder)
│       └─ NO → Move to shared utils/ or feature helpers/
└─ NO → Keep inline (clarity is more important than extraction)
```

### Should I Create a Feature Folder?

```
Is the file > 150 lines OR has 3+ related files?
├─ YES → Create feature folder with proper structure
│   └─ Does it have complex logic?
│       ├─ YES → Add helpers/ subfolder
│       └─ NO → Keep flat with types.ts + constants.ts
└─ NO → Keep as single file (over-abstraction hurts readability)
```

### Should I Rename This?

```
Is the name unclear OR inconsistent with conventions?
├─ YES → Rename
│   └─ Is it exported/public?
│       ├─ YES → Update ALL usages across repo (use list_code_usages)
│       └─ NO → Rename locally
└─ NO → Keep existing name (consistency matters)
```

---

## Troubleshooting

### Tests Fail After Refactor

1. **Check behavior preservation**: Did you accidentally change logic?
2. **Review test assertions**: Do they still match the refactored structure?
3. **Run specific test**: `npm test -- path/to/test.test.ts`
4. **Check mocks**: Did you change interfaces that tests mock?

### TypeScript Errors After Refactor

1. **Run typecheck**: `npm run build` or `tsc -b`
2. **Check type imports**: Did you move types to a new file?
3. **Update export/import paths**: Did folder structure change?
4. **Check type compatibility**: Did you change interfaces?

### ESLint Errors After Refactor

1. **Run lint**: `npm run lint`
2. **Auto-fix**: ESLint can auto-fix some issues
3. **Check naming conventions**: camelCase, PascalCase, UPPER_SNAKE_CASE
4. **Check unused vars**: Remove or prefix with `_` if intentionally unused

### Performance Regression

1. **Run performance tests**: `npm run perf:fitness` or `npm run perf:ga`
2. **Check hot paths**: Did you add allocations in tight loops?
3. **Check typed arrays**: Did you replace typed arrays with regular arrays?
4. **Profile if needed**: Use browser DevTools or Node.js profiler

### Import Cycles

1. **Identify the cycle**: TypeScript will report circular dependency
2. **Break with interfaces**: Extract shared types to separate file
3. **Dependency injection**: Pass dependencies as parameters
4. **Restructure**: Sometimes indicates wrong abstraction boundaries

---

## Quality Checklist (Must Pass)

Before marking a refactor as "done", verify:

- [ ] **Type check passes**: `npm run build` (or `tsc -b`)
- [ ] **Lint passes**: `npm run lint`
- [ ] **Unit tests pass**: `npm test`
- [ ] **E2E tests pass** (if relevant): `npm run e2e:smoke`
- [ ] **Performance tests pass** (if algorithm changes): `npm run perf:fitness`
- [ ] **All usages updated** (if renamed/moved): Use `list_code_usages` to verify
- [ ] **No unused code**: Deleted unused files/exports
- [ ] **Tests added/updated**: Coverage for refactored areas
- [ ] **Behavior preserved**: No accidental logic changes
- [ ] **Documentation updated** (if public API changed): Comments, TSDoc, docs/

---

## References

- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Clean Code by Robert C. Martin](https://www.goodreads.com/book/show/3735293-clean-code)
- [Refactoring by Martin Fowler](https://refactoring.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [ESLint TypeScript](https://typescript-eslint.io/)

---

## Example: Full Refactor Workflow

Let's say you're refactoring `src/algorithm/someComplexFile.ts` (300 lines, multiple responsibilities):

1. **Analyze**:
   - File has 300 lines (> 150 threshold)
   - Main function has 80 lines (> 40 threshold)
   - Has magic numbers scattered throughout
   - Unclear variable names (`a`, `tmp`, `data2`)
   - No tests

2. **Plan** (create todo list):
   1. Extract constants to `constants.ts`
   2. Split main function into 3 helpers
   3. Rename unclear variables
   4. Create feature folder structure
   5. Add tests for each helper
   6. Run quality checks

3. **Execute**:
   ```typescript
   // Step 1: Create feature folder
   src/algorithm/someComplex/
   ├── SomeComplex.ts
   ├── constants.ts
   ├── types.ts
   ├── helpers/
   │   ├── validation.ts
   │   ├── computation.ts
   │   └── formatting.ts
   └── __tests__/
       ├── SomeComplex.test.ts
       ├── validation.test.ts
       ├── computation.test.ts
       └── formatting.test.ts
   
   // Step 2: Extract constants
   // constants.ts
   export const MAX_ITERATIONS = 100;
   export const CONVERGENCE_THRESHOLD = 0.001;
   
   // Step 3: Extract helpers
   // helpers/validation.ts
   export function validateInput(input: Input): ValidationResult { ... }
   
   // helpers/computation.ts
   export function computeResult(validated: ValidInput): ComputeResult { ... }
   
   // helpers/formatting.ts
   export function formatOutput(result: ComputeResult): Output { ... }
   
   // Step 4: Refactor main function
   // SomeComplex.ts
   export function someComplex(input: Input): Output {
     const validated = validateInput(input);
     const result = computeResult(validated);
     return formatOutput(result);
   }
   
   // Step 5: Add tests for each
   // __tests__/validation.test.ts
   import { describe, it, expect } from 'vitest';
   import { validateInput } from '../helpers/validation';
   
   describe('validateInput', () => {
     it('should validate correct input', () => {
       const input = { /* ... */ };
       const result = validateInput(input);
       expect(result.isValid).toBe(true);
     });
     
     it('should reject invalid input', () => {
       const input = { /* invalid */ };
       const result = validateInput(input);
       expect(result.isValid).toBe(false);
     });
   });
   ```

4. **Verify**:
   ```powershell
   npm run build   # Type check
   npm run lint    # Lint
   npm test        # Unit tests
   npm run e2e:smoke  # E2E (if relevant)
   ```

5. **Done**: All quality checks pass, refactor is complete.

---

## Anti-Patterns to Avoid

1. **Over-abstraction**: Don't create layers that don't add value (e.g., single-use wrappers)
2. **Under-abstraction**: Don't leave 500-line files with duplicated logic
3. **Half-migrations**: Don't rename things without updating all usages
4. **Silent behavior changes**: Don't fix "bugs" during refactor without tests
5. **Performance degradation**: Don't replace performant code with slower patterns
6. **Breaking tests**: Refactors should preserve behavior, so tests should still pass
7. **Unused code**: Don't leave dead code behind (delete it)
8. **Magic strings/numbers**: Don't leave literals scattered (extract to constants)

---

## Summary: The Refactoring Loop

```
1. Analyze file → Identify issues
2. Plan refactor → Create todo list
3. Extract constants → Single source of truth
4. Extract helpers → Reduce complexity
5. Rename for clarity → Improve readability
6. Simplify control flow → Reduce nesting
7. Update tests → Preserve behavior
8. Run quality checks → Verify all pass
9. Done → Refactor complete
```

**Remember**: Refactoring is about improving structure while preserving behavior. Performance, readability, and maintainability are the goals—not just making the code "look nice."
