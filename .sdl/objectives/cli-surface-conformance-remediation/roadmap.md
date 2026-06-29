# Roadmap

## Work

- [x] Conformance audit: classified the pre-ship checklist into `docs/cli-surface-conformance-audit.md`. This is the historical seed matrix, not fresh proof for current file paths.

- [x] **Decision gate:** the six ADR-needed design calls are recorded in `docs/adr/0015-cli-surface-conformance-decisions.md` (Accepted), and the audit has no active `ADR-needed` remediation state left. Decisions cover raw-exit policy, hidden `exec` write intent, `ccc land` single-PR auto-merge, query/action miss semantics, empty-success/presence-query `ok`, and dotfile/user-environment danger tiers.

- [x] **Hidden `exec` danger-tier rebaseline:** `branch-context exec delete` and the Address review-thread mutators stay prompt-free under ADR 0015 #2; their operation arguments supply agent/script intent. `branch-context` remains relevant under area (c) for modeled error types, not area (a) confirmation.

- [~] **Current-source reconciliation before remediation:** active remediation rows have been rebaselined as they were fixed, including the Branch Context / Plans generic-wrapper row. Remaining work is a final close-read/checklist pass to decide whether the historical audit matrix needs broader current-status annotation before closing the Objective; no known non-parked implementation gap is currently parked here.

- [x] **Area (a) — danger-tier safety remediation (landed for currently listed human-facing gaps).** Human-facing destructive/user-environment commands now use canonical confirmation behavior, while hidden `exec` destructive/external writes remain prompt-free under ADR 0015 #2. Landed evidence:
  - `brmem delete`: added `--yes`/`-y`, `ClinkrInteraction` plumbing, non-interactive `usageError` with `missingFlag: "--yes"`, interactive confirm/decline/abort handling, and explicit cancelled result data.
  - `sdl shell install`: added `--yes`/`-y`, Tier 2 gating before rc-file writes, and cancelled result data for declined prompts.
  - `areg init` and `areg skill apply`: migrated the in-scope confirmation seams from the private prompt gateway to `ClinkrInteraction`, with non-interactive `usageError` and `--yes`/`-y` bypasses.
  - `packagechk claim-pypi`/`claim-npm`: replaced `--skip-confirmation` with canonical `--yes`/`-y`; follow-up Area (d) remediation moved these commands onto Clinkr envelopes with `usageError` for missing `--yes` in non-interactive mode.
  - `slot free --all`: replaced `ctx.shouldWriteCdDirective` authorization with `requireInteractiveOrUsageError(repoCtx.interaction, ...)` while preserving presentation/progress coupling for human output.

- [x] **Area (d) — exit-semantics remediation.** Re-verified the flagged commands against current source, then applied the decision table: requested-target/action miss → `negative`; bad/missing arg → `usageError`; operational error → `failure`; harmless empty/predicate miss → `ok`. Landed evidence includes AREG mutation/apply failures, Vibechk read-only lookup/config/failure classification, `sdlcc cmux report` envelope migration, `ccc exec autobranch` envelope migration, `roaster exec publish-findings` envelope migration, and packagechk default/claim command envelope migration. The only current raw-exit candidate intentionally left is `vibechk run`, parked as an ADR 0015 process-control/runner passthrough because it streams runner output and returns the runner exit code.

- [x] **Area (c) — `errorType` discipline remediation.** Casing convention resolved (ADR 0010): SDL-owned serialized machine values are **kebab-case** and JSON property names are **camelCase**; this is a direct breaking migration with no aliases. Existing kebab-case values like `missing-tool` (AREG skillx) and `prompt-not-found` (`brmem resolve-prompt`) are now conformant; previously snake_case values were migrated to kebab-case across the CLI surface, and a focused `SDL_TS_BAN_SNAKE_CASE_CLI_MACHINE_VALUE` style guard now blocks regressions on Clinkr `failure(...)` error types and `errorType` literals. The deferred Branch Context / Plans wrapper gap is now remediated in current source: generic `branch-context-error` / `plans-error` collapse has been replaced with modeled command/domain-level failure types (for example `branch-context-load-failed`, `branch-context-attach-failed`, `saved-plan-write-failed`, `saved-plan-resolution-failed`) plus structured `data.code` and recovery fields; invalid invocation paths now use `usageError(...)` where applicable, and latest-plan semantic misses carry structured `negative(...)` data.

- [x] **Area (b) — output bounding.** Aretro has been rebaseline-and-remediated against current source: `collect-evidence` now exposes applied session limit, returned count, completion/truncation state, and continuation guidance, while `read-evidence-detail` exposes selector/value bounds and broad-pointer narrowing guidance without adding generic pagination/range APIs. Vibechk has also been rebaseline-and-remediated: `runs` now has `--max-runs` plus `outputBounds`, and `show`/`diff` now have `--max-artifact-bytes` with per-artifact completion/truncation metadata and human truncation guidance. Validation: targeted Aretro/Vibechk scenario tests and `just ts-check` passed. `roaster review log` was rechecked against current schemas and parked as a domain-small branch-scoped metadata list below the ADR 0012 evidence threshold.

## Parked

- [ ] Domain-small unbounded lists below the ADR 0012 evidence threshold: `handoff list`/`gc`, `brmem list`, `plans list`, `objective exec read-objective`, Address PR-list commands, and `roaster review log`, unless current evidence shows they crossed the threshold.
- [ ] `ccc land`/`land-stack` Pi slash-command surface envelope/`errorType`/`negative` discipline — separate non-Clinkr `LandStackResult` framework.
- [ ] New conformance tooling / lint rules (YAGNI per ADR 0012 unless separately designed).
- [ ] Structural/DRY CLI cleanup — owned elsewhere.
