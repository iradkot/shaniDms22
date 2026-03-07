import {EvidenceRequest} from '../types';

const EVIDENCE_TAG_RE = /\[\[\s*evidence\s*:\s*(agp|tir)\s*:\s*(\d{1,3})\s*\]\]/gi;

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
    const kind = (match[1] || '').toLowerCase() as 'agp' | 'tir';
    const rangeDays = Math.max(1, Math.min(90, Number(match[2] || 14)));
    const key = `${kind}:${rangeDays}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      request: {kind, rangeDays},
      label: kind === 'agp' ? `Open AGP (${rangeDays}d)` : `Open Time in Range (${rangeDays}d)`,
    });
  }

  return out;
}

export function stripEvidenceTags(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(EVIDENCE_TAG_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}
