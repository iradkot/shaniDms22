// A narrow deterministic backstop for explicit dosing commands. This does not
// validate clinical correctness or replace the final model review. In contrast
// to the legacy basal keyword check, factual mentions and negations are allowed.
const DIRECTIVES = [
  /\b(?:take|inject|administer|give(?: yourself)?)\b[^\n;!?]{0,55}?(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half)\s*(?:units?|iu|u)\b/gi,
  /\bbolus\s+(?:with\s+)?\d+(?:[.,]\d+)?\s*(?:units?|iu|u)\b/gi,
  /\b(?:set|change|increase|decrease|reduce|raise|lower|adjust)\b[^\n;!?]{0,40}?\b(?:basal(?: rate)?|carb(?:ohydrate)? ratio|insulin sensitivity|correction factor|isf|icr)\b[^\n;!?]{0,40}?\d/gi,
  /(?:קח(?:י|ו)?|הזריק(?:י|ו)?|הזרק(?:י|ו)?|תזריק(?:י|ו)?|להזריק|לקחת|לתת)\s[^\n;!?]{0,45}?\d+(?:[.,]\d+)?\s*(?:יחידות|יחידה|יח׳|יח')/g,
  /(?:להעלות|להוריד|להפחית|להגדיל|העלה|העלי|הפחת|הפחיתי|שנה|שני)\s[^\n;!?]{0,35}?(?:בזאל|בסאל|קצב בסיס|יחס פחמימות|רגישות לאינסולין|פקטור תיקון)[^\n;!?]{0,35}?\d/g,
];

const isNegatedOrReported = (clause: string, index: number): boolean => {
  const prefix = clause.slice(0, index);
  if (
    /(?:\bdo not|\bdon['’]t|\bnever|\bavoid|\bshould not|\bshouldn['’]t|\bmust not|\bnot to)\s+(?:\w+\s+){0,2}$/i.test(
      prefix,
    ) ||
    /(?:^|\s)(?:אל|לא|אין)(?:\s+\S+){0,3}\s*$/.test(prefix)
  ) {
    return true;
  }
  // Only explicitly attributed existing instructions are exempt. Quotation
  // marks alone cannot turn a new dosing command into safe descriptive text.
  return /(?:your (?:prescribed |existing )?plan (?:says|states)|your (?:clinician|doctor|care team) (?:wrote|said|prescribed)|you (?:said|reported)|(?:הרופא|הרופאה|הצוות המטפל) (?:כתב|כתבה|אמר|אמרה|הנחה)|(?:אמרת|דיווחת))\s*:?\s*["“״]?\s*$/i.test(
    prefix,
  );
};

export const assertRecommendationOutputSafe = (answer: string): void => {
  // Keep decimal numbers intact while separating independent instructions.
  const clauses = answer
    .replace(/[*_`]/g, '')
    .split(/(?:[.!?](?:\s+|$)|[;\n])/);
  for (const clause of clauses) {
    for (const pattern of DIRECTIVES) {
      pattern.lastIndex = 0;
      for (const match of clause.matchAll(pattern)) {
        if (!isNegatedOrReported(clause, match.index ?? 0)) {
          const error = new Error(
            'The reviewed answer contained an unsupported treatment instruction.',
          );
          error.name = 'UnsafeRecommendationError';
          throw error;
        }
      }
    }
  }
};
