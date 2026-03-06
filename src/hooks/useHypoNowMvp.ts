import {useEffect, useMemo, useRef} from 'react';

import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {evaluateHypoNowAndNotify} from 'app/services/proactiveCare/hypoNowMvp';

/**
 * POC hook: monitor latest CGM snapshot and trigger a single hypo-now proactive flow.
 *
 * This is intentionally small and deterministic for MVP:
 * - 1 event type: hypo_now (sgv < 70)
 * - 1 proactive alert
 * - cooldown + follow-up
 *
 * Personalization profile is included now as a "hook point" for phase-2.
 */
export function useHypoNowMvp(params?: {
  enabled?: boolean;
}) {
  const enabled = params?.enabled ?? true;

  const {snapshot} = useLatestNightscoutSnapshot({
    pollingEnabled: enabled,
  });

  const lastEvaluatedTsRef = useRef<number | null>(null);

  const latestBg = useMemo(() => {
    if (!snapshot?.enrichedBg) return null;
    return snapshot.enrichedBg;
  }, [snapshot]);

  useEffect(() => {
    if (!enabled || !latestBg) return;

    const sampleTs = typeof latestBg.date === 'number' ? latestBg.date : null;
    if (sampleTs == null) return;

    if (lastEvaluatedTsRef.current === sampleTs) return;
    lastEvaluatedTsRef.current = sampleTs;

    evaluateHypoNowAndNotify({
      latestBgSample: latestBg,
    }).catch(err => {
      console.warn('useHypoNowMvp: failed to evaluate hypo_now flow', err);
    });
  }, [enabled, latestBg]);
}
