# Apply sdl-cli-design standards across the CLI surface

## Thesis

The `sdl-cli-design` standard (skill + ADRs 0010–0014) is authored and the
framework-enforced gates are conformant by construction, but the four
**command-local discipline** areas the framework does not enforce are only
spot-applied across the 15 CLI packages. A point-in-time conformance audit
(`docs/cli-surface-conformance-audit.md`) classified every command against the
pre-ship checklist with file:line evidence. This Objective drives that matrix to
ground: resolve the contested design decisions it surfaced, then land the
high-confidence remediations safety-first, parking large/contested items with
rationale rather than perfecting every command.

The four command-local areas:

- **(a) Danger-tier classification** (ADR 0014) — tiers 0–3; `--yes`/`-y` (Tier 2
  confirm) vs `--force`/`-f` (Tier 3 override); prompts gate on
  `ClinkrInteraction.isInteractive()` and fail fast non-interactively with a
  `usageError` naming the flag.
- **(b) Output-volume bounding** (ADR 0012) — large results expose completion
  state, applied bound, and continuation/narrowing guidance in the result schema.
- **(c) `errorType` discipline** (ADR 0010) — stable snake_case `errorType` plus
  structured, agent-actionable `data`.
- **(d) `negative(...)` semantic correctness** (ADR 0013) — `negative` for real
  non-success; `ok` for harmless empty success; `usageError` for bad/missing args;
  `failure` for operational errors.

## Scope

- All four command-local discipline areas (a)–(d) across the 15 sdl CLI packages
  enumerated in the audit (the user-confirmed full pre-ship-checklist sweep).
- Resolving the six ADR-needed design questions the audit surfaced, because
  several gate dependent remediation (recorded as ADRs or amendments).
- Landing high-confidence (`land-now-fix`) remediations with scenario tests,
  using the conformant references as templates: `handoff delete` (Tier 2),
  `handoff gc` / `slot gc` (Tier 3), `brmem put` (Tier 3 `--force`).
- Safety-first sequencing: area (a) danger tiers, then (d) exit semantics, then
  (c) `errorType`, then (b) output bounding.

## Non-Goals

- Structural / DRY cleanup of the CLI packages — that is the separate, paused
  `ts-cli-core-structural-cleanup` Objective.
- Clinkr framework changes or new framework primitives (pagination, typed
  `--confirm`, danger-tier metadata). This is command-local authoring discipline.
- New conformance tooling or lint rules (YAGNI, consistent with ADR 0012); the
  checklist is applied by human/agent judgment.
- The `ccc land`/`land-stack` Pi slash-command surface — it runs on a separate
  non-Clinkr `LandStackResult` framework; only its single-PR auto-merge danger
  carries over as a decision.
- Re-auditing framework-enforced gates (`-h`/`--version`/`--runtime`, camelCase
  envelope, `0/1/2` exit codes, enveloped Zod usage errors, `--json-schema`,
  hidden `exec`); treated as satisfied invariants, spot-verified only.
- Perfecting every command. Contested or large items may be parked.

## Completion Criteria

- The conformance matrix (`docs/cli-surface-conformance-audit.md`) is the agreed
  source of truth. (Done — seeded this Objective.)
- The six ADR-needed decisions are recorded as ADRs or ADR amendments, and each
  dependent remediation is then either landed or parked per that decision.
- All `land-now-fix` area (a) danger-tier gaps are remediated with scenario tests
  (interactive confirm, `--yes`/`--force` bypass, non-interactive `usageError`),
  or explicitly reclassified with rationale.
- The `land-now-fix` area (d) exit-semantics and area (c) `errorType` fixes are
  applied across the enumerated commands; cross-cutting wrappers
  (`branch-context`/`plans` generic error-collapse) are replaced with modeled
  errorTypes.
- Area (b) `land-now-fix` items (`aretro`, `vibechk`, `roaster review log`) are
  bounded in their result schemas; domain-small lists stay parked with rationale.
- Every remaining gap from the matrix is either landed or explicitly parked —
  nothing silently dropped.
- Evidence: targeted scenario/unit tests and relevant per-package `just`
  validation pass for each touched package (broadened when shared wrappers move).

## Assumptions and Risks

Assumptions:

- Framework gates remain conformant by construction via `@sdl/core/cli-entry`
  `defineCli` centralization; the audit spot-verified rather than re-derived this.
- The conformant reference commands (`handoff delete`/`gc`, `slot gc`,
  `brmem put`) are valid templates for areas (a)/(d).
- The audit's file:line evidence is accurate as of the branch it was produced on.

Risks:

- **Evidence drift:** the matrix's file:line references will drift as code
  changes; each remediation must re-verify the cited lines before editing.
- **Decisions invalidate classifications:** an ADR-needed outcome can flip a
  `land-now-fix` into a non-fix — most importantly, if the `rawCommand` envelope
  exemption is ratified, several (c)/(d) "fixes" for `packagechk`, `sdlcc`,
  `vibechk run`, `roaster publish-findings`, and `ccc autobranch` disappear.
  Hence decisions must precede their dependent remediation rows.
- **Cross-cutting blast radius:** replacing the shared `runClinkrCommand`
  error-collapse wrapper, or introducing a shared confirmation helper, touches
  shared code and requires broader validation than a single package.
- **Contested tier judgments:** `brmem delete` (tombstone recoverable → Tier 1
  vs Tier 2), `vibechk run` (branch switch + arbitrary runner → Tier 1 vs Tier 2),
  and `sdl shell install` / `sdlcc cmux report` (dotfile/external write → Tier 1
  vs Tier 2) may be contested in review; the dotfile-tier decision row resolves
  the latter class.

## Open Questions

The six ADR-needed questions are **resolved** by
`docs/adr/0015-cli-surface-conformance-decisions.md` (Accepted; see update
`20260626T103959Z-decision-gate-resolved.md`). Resolutions: (1) raw-exit narrow
exemption — finite-result raw commands migrate to the envelope; (2) hidden `exec`
external writes — operation args are sufficient intent, no added confirm flag;
(3) `ccc land` single-PR auto-merge — intentional (Pi surface); (4) query-miss
`ok(found:false)` vs action-miss `negative`; (5) empty-success / presence-query
`ok` ratified; (6) user-dotfile writes are Tier 2, explicit output-path and
env-keyed metadata writes stay Tier 1. The original questions, for the record:

1. Do human-tier Tier 2 confirm rules apply to agent-only hidden `exec`
   destructive writes (`pr-address reply/resolve-review-thread`), or does the
   `agent-exec-tier.md` "required flag + `usageError`" rule suffice?
2. Should the `ccc land` single-PR fast path gain the confirmation gate the stack
   paths already have, or is auto-merge intentional there?
3. Is `rawCommand`/`isRawExit` a sanctioned exemption from the envelope /
   `resultSchema` / `--json-schema` pre-ship items, or must those commands
   migrate onto the Clinkr envelope?
4. Standard for lookup misses: `ok(found:false)` or `negative`? (Currently both
   are used for equivalent "not found" outcomes in `pr-address`, `brmem`, `plans`.)
5. Ratify presence-query `ok(present:false)` and empty-success `ok` (`brmem
   export`, `branch-context check`) as the standard, distinct from semantic
   `negative`?
6. Is an idempotent write outside the repo (`sdl shell install`, `sdlcc cmux
   report`) Tier 1, or a Tier 2 external write requiring `--yes`?
