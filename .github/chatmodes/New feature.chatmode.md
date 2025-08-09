---
description: 'Expert mode for adding new features to ShaniDms diabetes management app with strict code quality standards and health app compliance.'
tools: ['codebase', 'usages', 'vscodeAPI', 'think', 'problems', 'changes', 'testFailure', 'terminalSelection', 'terminalLastCommand', 'openSimpleBrowser', 'fetch', 'findTestFiles', 'searchResults', 'githubRepo', 'extensions', 'runTests', 'editFiles', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'console-ninja_runtimeErrors', 'console-ninja_runtimeLogs', 'console-ninja_runtimeLogsByLocation', 'console-ninja_runtimeLogsAndErrors']
---

# ShaniDms New Feature Development Mode

## 🏥 CRITICAL: Health App Standards
This is a **diabetes management app** where accuracy and consistency are **life-critical**. Every calculation, threshold, and data display must be precise and medically safe.

## 📋 Pre-Development Checklist
Before adding any new feature, **ALWAYS**:

### 1. 🔍 **Check Existing Patterns**
- Search for similar functionality in the codebase
- Identify reusable components, hooks, and utilities
- Avoid duplicating existing logic

### 2. 🎯 **Use Single Source of Truth**
- **Constants**: Use `src/constants/PLAN_CONFIG.ts` for ALL glucose thresholds and medical constants
- **Styling**: Use `src/style/colors.ts` and theme system - NO hardcoded colors
- **Types**: Check `src/types/` before creating new interfaces
- **Utils**: Use existing utilities in `src/utils/` and `src/components/AGPGraph/utils/`

### 3. 📐 **App Structure Guidelines**

#### **Component Organization**:
```
src/
├── components/           # Reusable UI components
│   ├── shared/          # Cross-app shared components
│   └── AGPGraph/        # Glucose analysis components
├── containers/          # Screen-level containers
│   └── MainTabsNavigator/
├── hooks/              # Custom React hooks
├── utils/              # Business logic utilities
├── constants/          # Single source of truth (PLAN_CONFIG.ts)
├── types/              # TypeScript interfaces
└── style/              # Theme and styling
```

#### **Component Hierarchy**:
- **Screens/Containers**: Top-level navigation components
- **Components**: Reusable UI building blocks
- **Hooks**: Data fetching and business logic
- **Utils**: Pure functions for calculations

## 🔧 **Development Standards**

### **Glucose Calculations - CRITICAL**
```typescript
// ✅ ALWAYS USE - Single source of truth
import { GLUCOSE_THRESHOLDS } from 'app/constants/PLAN_CONFIG';

// ✅ CORRECT - Use STANDARD range for TIR calculations
const inRange = bgData.filter(bg => 
  bg.sgv >= GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.min &&
  bg.sgv <= GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.max
);

// ✅ CORRECT - Consistent rounding
const percentage = Math.round((inRange.length / bgData.length) * 100);

// ❌ NEVER DO - Hardcoded values
const inRange = bgData.filter(bg => bg.sgv >= 70 && bg.sgv <= 140);
```

### **Styling Standards**
```typescript
// ✅ ALWAYS USE - Theme system
import { useTheme } from 'styled-components/native';
const theme = useTheme();

// ✅ CORRECT - Theme colors
backgroundColor: theme.backgroundColor
color: theme.textColor

// ❌ NEVER DO - Hardcoded colors
backgroundColor: '#FFFFFF'
color: 'black'
```

### **Component Structure**
```typescript
// ✅ CORRECT - Follow this pattern
interface ComponentProps {
  bgData: BgSample[];
  onPress?: () => void;
}

const Component: React.FC<ComponentProps> = ({ bgData, onPress }) => {
  const theme = useTheme();
  
  // Calculations using established utilities
  const { averageBg } = calculateAverageAndStdDev(bgData);
  
  return (
    <Container>
      {/* UI implementation */}
    </Container>
  );
};
```

## 🧩 **Key Utilities & Patterns**

### **Blood Glucose Calculations**
- `src/utils/bg.utils.ts` - Basic BG statistics
- `src/components/AGPGraph/utils/statistics.utils.ts` - Advanced AGP analytics
- **Always use existing calculation functions**

### **Date/Time Handling**
- `src/utils/datetime.utils.ts` - Date formatting and manipulation
- Use `date-fns` library for date operations

### **Data Fetching**
- Check `src/api/apiRequests.ts` for existing endpoints
- Use established patterns for Nightscout API calls
- Implement proper error handling and loading states

### **Common Hooks**
- `useTrendsData` - For trends analysis
- `useAGPStats` - For glucose statistics  
- `useBgData` - For basic glucose data fetching

## 🎨 **UI/UX Standards**

### **Components to Reuse**
- `TimeInRangeRow` - TIR visualizations
- `StatsRow` - Statistical displays  
- `Collapsable` - Expandable sections
- `BgGradient` - Background gradients

### **Styling Patterns**
- Use `styled-components/native` for styling
- Follow existing component structure
- Maintain consistent spacing and typography
- Use theme-aware colors and gradients

## 🧪 **Testing Requirements**

### **For Health App Compliance**
1. **Unit Tests**: Test all calculation functions
2. **Integration Tests**: Test data flow between components
3. **Validation Tests**: Verify glucose threshold accuracy
4. **Edge Cases**: Test with empty/invalid data

### **Test Files Structure**
- Place tests adjacent to source files
- Use descriptive test names
- Mock external dependencies
- Test medical accuracy scenarios

## 📝 **Code Quality Checklist**

Before submitting any feature:

- [ ] **No hardcoded glucose values** - All use PLAN_CONFIG.ts
- [ ] **No duplicate calculations** - Reuse existing utilities
- [ ] **Consistent rounding** - Use Math.round() for all percentages
- [ ] **Theme compliance** - No hardcoded colors/styles
- [ ] **TypeScript strict** - Proper typing for all props/data
- [ ] **Error handling** - Graceful handling of edge cases
- [ ] **Medical accuracy** - Calculations match clinical standards
- [ ] **Performance** - Efficient data processing
- [ ] **Accessibility** - Proper labels and navigation
- [ ] **Documentation** - Clear comments for complex logic

## 🚨 **Critical Don'ts**

- **NEVER hardcode glucose thresholds** (55, 70, 140, 180, 250)
- **NEVER duplicate calculation logic** - Always reuse existing functions
- **NEVER use different rounding methods** - Always use Math.round()
- **NEVER ignore TypeScript errors** - Fix all type issues
- **NEVER skip testing** - Health apps require thorough testing

## 🎯 **AI Assistant Instructions**

When helping with ShaniDms feature development:

1. **ALWAYS check existing codebase** for similar patterns
2. **ENFORCE single source of truth** - Use PLAN_CONFIG.ts
3. **PRIORITIZE code reuse** over new implementations  
4. **MAINTAIN medical accuracy** - Double-check all glucose calculations
5. **FOLLOW established patterns** - Don't introduce new architectures
6. **VALIDATE TypeScript** - Ensure type safety
7. **CONSIDER edge cases** - Handle empty data, network errors
8. **DOCUMENT medical decisions** - Explain clinical reasoning
9. **TEST thoroughly** - Verify calculations with known datasets
10. **OPTIMIZE for performance** - Large glucose datasets need efficiency

Remember: This is a life-critical health application. Consistency, accuracy, and reliability are paramount.