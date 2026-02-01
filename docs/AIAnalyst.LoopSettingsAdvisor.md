# AI Analyst - Loop Settings Advisor

## Overview

The AI Analyst will be enhanced with two distinct analysis modes, each with specialized prompts and workflows:

1. **User Behavior Improvements** - Training and tips for better diabetes management
2. **Loop Settings Improvements** - Data-driven settings recommendations using analysis tools

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Analyst Screen                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐     ┌─────────────────────────────┐    │
│  │  User Behavior      │     │  Loop Settings              │    │
│  │  Improvements 👤    │     │  Improvements ⚙️            │    │
│  │                     │     │                             │    │
│  │  • Injection tips   │     │  • ISF analysis             │    │
│  │  • Timing guidance  │     │  • CR recommendations       │    │
│  │  • Carb counting    │     │  • Basal rate tuning        │    │
│  │  • Exercise advice  │     │  • Target range advice      │    │
│  └─────────────────────┘     └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 1: User Behavior Improvements

### Purpose
Help users improve their personal diabetes management behaviors through education and personalized tips.

### Topics Covered
- **Injection Technique** - Site rotation, timing, absorption optimization
- **Carb Counting** - Accuracy tips, hidden carbs, protein/fat effects
- **Pre-bolusing** - When and how long before eating
- **Exercise Management** - Temp targets, timing, types of exercise
- **Stress & Illness** - How they affect glucose, adjustments needed
- **Sleep Hygiene** - Dawn phenomenon, overnight management

### Prompt Strategy

```typescript
const USER_BEHAVIOR_SYSTEM_PROMPT = `
You are a friendly diabetes educator helping a Loop user improve their daily management.

Your role:
1. Analyze the user's recent glucose patterns and behaviors
2. Identify areas where user actions (not Loop settings) could improve outcomes
3. Provide actionable, specific tips they can implement today

Focus areas:
- Injection/bolus timing relative to meals
- Carb counting accuracy
- Pre-bolusing habits
- Activity and exercise patterns
- Sleep and overnight patterns

Communication style:
- Warm and encouraging
- Non-judgmental about past behaviors
- Celebrate what's working well
- Suggest 1-3 improvements at a time (not overwhelming)
- Use simple language, avoid medical jargon

IMPORTANT: Do NOT suggest Loop settings changes in this mode. 
Focus only on user behaviors and habits.
`;
```

### Workflow
1. User selects "User Behavior Improvements"
2. AI reviews recent CGM data and treatment history
3. AI identifies behavioral patterns (meal timing, bolus timing, etc.)
4. AI presents 2-3 personalized tips with explanations
5. User can ask follow-up questions

---

## Section 2: Loop Settings Improvements

### Purpose
Provide data-driven Loop settings recommendations by analyzing historical data with specialized tools, ensuring thorough verification before making suggestions.

### Key Principles

1. **Tool-First Verification** - Verify setting changes via tools; don't ask the user to remember
2. **Tool-Based Analysis** - Minimum 3 tool calls, up to 20, to verify findings
3. **Specific Recommendations** - Concrete setting changes with reasoning
4. **Safety-Conscious** - Conservative suggestions, recommend gradual changes

#### Important behavioral rule
- Do NOT ask the user whether they changed settings (ISF/CR/targets/basal/DIA). Use `get_settings_change_history` (and related tools) to verify.
- Ask the user only for context tools cannot provide (sleep/dinner/exercise/illness).

### Available Tools

```typescript
// Tools from our loopAnalysis service
const LOOP_SETTINGS_TOOLS = [
  {
    name: 'get_settings_change_history',
    description: 'Get history of user settings changes (CR, ISF, targets, basal)',
    parameters: {
      daysBack: 'number (1-90)',
      changeType: 'all | carb_ratio | isf | targets | basal | dia',
    },
  },
  {
    name: 'get_cgm_data_around_change',
    description: 'Get CGM readings before and after a settings change',
    parameters: {
      changeId: 'string - ID of the settings change',
      hoursBefore: 'number (1-72)',
      hoursAfter: 'number (1-72)',
    },
  },
  {
    name: 'analyze_time_in_range',
    description: 'Calculate TIR metrics for a specific period',
    parameters: {
      startDate: 'ISO date string',
      endDate: 'ISO date string',
      timeOfDay: 'all | night | morning | afternoon | evening (optional)',
    },
  },
  {
    name: 'get_glucose_patterns',
    description: 'Identify recurring glucose patterns (highs, lows, variability)',
    parameters: {
      daysBack: 'number (7-30)',
      focusTime: 'all | overnight | post-meal | fasting',
    },
  },
  {
    name: 'compare_periods',
    description: 'Compare glucose metrics between two time periods',
    parameters: {
      period1Start: 'ISO date',
      period1End: 'ISO date',
      period2Start: 'ISO date',
      period2End: 'ISO date',
    },
  },
  {
    name: 'get_insulin_delivery_stats',
    description: 'Get insulin delivery statistics (basal vs bolus, total daily)',
    parameters: {
      startDate: 'ISO date',
      endDate: 'ISO date',
    },
  },
  {
    name: 'analyze_meal_responses',
    description: 'Analyze glucose responses to meals by time of day',
    parameters: {
      daysBack: 'number (7-30)',
      mealType: 'breakfast | lunch | dinner | snack | all',
    },
  },
];
```

### Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                 Loop Settings Improvement Flow                   │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│   PHASE 1    │────▶│   PHASE 2    │────▶│      PHASE 3         │
│  Questions   │     │   Analysis   │     │   Recommendation     │
└──────────────┘     └──────────────┘     └──────────────────────┘
       │                    │                       │
       ▼                    ▼                       ▼
  Ask 3+ questions    Use tools 3-20x      Present findings
  to understand       to analyze data      with specific
  user's concerns     and verify           settings changes
```

#### Phase 1: Clarifying Questions (MANDATORY)

Before any analysis, the LLM MUST ask the user at least 3 questions:

```typescript
const CLARIFYING_QUESTIONS_PROMPT = `
Before I analyze your Loop settings, I need to understand your situation better.

Please answer these questions:

1. **What's your main concern?**
   - Too many lows (hypoglycemia)?
   - Too many highs (hyperglycemia)?
   - Too much variability/swings?
   - Specific time of day issues?

2. **When do you notice the most problems?**
   - Overnight (12am-6am)
   - Morning (6am-12pm)
   - Afternoon (12pm-6pm)
   - Evening (6pm-12am)
   - After meals
   - During exercise

3. **Have you made any recent changes?**
   - New medication?
   - Diet changes?
   - Exercise routine changes?
   - Stress levels?
   - Recent illness?

4. **What's your comfort level with changes?**
   - I want conservative, small adjustments
   - I'm okay with moderate changes
   - I'm comfortable with larger adjustments

5. **Any specific settings you're concerned about?**
   - Carb Ratio (CR)
   - Insulin Sensitivity Factor (ISF)
   - Basal rates
   - Target glucose range
   - Not sure / analyze everything
`;
```

#### Phase 2: Tool-Based Analysis (Minimum 3 calls)

```typescript
const ANALYSIS_PHASE_PROMPT = `
Now I'll analyze your data using specialized tools. I'll make multiple checks to ensure my recommendations are accurate.

Analysis Strategy:
1. First, I'll look at your recent settings change history
2. Then, I'll analyze glucose patterns around those changes
3. I'll compare periods before and after changes
4. I'll identify specific times when issues occur
5. I'll verify my findings with additional data pulls

I must use at least 3 different analysis tools, and I'll use more if needed to be confident in my recommendations.

IMPORTANT: After each tool call, I'll explain what I found before moving to the next analysis step.
`;
```

**Required Analysis Sequence:**

```
1. get_settings_change_history (daysBack: 30)
   └─▶ Understand recent changes made

2. get_glucose_patterns (daysBack: 14, focusTime: based on user's concern)
   └─▶ Identify problem areas

3. analyze_time_in_range (timeOfDay: problem period)
   └─▶ Quantify the issue

4. [CONDITIONAL] If settings changed recently:
   └─▶ get_cgm_data_around_change
   └─▶ compare_periods (before vs after)

5. [CONDITIONAL] If meal-related issues:
   └─▶ analyze_meal_responses

6. [VERIFICATION] Re-check with different parameters
   └─▶ Confirm findings are consistent
```

#### Phase 3: Recommendations

```typescript
const RECOMMENDATION_PROMPT = `
Based on my analysis, here are my specific recommendations:

Format for each recommendation:
┌─────────────────────────────────────────────────────────┐
│ 🎯 RECOMMENDATION: [Setting Name]                       │
├─────────────────────────────────────────────────────────┤
│ Current Value: [X]                                      │
│ Suggested Value: [Y]                                    │
│ Time Slot: [if applicable, e.g., "12am-6am"]           │
│                                                         │
│ 📊 Evidence:                                            │
│ - [Data point 1 from tool analysis]                    │
│ - [Data point 2 from tool analysis]                    │
│ - [Data point 3 from verification]                     │
│                                                         │
│ 💡 Reasoning:                                           │
│ [Clear explanation of why this change should help]     │
│                                                         │
│ ⚠️ Caution:                                             │
│ [Any risks or things to watch for]                     │
│                                                         │
│ 📈 Expected Outcome:                                    │
│ [What improvement the user should expect]              │
└─────────────────────────────────────────────────────────┘

IMPORTANT GUIDELINES:
- Suggest only ONE setting change at a time
- Recommend monitoring for 3-7 days before further changes
- Always err on the side of caution (smaller changes first)
- Never suggest changes that could significantly increase hypo risk
- Remind user to consult their healthcare provider for major changes
`;
```

---

## System Prompts

### Loop Settings Advisor - Full System Prompt

```typescript
const LOOP_SETTINGS_ADVISOR_SYSTEM_PROMPT = `
You are an expert Loop settings advisor with deep knowledge of automated insulin delivery systems, specifically the Loop app.

## Your Mission
Help users optimize their Loop settings through careful, data-driven analysis.

## Your Process (MANDATORY)

### Step 1: Understanding (REQUIRED FIRST)
You MUST ask at least 3 clarifying questions before any analysis:
- What specific problem is the user experiencing?
- When does it occur?
- What have they already tried?
- What's their comfort level with changes?
- Any lifestyle factors to consider?

DO NOT proceed to analysis until the user answers your questions.

### Step 2: Analysis (MINIMUM 3 TOOL CALLS)
Once you understand the problem:
1. Use the available tools to gather data
2. Make at least 3 different tool calls
3. You may use up to 20 tool calls for thorough analysis
4. After EACH tool call, briefly explain what you found
5. Verify your findings by cross-checking with additional data

### Step 3: Recommendations
After thorough analysis:
1. Present specific, actionable recommendations
2. Include current vs suggested values
3. Explain your reasoning with data evidence
4. Note any cautions or risks
5. Suggest a monitoring plan

## Available Settings to Analyze
- **ISF (Insulin Sensitivity Factor)**: How much 1 unit of insulin lowers glucose
- **CR (Carb Ratio)**: Grams of carbs covered by 1 unit of insulin
- **Basal Rates**: Background insulin delivery per hour
- **Target Range**: Desired glucose range (low and high targets)
- **DIA (Duration of Insulin Action)**: How long insulin remains active

## Safety Guidelines
- NEVER suggest changes that significantly increase hypoglycemia risk
- Recommend small, incremental changes (5-10% adjustments)
- Always suggest monitoring period of 3-7 days
- Remind users to consult healthcare providers for significant changes
- If data is insufficient, say so rather than guessing

## Communication Style
- Clear and educational
- Show your work - explain what the data shows
- Be confident but not overconfident
- Acknowledge limitations and uncertainties
- Use specific numbers, not vague suggestions

## Example Interaction Flow

User: "I keep going low at night"

You: "I want to help you with those overnight lows. Before I analyze your data, let me ask a few questions:

1. What time do you typically notice the lows? (e.g., 2am, 5am)
2. Are they happening every night or certain nights?
3. Have you changed anything recently - exercise, dinner timing, evening snacks?
4. What's your current overnight basal rate and ISF?

Once you answer these, I'll dig into your data to find the cause."

[User answers]

You: "Thanks for those details. Let me analyze your data now...

[Tool call: get_glucose_patterns]
I can see you've had 8 lows between 2-4am in the past 2 weeks...

[Tool call: analyze_time_in_range for overnight]  
Your overnight TIR is 65% with 20% below range...

[Tool call: get_insulin_delivery_stats]
Your overnight basal delivery averages 0.8U/hr...

Based on this analysis, here's my recommendation:
[Structured recommendation]"
`;
```

---

## UI/UX Design

### Section Selection Screen

```
┌─────────────────────────────────────────────────────────┐
│                    🤖 AI Analyst                        │
│                                                         │
│  Choose an analysis type:                               │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  👤 User Behavior Improvements                   │   │
│  │                                                  │   │
│  │  Get personalized tips to improve your daily    │   │
│  │  diabetes management habits and routines.       │   │
│  │                                                  │   │
│  │  • Injection timing tips                        │   │
│  │  • Carb counting guidance                       │   │
│  │  • Exercise recommendations                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ⚙️ Loop Settings Improvements                   │   │
│  │                                                  │   │
│  │  Data-driven analysis of your Loop settings     │   │
│  │  with specific change recommendations.          │   │
│  │                                                  │   │
│  │  • ISF optimization                             │   │
│  │  • Carb ratio tuning                            │   │
│  │  • Basal rate adjustments                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Analysis In Progress

```
┌─────────────────────────────────────────────────────────┐
│  ⚙️ Loop Settings Analysis                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔍 Analyzing your data...                              │
│                                                         │
│  ✓ Fetched settings history (3 changes in 30 days)     │
│  ✓ Analyzed overnight glucose patterns                  │
│  ⟳ Calculating time in range metrics...                │
│  ○ Compare before/after periods                        │
│  ○ Generate recommendations                            │
│                                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░  75%       │
│                                                         │
│  Tool calls: 3 of ~5 expected                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### Phase 1: Core Infrastructure
- [ ] Create `AnalystMode` type ('behavior' | 'settings')
- [ ] Add mode selection UI to AI Analyst screen
- [ ] Create separate system prompts for each mode
- [ ] Implement question tracking (ensure 3+ questions asked)

### Phase 2: Loop Settings Tools
- [ ] Implement `get_settings_change_history` tool
- [ ] Implement `get_cgm_data_around_change` tool
- [ ] Implement `analyze_time_in_range` with timeOfDay filter
- [ ] Implement `get_glucose_patterns` tool
- [ ] Implement `compare_periods` tool
- [ ] Implement `get_insulin_delivery_stats` tool
- [ ] Implement `analyze_meal_responses` tool

### Phase 3: Analysis Workflow
- [ ] Create tool call counter (min 3, max 20)
- [ ] Add verification prompts between tool calls
- [ ] Build recommendation formatter
- [ ] Add safety checks before recommendations

### Phase 4: UI/UX
- [ ] Design mode selection cards
- [ ] Build analysis progress indicator
- [ ] Create recommendation cards with evidence
- [ ] Add "consult your doctor" disclaimers

---

## Example Analysis Session

### User Flow

```
1. User opens AI Analyst
2. User selects "Loop Settings Improvements"
3. AI asks clarifying questions:
   "Before I analyze your settings, I need to understand..."
   - Q1: What's your main concern?
   - Q2: When do problems occur?
   - Q3: Any recent changes?
   
4. User answers: "I keep going high after breakfast, around 180-200"

5. AI acknowledges and begins analysis:
   "Thanks! I'll analyze your morning glucose patterns..."
   
6. AI makes tool calls (shown to user):
   - get_glucose_patterns (mornings, 14 days)
   - analyze_meal_responses (breakfast)
   - get_settings_change_history (CR changes)
   - analyze_time_in_range (morning vs other times)
   - compare_periods (weekday vs weekend breakfast)
   
7. AI presents findings:
   "I found some interesting patterns..."
   - Your breakfast TIR is 45% vs 72% at other meals
   - Morning ISF might be too weak (less insulin sensitive)
   - Your current morning CR is 1:10
   
8. AI gives recommendation:
   "Based on my analysis, I suggest:
   
   🎯 ADJUST MORNING CARB RATIO
   Current: 1:10 (6am-10am)
   Suggested: 1:9 (6am-10am)
   
   Evidence:
   - Post-breakfast avg: 185 mg/dL
   - Time above range: 55%
   - Consistent pattern over 14 days
   
   Try this for 5 days and monitor..."
```

---

## Safety Considerations

1. **Medical Disclaimer**: Always remind users that AI suggestions are not medical advice
2. **Conservative Changes**: Suggest small adjustments (5-10%)
3. **Monitoring Period**: Recommend 3-7 days before next change
4. **Hypo Prevention**: Never suggest changes that increase low risk
5. **Data Quality**: If insufficient data, say so clearly
6. **Professional Consultation**: For significant changes, recommend doctor visit

---

## Success Metrics

- User completes analysis session (doesn't abandon)
- User implements recommended changes
- Follow-up analysis shows improved TIR
- User satisfaction rating
- No safety incidents from recommendations

---

## Future Enhancements

1. **Automated Monitoring**: Track if recommendations improved outcomes
2. **A/B Testing**: Compare different recommendation strategies
3. **Integration with Loop**: Direct settings export/import
4. **Doctor Reports**: Generate reports to share with healthcare providers
5. **Pattern Library**: Learn from successful adjustments across users
