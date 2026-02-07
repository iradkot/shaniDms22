// ---------------------------------------------------------------------------
// Parse LLM response into a structured ToolEnvelope
// ---------------------------------------------------------------------------

import {ToolEnvelope} from './types';

/**
 * Attempt to parse an LLM response as a structured tool envelope.
 *
 * Supports multiple back-compat formats:
 * - `{"type":"tool_call","name":"...","args":{...}}`
 * - `{"type":"tool_call","tool_name":"...","args":{...}}` (legacy)
 * - `{"type":"final","content":"..."}`
 * - `{"type":"<toolName>","args":{...}}` (tool name in type field)
 * - `{"name":"<toolName>","args":{...}}` (no type field)
 * - Fenced JSON blocks (```json ... ```)
 *
 * Returns null when the text doesn't match any known envelope shape.
 */
export function tryParseToolEnvelope(text: string): ToolEnvelope | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;

  // Accept fenced JSON blocks.
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Best-effort: extract a single top-level JSON object.
  const firstBrace = unfenced.indexOf('{');
  const lastBrace = unfenced.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) return null;

  const candidate = unfenced.slice(firstBrace, lastBrace + 1).trim();
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null;

  try {
    const obj = JSON.parse(candidate);
    return interpretParsedEnvelope(obj);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function interpretParsedEnvelope(obj: any): ToolEnvelope | null {
  // Standard: {"type":"tool_call","name":"..."}
  if (obj?.type === 'tool_call' && typeof obj?.name === 'string') {
    return {type: 'tool_call', name: obj.name, args: obj.args};
  }

  // Back-compat: {"type":"tool_call","tool_name":"..."}
  if (obj?.type === 'tool_call' && typeof obj?.tool_name === 'string') {
    return {type: 'tool_call', name: obj.tool_name, args: obj.args};
  }

  // Standard final: {"type":"final","content":"..."}
  if (obj?.type === 'final' && typeof obj?.content === 'string') {
    return {type: 'final', content: obj.content};
  }

  // Structured question: {"type":"ask_patient","question":"...","options":[...]}
  if (
    obj?.type === 'ask_patient' &&
    typeof obj?.question === 'string' &&
    Array.isArray(obj?.options)
  ) {
    const options = obj.options
      .filter((o: any) => typeof o?.key === 'string' && typeof o?.label === 'string')
      .map((o: any) => ({key: String(o.key), label: String(o.label)}));
    return {type: 'ask_patient', question: obj.question, options};
  }

  // Back-compat: tool name in `type` field, e.g. {"type":"analyze_time_in_range","args":{...}}
  if (
    typeof obj?.type === 'string' &&
    obj.type !== 'tool_call' &&
    obj.type !== 'final' &&
    obj?.args !== undefined
  ) {
    return {type: 'tool_call', name: obj.type, args: obj.args};
  }

  // Back-compat: no `type`, only {"name":"tool","args":{...}}
  if (typeof obj?.name === 'string' && obj?.args !== undefined) {
    return {type: 'tool_call', name: obj.name, args: obj.args};
  }

  return null;
}
