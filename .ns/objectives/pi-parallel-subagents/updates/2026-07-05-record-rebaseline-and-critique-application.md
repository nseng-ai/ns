# Record Rebaseline and Critique Application (2026-07-05)

Refresh of this record against branch `explorer-dispatch-auth-failover-schema-fix`.

Provenance: objective-refresh basis target=b28cd1a0d from=9b37f0cb

## Summary

The record was moved from the stale `.sdl/objectives/` root (a pre-rename leftover that
hid it from `ns objective list`/`check`, whose root is `.ns/objectives/`) to
`.ns/objectives/pi-parallel-subagents/`, and the three suggested changes from
`updates/2026-07-04-objective-critique.md` were applied to `objective.md` and
`roadmap.md`. The code-side fix the critique demanded had already landed on this
branch: `contract.ts` points at `.ns/pi/agents/explorer.md` and all 17 explore tests
pass at the basis SHA.

Every material substrate claim was re-verified forensically at the basis:
`dispatchRunnerSubagent` and thermo-council's local worker pool exist; the 48k-char
final-text cap with session-file pointer is at `runner-subagents/extension.ts:31,181`;
the explorer allowlist is `read,grep,find,ls` with no `bash`/`edit`/`write`; the auth
probe is `isProviderAuthConfigured` from `@ns/pi/runtime/auth` (AuthStorage-backed);
`dispatch.ts` retains the single-retry failover on `error`/`protocol-error`; children
still launch `--no-extensions` with the `runtimeExtensionPath` seam available; and
`.pi/extensions/home-directory-guard.ts` exists but is stripped from children.

## Objective Impact

- Roadmap item 2's evidence is trustworthy again (`.ns` path, 17 tests, passing suite);
  the critique-application roadmap item is closed with its outcome recorded, which
  unblocks item 3 (the model-invocable fan-out tool).
- The Thesis no longer claims "no result context economy"; it names the actual gap
  (scout-sized ~5k preview vs the existing 48k cap + pointer).
- Assumptions and Risks now record the Anthropic-only cheap-model scoping and the
  explorer-child home-directory-guard bypass; the bypass *decision* is deliberately
  still open, tracked as a new roadmap item and open question.
- The engineered implementation's home is `ts/packages/internal/pi-tools` (moved from
  `ts/packages/local/pi-tools`, which no longer has tracked files); historical
  citations of the old path carry "since moved" notes rather than silent rewrites.

## Follow-Ups

- Decide the explorer-child home-directory-guard bypass (accept, inject via the
  `--extension runtimeExtensionPath` seam, or document prompt-scoping as sufficient)
  and record the decision as an update — tracked as an unchecked roadmap item.
- Proceed to roadmap item 3 (fan-out tool) now that item-2 evidence passes.
