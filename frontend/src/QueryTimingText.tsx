import type { QueryResultTiming } from './queryResultTiming'
import { formatQueryDurationSeconds, formatQueryReceivedLocal } from './queryResultTiming'

/** Inline “Duration: … (completed …).” for search / compare result headers. */
export function QueryTimingText({ timing }: { timing: QueryResultTiming | null }) {
  if (!timing) return null
  return (
    <>
      {' '}
      <strong>Duration</strong>: {formatQueryDurationSeconds(timing.durationMs)} (completed {formatQueryReceivedLocal(timing.receivedAtMs)}).
    </>
  )
}
