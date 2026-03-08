import {EvidenceRequest} from '../types';

const EVIDENCE_TAG_RE = /\[\[\s*evidence\s*:\s*(agp|tir|meal)\s*:\s*(\d{1,3})(?:\s*:\s*([^\]\s]+))?\s*\]\]/gi;

export interface EvidenceLink {
  request: EvidenceRequest;
  label: string;
}

export function extractEvidenceLinks(text: string): EvidenceLink[] {
  if (typeof text !== 'string' || !text.trim()) return [];

  const out: EvidenceLink[] = [];
  const seen = new Set<string>();

  EVIDENCE_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((match = EVIDENCE_TAG_RE.exec(text)) !== null) {
    const kind = (match[1] || '').toLowerCase() as 'agp' | 'tir' | 'meal';
    const rangeDays = Math.max(1, Math.min(90, Number(match[2] || 14)));
    const focusDateIso = typeof match[3] === 'string' && match[3].trim() ? match[3].trim() : undefined;
    const key = `${kind}:${rangeDays}:${focusDateIso ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const baseLabel =
      kind === 'agp'
        ? `Open AGP (${rangeDays}d)`
        : kind === 'tir'
          ? `Open Time in Range (${rangeDays}d)`
          : `Open Meal Response (${rangeDays}d)`;
    const label = focusDateIso ? `${baseLabel} • focus` : baseLabel;

    out.push({
      request: {kind, rangeDays, focusDateIso},
      label,
    });
  }

  return out;
}

export function stripEvidenceTags(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(EVIDENCE_TAG_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}
