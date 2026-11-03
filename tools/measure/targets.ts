// The published targets (plan step 5 item 9, Release rules). `docs/engineering/targets.md` shows the same numbers, a test
// keeps the two together, and `npm run measure` fails when one is missed. Set by the owner on 2026-11-01 from
// the measurements in that file, with headroom for CI machines that were not measured. Any change to a number
// goes in the changelog.

export const TARGETS = {
  /** Any speed-set item, one call through the matcher, checker and decoder, in milliseconds. */
  pipelineMs: 1500,
  /** The backup lock: median of a cold Node process handling one small event, in milliseconds. */
  backupHookMs: 500,
  /** Catch set, through the whole pipeline. */
  catchAtLeast: 135,
  catchOf: 138,
  /** Code set (R-08): left alone, and twins hidden. */
  codeLeftAlone: 41,
  twinsHidden: 81,
  /** Hidden per MB through the pipeline, at most. */
  falseAlarmsPerMb: {
    sourceWithFile: 6.5,
    sourceNoFile: 90,
    logs: 250,
  },
} as const
