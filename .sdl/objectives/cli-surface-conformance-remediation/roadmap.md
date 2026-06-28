# Roadmap

## Work

- [x] Conformance audit: classified the pre-ship checklist into `docs/cli-surface-conformance-audit.md`. This is the historical seed matrix, not fresh proof for current file paths.

- [x] **Decision gate:** the six ADR-needed design calls are recorded in `docs/adr/0015-cli-surface-conformance-decisions.md` (Accepted), and the audit has no active `ADR-needed` remediation state left. Decisions cover raw-exit policy, hidden `exec` write intent, `ccc land` single-PR auto-merge, query/action miss semantics, empty-success/presence-query `ok`, and dotfile/user-environment danger tiers.

- [x] **Hidden `exec` danger-tier rebaseline:** `branch-context exec delete` and the Address review-thread mutators stay prompt-free under ADR 0015 #2; their operation arguments supply agent/script intent. `branch-context` remains relevant under area (c) for modeled error types, not area (a) confirmation.

- [~] **Current-source reconciliation before remediation:** remap audit rows from historical package/file locators to current tracked locations and reclassify rows whose code changed after the audit. Verified drift includes package topology moves into `tools/`, `infra/`, `capabilities/`, `hosts/`, `@sdl/kernel`, and `@sdl/address`; Aretro also now has SDL extension command-face wiring plus `maxSessions`/payload-mode behavior that must be checked before applying the old area (b) row.

- [ ] **Area (a) — danger-tier safety remediation (land-now after current-source check).** Add or correct confirmation gating only for unblocked human-facing destructive/user-environment commands. Keep hidden `exec` destructive/external writes prompt-free under ADR 0015 #2. Current probes still show representative open gaps:
  - `brmem delete`: no `--yes`/`-y` in `ts/packages/infra/brmem/src/operations/delete.ts` / CLI registration.
  - `sdl shell install`: installs a marker block through `ts/packages/kernel/src/operations/shell.ts` with no confirm option.
  - `areg init` and `areg skill apply`: expose `yes`, but prompt through the private prompt gateway rather than a verified non-interactive `usageError` path.
  - `packagechk claim-pypi`/`claim-npm`: still uses `skipConfirmation` in `ts/packages/tools/packagechk/src/claim-command.ts`; rename/compatibility policy needs implementation.
  - `slot free --all`: still keys confirmation behavior on `ctx.shouldWriteCdDirective` and emits `confirmation_required` failure in `ts/packages/capabilities/slot/src/operations/free.ts`.

- [ ] **Area (d) — exit-semantics remediation.** Re-verify the flagged commands against current source, then apply the decision table: requested-target/action miss → `negative`; bad/missing arg → `usageError`; operational error → `failure`; harmless empty/predicate miss → `ok`. Do not carry old path evidence forward without a fresh probe.

- [ ] **Area (c) — `errorType` discipline remediation.** Re-verify then fix kebab-case and generic-collapse errors. Current probes still show examples such as `missing-tool` in AREG skillx, `prompt-not-found` in `brmem resolve-prompt`, and `branch_context_error` in Branch Context. Replace generic wrappers with modeled snake_case errors and useful recovery data.

- [ ] **Area (b) — output bounding.** Re-verify original rows before editing. Aretro's original row is stale enough to require reassessment because current code exposes `maxSessions`, compact results, and payload-mode/detail locators; decide whether remaining area (b) work is completion/bound metadata, deref limiting, or parking. Also re-check `vibechk runs/show/diff` and `roaster review log` against current schemas.

## Parked

- [ ] Domain-small unbounded lists below the ADR 0012 evidence threshold: `handoff list`/`gc`, `brmem list`, `plans list`, `objective exec read-objective`, and Address PR-list commands, unless current evidence shows they crossed the threshold.
- [ ] `ccc land`/`land-stack` Pi slash-command surface envelope/`errorType`/`negative` discipline — separate non-Clinkr `LandStackResult` framework.
- [ ] New conformance tooling / lint rules (YAGNI per ADR 0012 unless separately designed).
- [ ] Structural/DRY CLI cleanup — owned elsewhere.
