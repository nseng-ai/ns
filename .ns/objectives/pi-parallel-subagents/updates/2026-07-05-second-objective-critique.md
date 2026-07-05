# Second Objective Critique (2026-07-05)

Red-team critique of this Objective at branch `refactor-explorer-abort-signal-helper`
(head `7fc6da3c8`), after the 2026-07-04 critique's changes were applied. The record
edits this critique demanded were applied in the same session (this update is written
alongside them).

## Summary

Verdict: **go-with-changes** — record-level changes only; no code changes required for
roadmap item 3 (fan-out tool) to proceed.

All 2026-07-04 fixes were re-verified rather than trusted: `contract.ts` points at
`.ns/pi/agents/explorer.md`, all 17 explore tests pass at head, the Thesis names the
scout-preview gap accurately, and the Anthropic-only scoping and guard-bypass risks are
recorded. Every substrate claim re-checked at head holds (`--no-extensions` at
`subagent-process.ts:524`, 48k cap at `runner-subagents/extension.ts:31,181`, allowlist
`read,grep,find,ls` reaching child argv, thermo-council pool still local). The failover
policy is exhaustively pinned by a full eight-status matrix test
(`test/explore/dispatch.test.ts`).

## Concerns, ranked

### 1. The recorded guard-injection option overstated an "existing seam" (medium)

objective.md and the roadmap decision item said the home-directory guard could be
injected "via the existing `--extension runtimeExtensionPath` seam in
`subagent-process.ts`". That seam is not caller-reachable: `runtimeExtensionPath` lives
on the internal `BuildChildPiArgsInput` (`subagent-process.ts:81`) and is populated
exclusively from generated terminal-runtime files (`subagent-process.ts:253-255`),
created only for terminal-mode runs. Explorer dispatch is `final-text` with no terminal
tools, so no `--extension` flag is ever passed, and `RunnerSubagentOptions`
(`extension-api.ts:133-151`) exposes no extension-injection surface. Choosing "inject"
costs a small plumbing slice (caller-facing option, threading, coexistence with the
terminal runtime extension, tests). **Applied:** risk, open question, and roadmap item
reworded to price the option honestly.

### 2. The guard-bypass decision was unsequenced relative to dogfood (medium)

The decision item floated at the bottom of the roadmap while the dogfood item would
launch real children with `grep`/`find`, no cwd jail, and no home-directory guard —
scope prompt-enforced only, against a standing hard rule prohibiting broad home
traversal for all subagents. **Applied:** the decision item now sits directly before
the dogfood item and explicitly gates it; items 3–5 (fake-driven) are not blocked.

### 3. The two cheap-model paths can silently diverge (low)

Anthropic-family parents get the `haiku` shorthand (`model-policy.ts:30`), resolved by
Pi at child launch; the auth-probe path pins `anthropic/claude-haiku-4-5`
(`contract.ts:20-22`). When Anthropic ships the next Haiku, the shorthand upgrades and
the pin does not. **Applied:** noted in the Anthropic-only scoping assumption so any
divergence is a decision, not drift.

### 4. "Strict scout output contract" is prompt-enforced only (low, not applied)

`EXPLORER_SCOUT_SECTION_HEADERS` has no runtime consumer — only the contract-sync test
and the test fake use it; nothing validates a child's final text. Becomes load-bearing
at roadmap item 4 (preview plumbing); validate there or soften the word "strict".

### 5. Dispatcher hard-depends on a consumer artifact (low, not applied)

`dispatchExplorerSubagent` throws via `loadPiAgentDefinition` when no
`.ns/pi/agents/explorer.md` exists walking up from cwd (`agent-definition.ts:61-68`).
Fine for the in-repo completion criterion; item 3's tool must catch it and return a
friendly error.

### 6. ADR numbering collision (info)

`docs/adr/` holds two 0023s (and doubled 0022s/0024s) — repo-wide drift, not this
objective's; citations here use full filenames and stay unambiguous.

## Stated assumptions, classified

| Assumption / Risk                                | Classification                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Pi 0.80.x extension API stays stable             | **Plausible but unchecked** — workspace pins 0.79.1, installed CLI 0.80.3; skew honestly recorded. |
| 2026-07-02 survey stays representative           | **Plausible but unchecked** — three days old; the build decision it fed is durable (ADR on disk).  |
| Haiku-class recon useful under strict contract   | **Plausible but unchecked at n=1** — one recorded smoke; dogfood item is the control.              |
| Two-layer delivery path                          | **Verified** — `dispatch-runner-subagent.ts` shim exists; explore shim correctly absent (item 3).  |
| Anthropic-only cheap-model scoping               | **Verified** — `model-policy.ts:23-36`; anthropic family matches provider `"anthropic"` only.      |
| Risk: adoption cedes control / fork burden       | **Moot** — build decision recorded; no adoption occurred.                                          |
| Risk: build = owning Pi SDK churn                | **Verified real and contained** — sole direct upstream import is `AuthStorage` in `@ns/pi` auth.   |
| Risk: no-`bash` recon loss                       | **Verified real** — allowlist in `contract.ts:10`, integration-tested to child argv.               |
| Risk: consolidation likely parks                 | **Verified plausible** — thermo-council pool still deliberately local.                             |
| Risk: guard-bypass on `--no-extensions` children | **Verified real** — and the recorded inject option was mispriced (concern 1, now fixed).           |

## Objective Impact

- objective.md: guard-bypass risk and open question reworded with the true injection
  cost and an explicit dogfood gate; cheap-model divergence noted in the scoping
  assumption.
- roadmap.md: guard-decision item moved before the dogfood item and marked as gating
  it; dogfood item cross-references the gate.
- Concerns 4–6 recorded here only; no record or code edits (concern 4 lands with item
  4's preview plumbing, concern 5 with item 3's tool error path, concern 6 belongs to
  repo-ontology housekeeping).

## Follow-Ups

- Item 3 (fan-out tool): catch the missing-agent-definition throw and surface a
  friendly tool error (concern 5).
- Item 4 (preview plumbing): validate scout sections at the preview boundary or soften
  "strict" (concern 4).
