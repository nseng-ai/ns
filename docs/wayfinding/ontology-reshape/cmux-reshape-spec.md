# Cmux reshape spec

## What this resolves

Executes the ratified decisions of the `ontology-reshape` roadmap row "Reexamine CCC
and the orchestration layer (grilling)", decided 2026-07-11. Rationale lives in ADR
0034 (`docs/adr/0034-rename-ccc-to-cmux-capability.md`); this document is mechanics
only — what changes, in what order, how to verify. Execution follows the saved-plan
pipeline in `reshaping-handoff-vehicle.md` (read-only verification sweep → ratified
enriched plan → dedicated execution session, stacked slices, `just` green per slice).

## Landed vs. not

- **Landed already (separate slice, branch `delete-nscc-stack-map-host`):** the
  unscoped `nscc` host deletion — the row's other disposition — tracked in
  `updates/2026-07-11-nscc-deletion-disposition.md`. Not part of this spec.
- **Landed with the decision session:** ADR 0034, this spec, the Objective tracking
  edits, and the `cross-harness-parity` closure record. Everything below is **not
  executed**.

## Ordered items

Items 1–3 are sequential (same files). Items 4–6 depend on 1–3. Items 7–8 can ride
anywhere late. Doc ride-alongs are listed per item; glossary claims must never
outrun the code state of the PR they ride.

### 1. Trim the flow-facade residue (pre-rename, inside `capabilities/ccc`)

- Delete export subpaths `./land`, `./trunk-pull`, `./autoslot` and modules
  `src/ns/land.ts`, `src/ns/trunk-pull.ts`, `src/ns/autoslot.ts`,
  `src/ns/autoslot-presentation.ts`; delete tests `test/land-command.test.ts`,
  `test/land-test-helpers.ts`, `test/autoslot.test.ts`,
  `test/autoslot-presentation.test.ts` (as of 2026-07-11; re-enumerate at
  execution).
- Scope facts (as of 2026-07-11): the only importers of these subpaths are the
  package's own tests; the real implementations live in `@nseng-ai/flow`
  (`capabilities/flow/src/autoslot/`, `src/land/`).
- Drop the `@nseng-ai/flow` dependency if nothing else imports it; verify with a
  package-wide grep for `@nseng-ai/flow` before removal.
- Doc ride-alongs: none (glossary rewrite is item 6).
- Verify: `just` green; no `land|trunk-pull|autoslot` references remain under the
  package.

### 2. Rename package, directory, and internal structure

- `git mv ts/packages/capabilities/ccc ts/packages/capabilities/cmux`; package name
  `@nseng-ai/cmux`; `git mv src/cmux src/core`; `ns.subpackages` →
  `["api", "core", "ns", "pi"]`; verify exports-map spelling against
  `docs/conventions/subpackage-conventions.md`.
- `CCC_PACKAGE_IDENTITY` → `CMUX_PACKAGE_IDENTITY` in `src/api/index.ts`:
  `packageName: "@nseng-ai/cmux"`, `vocabularyName: "cmux"`, no expanded name,
  `ownedConcerns` trimmed to `["cmux-workspace-orchestration"]` (drop
  `graphite-stack-orchestration`, `worktree-flow-coordination`);
  `test/package-identity.test.ts` follows.
- External importers of `@nseng-ai/ccc` to rewrite (as of 2026-07-11; re-enumerate):
  `tools/areg` (`package.json`, `src/command-backed-skill-registry.ts`,
  `test/unit/command-backed-skill-registry.test.ts`),
  `infra/foundation/test/cli-theme/package-boundary.test.ts`,
  `internal/typescript-style-guard/src/config.ts:82` (row becomes
  `{ packageName: "@nseng-ai/cmux", cliPrefixes: [], slashPrefixes: ["cmux"] }` —
  `cliPrefixes` empties because item 3 deletes the bin) plus its test,
  `capabilities/handoffs/src/pi/command-constants.ts` (comment path only).
  Regenerate the lockfile.
- Word-boundary rule: replace the exact pair `@nseng-ai/ccc` → `@nseng-ai/cmux`
  (safe: no other `@nseng-ai/ccc*` name exists). Never blanket-substitute bare
  `ccc` — it appears in immutable history (`.ns/objectives/`, wayfinding sweep
  assets, retros, ADRs ≤ 0033) and inside words in historical `nscc` references.
  Live-doc `ccc` references are handled item by item below.
- Doc ride-alongs: `CONTEXT-MAP.md` context-file inventory path (line 12) and
  package rows (lines 23–24, 60, 66, 71, 73–74 as of 2026-07-11); root
  `CONTEXT.md` "highest-fan-out consumer (13)" figure re-verified after item 1's
  dependency trim.
- Verify: `just` green; `grep -r "@nseng-ai/ccc"` over live source/docs returns only
  immutable-history hits.

### 3. Delete the `ccc` bin; re-home the command as a kernel extension

- Delete `bin` from `package.json`, `src/ns/cli.ts`, `src/ns/cli-command-io.ts`,
  `test/scenario/ccc-cli.test.ts`. `src/ns/` reduces to the extension module.
- Add `exports["./ns-extension"]` (`src/ns/extension.ts`) exposing group `cmux` with
  hidden `exec` subgroup and command `workspace-summary` (handler:
  `applyCmuxWorkspaceSummaryCommand` from `src/core/workspace-summary.ts`), following
  the objectives pattern (`capabilities/objectives/src/ns/extension.ts`); register in
  the kernel's preinstalled descriptor catalog
  (`kernel/src/extensions/declared-descriptors.ts`).
- Surface: `ns cmux exec workspace-summary`. Rationale: a bin named `cmux` would
  shadow the external cmux CLI; kernel extension descriptors are the sanctioned
  pattern (`ts/AGENTS.md` CLI rules apply — scenario-test coverage for the new
  group).
- Callers to rewrite: `skills/ccc-sidebar/SKILL.md` (three `ccc exec` references) —
  renamed in item 5; `docs/pi/cmux-extension-pattern.md` (five `ccc exec`
  references, incl. the `pi.exec("ccc", ...)` example, as of 2026-07-11).
- Doc ride-alongs (stale-claim corrections, not just renames):
  `docs/pi/README.md:101` (claims a `ccc exec autobranch` compatibility flow and
  `src/autobranch/` files — neither exists) and `docs/pi/README.md:205` (claims
  `@nseng-ai/ccc/worktree-status` — no such subpath; worktree-status is
  `hosts/pi`-owned).
- Verify: `just` green including new CLI scenario tests; `ns cmux exec
  workspace-summary --help` resolves.

### 4. Pi surfaces: `/ns:ccc:*` → `/ns:cmux:*`

- Extension id `ccc` → `cmux` in `src/core/command-surfaces.ts` command-name
  constants (`CCC_*_COMMAND_NAME` → `CMUX_*_COMMAND_NAME`) and `src/pi/extension.ts`
  registration; rename `.pi/extensions/ccc.ts` → `.pi/extensions/cmux.ts`.
- Handoffs re-mint: `capabilities/handoffs/src/pi/command-constants.ts`
  `CCC_EXTENSION_ID = "ccc"` → `CMUX_EXTENSION_ID = "cmux"`, producing
  `ns:cmux:handoff-tab`; ownership comment updated; the registry uniqueness test
  keeps guarding the pair.
- Surfaces after rename (as of 2026-07-11): `ns:cmux:workspace:dispatch-prompt`,
  `:workspace:dispatch-from-trunk`, `:workspace:dispatch-plan`,
  `:surface:dispatch-plan`, `:workspace:open-branch`, `:sidebar:session-summary`,
  `:sidebar:branch-state-summary`, `:sidebar:objective-summary`,
  `:claude-plan-tab`, `:handoff-tab`.
- Word-boundary rule: replace the exact pair `ns:ccc:` → `ns:cmux:`; safe — no other
  `ns:ccc`-prefixed namespace exists.
- Doc ride-alongs: `docs/pi/cmux-extension-pattern.md` and `docs/pi/README.md`
  command-name mentions.
- Verify: `just` green; parity/extension tests pass; `grep -r "ns:ccc"` over live
  source returns nothing.

### 5. Skills and areg registry rows

- `git mv` skill directories: `skills/ccc-sidebar` → `skills/ns-cmux-sidebar`,
  `skills/ccc-stack-map` → `skills/ns-cmux-stack-map`, `skills/ccc-available-work`
  → `skills/ns-cmux-available-work`, `skills/ccc-branch-triage` →
  `skills/ns-cmux-branch-triage`; frontmatter `name:` and body command references
  follow (`ns-cmux-sidebar` picks up the item-3 CLI rename). Read
  `docs/conventions/skill-conventions.md` before executing this item.
- areg rows (`tools/areg/src/command-backed-skill-registry.ts`, as of 2026-07-11):
  `ccc-available-work`/`ns:ccc:available-work`,
  `ccc-branch-triage`/`ns:ccc:branch-triage`, `ccc-stack-map`/`ns:cmux:stack-map`
  → `ns-cmux-*` skill names and `ns:cmux:*` surfaces; the `ccc-sidebar`
  registration imported from the capability's `pi` subpackage
  (`cccCommandBackedSkillRegistrations`) renames with it.
- Cross-references to sweep (as of 2026-07-11; re-enumerate):
  `skills/ns-flow-autobranch/references/autobranch-family-boundaries.md:8` claims a
  hidden `ccc exec autobranch` — stale claim, correct to `ns flow autobranch`
  reality; `skills/architecture-topology-report/scripts/example-spec.mjs:50` names
  package `ccc`.
- Verify: `areg skill find ns-cmux-sidebar` resolves; registry uniqueness test
  green; no live `skills/ccc-*` directory remains.

### 6. Glossary disposition

- Rewrite `capabilities/cmux/CONTEXT.md` from scratch: the cmux capability (drives
  cmux workspaces: dispatch, sidebar, workspace presentation), the dispatch family
  (Prompt dispatch, Trunk dispatch, Plan dispatch, Dispatch destination), sidebar
  summaries, workspace summary, claude-plan-tab, timestamped prompt file,
  branch-slug generation, and one boundary line (only the `pi` subpackage imports
  `@nseng-ai/pi`). Retired terms (recorded nowhere except history): CCC, Cmux
  Command and Control, CCC boundary, CCC orchestration layer, CCC Pi subpackage,
  CCC command surface, Stable non-CCC orchestration surface, Objective stack
  implementation orchestration, Flow land consumption, Lower capability,
  Orchestration candidate.
- `hosts/pi/CONTEXT.md`: correct the Worktree status adapter entry's "owned by
  CCC's worktree-status observability model" claim (ownership is `hosts/pi`);
  absorb Worktree status observability and Graphite metadata status vocabulary;
  rewrite the "CCC orchestration layer" and "CCC Pi subpackage" entries to the cmux
  names.
- Root `CONTEXT.md`: rewrite the CCC entry (line 266 as of 2026-07-11) as the
  cmux-capability entry; add "CCC" and "Cmux Command and Control" to its Avoid
  list.
- `capabilities/cmux/AGENTS.md`: replace the `NsCommandIo` progress-pattern essay
  (its reference examples left in item 1) with a pointer to
  `docs/pi/extension-command-checklist.md`; fix the stale `src/land-stack*` paths
  by deletion.
- Method contract: `domain-modeling`'s `CONTEXT-FORMAT.md`/`ADR-FORMAT.md` governs;
  `CONTEXT.md` stays a pure glossary.
- Verify: `dprint check` green; every inventory/relationship claim in the rewritten
  files cites live source.

### 7. Ripple renames

- Branch Memory namespace: `DISPATCH_PROMPT_NAMESPACE = "ccc-dispatch"` →
  `"cmux-dispatch"` (`src/core/dispatch-prompt.ts:40` as of 2026-07-11) and the
  `ccc-dispatch-prompt-` tmpdir prefix (line 355). Staged dispatch prompts are
  transient (consumed at pickup): **no migration**; any prompt staged pre-rename on
  an un-picked-up branch is orphaned — acceptable, note in PR description.
- Env var: `NS_CCC_SIDEBAR_MODEL` → `NS_CMUX_SIDEBAR_MODEL`
  (`src/core/sidebar.ts` as of 2026-07-11; sweep for doc/skill mentions). Breaking
  config rename, no alias; call out in PR description.
- Verify: grep for `ccc-dispatch` and `NS_CCC_` over live source returns nothing.

### 8. Kit substrate comment deletion

- Delete the stale two-line "Neutral cmux substrate … can move to a dedicated cmux
  package" comment in `capability-kit/src/cmux/gateway.ts` (lines 5–6 as of
  2026-07-11). `capability-kit/cmux` stays intact (ADR 0034 §5); this also
  resolves the `ideas.md` "cmux move-out promise" item as *delete*.
- Verify: comment gone; no other file changes in `capability-kit`.

## Operator-hands items

None. Every item is ordinary tracked-file editing; no untracked deletions or
permission-boundary work.

## Parked and out-of-scope

- **Dispatch CLI parity** (CLI + skill + parity metadata for the dispatch family):
  released with the `cross-harness-parity` closure to the future e2e-docs effort
  (ADR 0034 §8). Not this spec.
- **`BrmemExecGateway` and kit `kit/` contents**: belong to the "Reexamine
  foundation domain residue and the capability-kit junk drawer" grilling row.
- **`@nseng-ai/kernel` name**: parked in the Objective roadmap (revisit trigger:
  `extension-descriptor-contract` closes).
- **Historical records**: `.ns/objectives/**` updates, `docs/wayfinding/**` sweep
  assets, `docs/retros/**`, ADRs ≤ 0033 keep CCC/ccc wording as immutable history.
- **`skills/code-smush` / stack-smush surfaces**: `ns slot gt exec
  stack-map-branches` is slot-owned, not part of this rename (confirmed during the
  nscc disposition).
