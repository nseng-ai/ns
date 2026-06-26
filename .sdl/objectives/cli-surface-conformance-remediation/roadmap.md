# Roadmap

## Work

- [x] Conformance audit: classified per-command matrix against the pre-ship
      checklist with file:line evidence (`docs/cli-surface-conformance-audit.md`).
      Seeds this Objective; treated as the source of truth.

- [x] **Decision (gates remediation):** the six ADR-needed design calls are
      recorded in one omnibus ADR, `docs/adr/0015-cli-surface-conformance-decisions.md`
      (Accepted), and every dependent row in the conformance audit is reclassified
      (no row remains `ADR-needed`). See update
      `20260626T103959Z-decision-gate-resolved.md`.
  - rawCommand envelope exemption (gates (c)/(d) for `packagechk`, `sdlcc cmux
    report`, `vibechk run`, `roaster publish-findings`, `ccc autobranch`).
  - Agent-only `exec` destructive/external-write confirmation model (gates
    `branch-context exec delete` and `pr-address` `reply`/`resolve-review-thread`
    (a)).
  - `ccc land` single-PR fast-path confirmation (gates `ccc land` (a)).
  - Query-miss vs action-miss semantics (gates `pr-address` (d); standardizes
    `brmem`/`plans`).
  - Presence-query / empty-success `ok` ratification (`brmem export`,
    `branch-context check`).
  - Dotfile / external-write danger tier (`sdl shell install`, `sdlcc cmux
    report`).

- [ ] **Area (a) — danger-tier safety remediation (land-now).** Add confirmation
      gating only to the unblocked **human-facing** destructive commands, modeled
      on `handoff delete`/`gc`. With scenario tests per human-facing command
      (interactive confirm, `--yes`/`--force` bypass, non-interactive
      `usageError`). Hidden `exec` destructive/external writes stay prompt-free
      under ADR 0015 #2 when required operation arguments supply intent.
  - `brmem delete`: add `--yes`/`-y` + `requireInteractiveOrUsageError`.
  - `sdl shell install`: add `--yes`/`-y` + `requireInteractiveOrUsageError` for
    the user-dotfile write (ADR 0015 #6).
  - `areg init`, `areg skill apply`: re-gate the existing `--yes` onto
    `isInteractive()` (retire the private readline gateway path).
  - `packagechk claim-pypi`/`claim-npm`: gate on `isInteractive()` and rename
    `--skip-confirmation` to `--yes`/`-y` (tier from the dotfile/publish decision).
  - `slot free --all`: re-gate confirmation from the output-format proxy onto
    `isInteractive()`; emit a flag-naming `usageError` instead of
    `failure("confirmation_required")`/`failure("aborted")`.

- [ ] **Area (d) — exit-semantics remediation (land-now).** Apply the decision
      table (not-found → `negative`; bad/missing arg → `usageError`; operational
      error → `failure`; harmless empty → `ok`) across the flagged commands:
      `areg init`/`skill apply`, `aretro collect-evidence`, `brmem get`/`delete`/
      `copy`, `plans exec resolve`, `objective exec runner-subagent-usage`,
      `ccc cmux-workspace-summary`, `vibechk show`/`diff`, `sdlcc cmux report`.
      `pr-address` (d) follows the query-miss decision.

- [ ] **Area (c) — `errorType` discipline remediation (land-now).** Fix kebab-case
      errorTypes (`objective` storage codes, `areg skillx` `missing-tool`,
      `brmem resolve-prompt` `prompt-not-found`); replace the generic
      error-collapse wrappers in `branch-context`/`plans` with modeled snake_case
      errorTypes; add structured `data` where it aids recovery (ADR 0010
      "consider", lower priority). Envelope-migration cases follow the rawCommand
      decision. `branch-context exec delete` still participates here through the
      generic wrapper, not through Area (a) confirmation work.

- [ ] **Area (b) — output bounding (land-now subset).** Add completion/bound state
      to result schemas for `aretro` (both commands; cap the `value: unknown`
      deref), `vibechk runs`/`show`/`diff`, and `roaster review log`.

## Parked

- [ ] Domain-small unbounded lists below the ADR 0012 evidence threshold:
      `handoff list`/`gc`, `brmem list`, `plans list`, `objective exec
      read-objective`, `pr-address` PR-list commands. Park with rationale.
- [ ] `ccc land`/`land-stack` Pi slash-command surface envelope/`errorType`/
      `negative` discipline — separate non-Clinkr `LandStackResult` framework.
- [ ] New conformance tooling / lint rules (YAGNI per ADR 0012).
- [ ] Structural/DRY CLI cleanup — owned by the paused
      `ts-cli-core-structural-cleanup` Objective.
