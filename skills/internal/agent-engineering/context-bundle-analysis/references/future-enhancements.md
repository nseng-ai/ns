# Future enhancements (parked, explicitly out of v1)

This file is the parked backlog for `context-bundle-analysis`. Each item below
was considered during design and deliberately deferred — not rejected. Do not
implement any of these as part of ordinary skill use; they require a fresh
design decision first.

## Calibration and quantification

- **Calibration table**: a token-count × content-class × position → severity-band
  lookup that would let findings carry calibrated severity instead of qualitative
  concern levels. Deferred because no trustworthy calibration data exists for
  real agent sessions; shipping one would launder lab numbers into point
  estimates — exactly the anti-pattern the skill core forbids.
- **Numeric anchors as decision inputs**: using published benchmark magnitudes
  (e.g. effective-length thresholds, multi-turn degradation percentages) as
  inputs to the prune/quarantine/handoff decision. Deferred for the same reason:
  benchmark magnitudes are lab ceilings from synthetic tasks.
- **Per-model effective-length reasoning**: conditioning verdicts on the profiled
  model's measured effective context length (RULER-style claimed-vs-effective
  data, Fiction.liveBench as a living leaderboard). Deferred until a maintained,
  current data source is chosen; stale per-model tables are worse than none.

## Analysis machinery

- **Subagent fan-out per flagged episode**: dispatching one subagent per
  `stale`/`rot`/`wasteful` episode to sample and assess it in isolation, keeping
  the parent analysis context small. Deferred from v1 to keep the first version
  simple; the targeted-read protocol covers the need at current bundle sizes.
- **Episodes-optional self-segmentation mode**: analyzing bundles whose
  `episodes.json` is missing by segmenting the transcript in-skill. Rejected for
  v1 — the skill is strictly a second-pass interpreter of profiler episode
  claims; re-segmenting would duplicate the profiler's job, worse.
- **Any-transcript input**: accepting arbitrary session transcripts rather than
  profiler bundles. Rejected for v1 — the input contract is the profiler bundle
  directory, whose files and verdict vocabulary the skill depends on.

## Output and integration

- **Machine-readable `analysis.json`**: a structured schema alongside
  `analysis.md`. Deferred because no consumer exists yet; designing a schema
  with no consumer invites churn.
- **Condensed core wired into the profiler's interrogation analyst**: a compact
  version of this skill's taxonomy and rubric embedded in the context-profiler's
  read-only bundle-interrogation prompt, so interactive interrogation sessions
  speak the same diagnosis language. Deferred — the profiler is deliberately
  diagnostic-only, and changing its prompts is a separate decision with its own
  owner.
- **Handoff-artifact completeness scoring**: an AbsenceBench-inspired check that
  asks "what did the handoff/compaction drop?" when a bundle shows a session that
  was continued from a prior context. Deferred: absence detection is exactly what
  models are bad at; doing this credibly needs a design of its own.
