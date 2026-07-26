# Tier Reshape, nscc Removal, and Autorun Runner Rebaseline

## Summary

A trunk-style refresh against HEAD `c1cb8d5d3` (~150 commits since the prior
2026-07-09 rebaseline at `a814ebe36`) found the repo reshaped again and
corrected the record accordingly. No findings were re-dispositioned and no
checkbox state changed; the three open clusters (infra, capabilities,
local-pi-tools) remain accurate.

Corrections, each probe-backed:

- **Review artifact path**: the sweep's review definition now lives at
  `.ns/reviews/code-smell-review/review.md` (renamed from
  `code-smell-roaster` in commit `64e7a1ce7` "Rename Roaster CLI, skills, and
  docs to Reviews"); the Thesis had carried the stale path.
- **Second-wave package mapping** (ADR 0033 tier reshape): the `git` gateway
  moved from `capability-kit/src/git` to `infra/foundation/src/git`
  (`f93bec99a`); `ns-pi-subagents` moved from
  `ts/packages/extensions/ns-pi-subagents` (`@nseng-ai/...`) to
  `ts/packages/internal/ns-pi-subagents` as `@internal/ns-pi-subagents`
  (`bcbd592a6`); the ccc capability package was renamed `capabilities/cmux`
  (`9d2e87f53`); capability packages carry plural names; the ns CLI host
  lives at `hosts/ns` (`52359d876`).
- **nscc host removed**: commit `555ab7438` deleted `ts/packages/hosts/nscc`
  entirely. The three sdlcc/nscc fixed helpers on the hosts row
  (`formatInlineCommandFailure`, `buildOpenNewCmuxEntry`, `wrapIndex`) no
  longer exist anywhere in `ts/` — the roadmap notes now say they were
  retired with the host rather than "survive post-rename".
- **Runner architecture**: the `/objective:autopilot` Pi extension is gone
  (`.pi/extensions/` has `objective-autorun.ts` instead). Runner Policy now
  names the `objective-autorun` skill (`/ns:objective:autorun`) looping
  `objective-runner-step` (`ns objective exec runner-begin` / `runner-finish`,
  both verified in `capabilities/objectives/src/ns/commands/`), which commits
  per step and never submits; the stale `ns flow submit --no-restack` detail
  was dropped (submit's `restack` option now defaults to true in
  `flow/src/ns/commands/submit.ts`).
- **Open-finding evidence re-verified at HEAD**:
  `internal/pi-tools/src/pr-feedback-watch/feedback-watch/controller.ts` is
  now 823 lines (record said ~790); `formatRunnerSubagentProgressWidgetLines`
  in `internal/ns-pi-subagents/src/runner-subagents/presentation.ts` is still
  referenced only by its own test (production uses `widget.ts`'s
  `formatRunnerSubagentActivityWidgetLines`); the open infra sub-areas
  (cli-runtime, cli-theme, time, test-kit) all still exist under
  `infra/foundation/src/*`.
- **Fixed-helper survival sweep (2026-07-12)**: a batch probe of the
  present-tense helpers named on completed rows found all surviving across
  the reshape (now under `capabilities/{branch-context,cmux,flow,handoffs,
  objectives,plans,pr-feedback,retros,reviews,slots}`, `capability-kit`,
  `hosts/pi`, `kernel`, `tools/*`, documentation, `.pi/lib`), with two renames
  annotated inline: `resolveSelectedSdlCommand` → `resolveSelectedNsCommand`
  (kernel) and `SPECIALIZED_TEST_CATEGORIES` →
  `SPECIALIZED_TEST_GLOBS_BY_CATEGORY` (`ts/vitest.shared.ts`). The
  `flow-land-execution-migration` Objective (closed at HEAD) restructured
  land execution, but the land/flow fixed helpers (`presentFailureAndReturn`,
  `prExpectationMismatches`, `formatCommandFailureText`, `PrDiffLocator`,
  `summarizeAutobranchCompletion`) all survive.
- Minor line-count drift recorded: grill `extension.ts` is ~160 lines (was
  ~120 at split time); thermo-council `orchestrator.ts` remains ~276.

## Objective Impact

- `objective.md`: Thesis review path corrected; Assumptions reorg mapping
  rewritten for the tier reshape (git→foundation, nscc removal, ns-pi-subagents
  retier, cmux rename, untracked-artifact caveat); Runner Policy rebased from
  autopilot to autorun/runner-step semantics; Risks god-file line counts
  refreshed.
- `roadmap.md`: preamble re-verification date moved to 2026-07-12; infra and
  local-pi-tools row mappings corrected; hosts row nscc helper notes changed
  from "survives" to "removed with the host"; kernel, ts-root, ccc, and
  capabilities rows annotated with verified renames/survival.
- Status unchanged: 3 clusters open ([~] infra, capabilities, local-pi-tools),
  18 complete ([x]). Not closure-ready — material remediation remains. No
  frontmatter (`blocked:`/`edges:`) exists on this record, so no Blocked
  Sentence was affected.

## Follow-Ups

- At pickup for the open clusters, re-map remaining reference paths against
  the post-tier-reshape layout above and re-verify each smell before
  implementing, per the standing rule.
- The capabilities cluster's remaining findings were again not re-counted
  against `references/capabilities.md`; the land-area findings especially need
  re-verification against the migrated `flow/src/land` execution code.

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD
