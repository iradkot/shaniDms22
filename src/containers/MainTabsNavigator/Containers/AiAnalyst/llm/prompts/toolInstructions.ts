// ---------------------------------------------------------------------------
// Tool instructions appended to system prompts
// ---------------------------------------------------------------------------

import {LOOP_SETTINGS_TOOLS_DESCRIPTION} from './loopSettingsAdvisor';

/**
 * Default tool instructions (Hypo Detective / general follow-up).
 *
 * Describes how the LLM should request additional data via local tools
 * and how to structure the JSON envelope for tool calls and final responses.
 */
export const DEFAULT_TOOL_SYSTEM_PROMPT =
  `Tooling (optional):\n` +
  `You can request additional app data via LOCAL TOOLS. Use tools when the user asks for more CGM/insulin/treatments data or when needed to answer accurately.\n\n` +
  `If the user asks about a different time window than the data you currently have (e.g. "last 5 months"), call an appropriate tool first.\n\n` +
  `Available tools (use exactly these names):\n` +
  `- getCgmData (alias of getCgmSamples): {rangeDays: number (1-180), maxSamples?: number (50-2000), includeDeviceStatus?: boolean}\n` +
  `- getCgmSamples: {rangeDays: number (1-180), maxSamples?: number (50-2000), includeDeviceStatus?: boolean}\n` +
  `- getTreatments: {rangeDays: number (1-180)}\n` +
  `- getInsulinSummary: {rangeDays: number (1-90)}\n` +
  `- getPumpProfile: {dateIso?: string}  → returns ONLY the basal schedule. For ISF/CR/targets/DIA use getCurrentProfileSettings.\n` +
  `- getCurrentProfileSettings: {dateIso?: string}  → returns ISF, CR, targets, DIA, and basal schedules with snapshots at key times.\n` +
  `- getHypoDetectiveContext: {rangeDays: number (1-180), lowThresholdMgdl?: number (default 55), maxEvents?: number}\n` +
  `- getGlycemicEvents: {kind: "hypo"|"hyper", rangeDays: number (1-180), thresholdMgdl: number, maxEvents?: number}  → Note: totalCount in the response indicates the real total; events may be truncated.\n` +
  `- getMealAbsorptionData: {daysBack: number (1-90), mealType?: "all"|"breakfast"|"lunch"|"dinner"|"snack"}  → Returns per-meal carb absorption: carbsEntered vs carbsAbsorbed, estimation accuracy (over/under/accurate), TIR score, and aggregated summary.\n\n` +
  `Tool choice guidance:\n` +
  `- If the user asks about hypers/highs, do NOT call getHypoDetectiveContext. Use getGlycemicEvents(kind="hyper") or getCgmData.\n` +
  `- If the user asks about hypos/lows, use getGlycemicEvents(kind="hypo") or getHypoDetectiveContext.\n` +
  `- To get ALL pump/loop settings, call getCurrentProfileSettings which includes basal, ISF, CR, targets and DIA.\n\n` +
  `How to call a tool:\n` +
  `- Respond with ONLY a single-line JSON object: {"type":"tool_call","name":"getCgmSamples","args":{...}}\n` +
  `- After you receive a message starting with "Tool result (NAME):", respond with ONLY: {"type":"final","content":"..."}.\n` +
  `- If you don't need a tool, respond with {"type":"final","content":"..."}.\n` +
  `- Content may include Markdown.\n\n` +
  `Asking the patient structured questions:\n` +
  `When you need more information from the patient, prefer using structured multiple-choice questions instead of open-ended ones. This makes it easier for the patient to respond.\n` +
  `Respond with: {"type":"ask_patient","question":"Your question here","options":[{"key":"a","label":"Option A"},{"key":"b","label":"Option B"},{"key":"c","label":"Option C"},{"key":"d","label":"Other (please describe)"}]}\n` +
  `Rules for structured questions:\n` +
  `- Always include 3-5 options covering the most likely answers.\n` +
  `- Always include an "Other" option (usually key "d" or "e") so the patient can provide their own answer.\n` +
  `- Keep option labels short and clear (under 15 words each).\n` +
  `- Use ask_patient for follow-up questions about lifestyle, habits, timing, and preferences — things that tools cannot answer.\n` +
  `- Do NOT use ask_patient for data questions that tools can answer.\n`;

/**
 * Tool instructions for the Loop Settings Advisor.
 *
 * Requires at least 3 tool calls before making recommendations and includes
 * an extended set of available tools for glucose stats/ pattern analysis.
 */
export const LOOP_SETTINGS_TOOL_SYSTEM_PROMPT =
  `Tooling (REQUIRED for Loop Settings Advisor):\n` +
  `You MUST use tools to gather data and verify your findings. Use at least 3 tool calls before making any recommendation.\n` +
  `CRITICAL: Do NOT ask the user whether they changed settings (ISF/CR/targets/basal/DIA). Verify with tools (especially getSettingsChangeHistory / getProfileChangeHistory).\n` +
  `Ask the user only for context that tools cannot provide (sleep/dinner/exercise/alcohol/illness).\n` +
  `To reduce truncation, keep each assistant message short (aim <150 words). Prefer bullets over long paragraphs.\n\n` +
  `Suggested early tool sequence for overnight issues:\n` +
  `1) getSettingsChangeHistory(daysBack=60, changeType="all")\n` +
  `2) analyzeTimeInRange(timeOfDay="overnight") or getGlucoseStats(timeOfDay="overnight")\n` +
  `3) getGlucosePatterns(daysBack=30, focusTime="overnight")\n` +
  `4) comparePeriods (if the user says it used to be better)\n\n` +
  LOOP_SETTINGS_TOOLS_DESCRIPTION +
  `\nAdditional tools available:\n` +
  `- getCgmData: {rangeDays: number (1-180), maxSamples?: number (50-2000)}\n` +
  `- getTreatments: {rangeDays: number (1-180)}\n` +
  `- getPumpProfile: {dateIso?: string}  → returns ONLY the basal schedule. For ISF/CR/targets/DIA use getCurrentProfileSettings.\n` +
  `- getCurrentProfileSettings: {dateIso?: string}  → returns ALL settings: ISF, CR, targets, DIA, and basal schedules with snapshots at key times. Use this tool to get a complete picture of the user's current settings.\n` +
  `- getGlucoseStats: {startDate: ISO date string, endDate: ISO date string, timeOfDay?: "all"|"overnight"|"morning"|"afternoon"|"evening"}\n` +
  `- getMonthlyGlucoseSummary: {monthsBack: number (1-24), timeOfDay?: "all"|"overnight"|"morning"|"afternoon"|"evening"}\n` +
  `- getSettingsChangeHistory: {daysBack: number (1-180), changeType?: "all"|"carb_ratio"|"isf"|"targets"|"basal"|"dia"}\n` +
  `- getProfileChangeHistory: {rangeDays: number (7-180), maxEvents?: number (1-50)}\n` +
  `- analyzeSettingsImpact: {changeDate: ISO string, windowDays: number (1-30)}\n\n` +
  `Naming note: snake_case aliases like get_settings_change_history are accepted, but prefer the camelCase names listed here when possible.\n\n` +
  `How to call a tool:\n` +
  `- Respond with ONLY a single-line JSON object: {"type":"tool_call","name":"getGlucosePatterns","args":{...}}\n` +
  `- After you receive a message starting with "Tool result (NAME):", either call another tool or respond with {"type":"final","content":"..."}.\n` +
  `- You may call up to 20 tools per conversation.\n` +
  `- Content may include Markdown.\n\n` +
  `Asking the patient structured questions:\n` +
  `When you need lifestyle / context information from the patient (not data that tools can provide), prefer structured multiple-choice questions.\n` +
  `Respond with: {"type":"ask_patient","question":"Your question here","options":[{"key":"a","label":"Option A"},{"key":"b","label":"Option B"},{"key":"c","label":"Option C"},{"key":"d","label":"Other (please describe)"}]}\n` +
  `Rules for ask_patient:\n` +
  `- Use it for follow-up questions about habits, timing, routines, meal types, exercise, sleep — things tools cannot answer.\n` +
  `- Always include 3-5 options covering common answers, plus an "Other" option.\n` +
  `- Keep option labels short and clear (under 15 words each).\n` +
  `- You may use ask_patient in Step 2 (follow-up questions) instead of plain text questions.\n`;
