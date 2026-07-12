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
  `test/land-test-helpers.ts`, `test/trunk-pull.test.ts`, `test/autoslot.test.ts`,
  `test/autoslot-presentation.test.ts` (sweep-corrected 2026-07-11: the trunk-pull
  test reaches its module by relative path, so it was missing from the original
  list; re-enumerate at execution).
- Scope facts (sweep-verified 2026-07-11): the only importer of any of these
  subpaths is `test/land-command.test.ts:17` (`@nseng-ai/ccc/land`); the
  `./trunk-pull` and `./autoslot` subpaths have zero importers anywhere — the
  remaining tests reach the modules by relative path. The real implementations
  live in `@nseng-ai/flow` (`capabilities/flow/src/autoslot/`, `src/land/`).
- Drop the `@nseng-ai/flow` dependency: the only code importers are the three
  facade modules deleted here (`src/ns/land.ts`, `src/ns/trunk-pull.ts`,
  `src/ns/autoslot.ts`; `autoslot-presentation.ts` imports only
  `@nseng-ai/foundation/cli-theme`). Re-verify with a package-wide grep for
  `@nseng-ai/flow` before removal (non-code stragglers: the `package.json:33`
  dep line, `CONTEXT.md:48` prose, a comment in `test/land-command.test.ts:40`).
- Doc ride-alongs: none (glossary rewrite is item 6 — note the package
  `AGENTS.md:18-19` reference examples and `CONTEXT.md:47-49` "Flow land
  consumption" entry describe modules this item deletes; item 6 rewrites both).
- Verify: `just` green; no `land|trunk-pull|autoslot` references remain under the
  package.

### 2. Rename package, directory, and internal structure

- `git mv ts/packages/capabilities/ccc ts/packages/capabilities/cmux`; package name
  `@nseng-ai/cmux`; `git mv src/cmux src/core`; `ns.subpackages`
  `["api", "cmux", "ns", "pi"]` → `["api", "core", "ns", "pi"]`; verify
  exports-map spelling against `docs/conventions/subpackage-conventions.md`
  (current exports keys as of 2026-07-11: `.`, `./api`, `./autoslot`, `./cli`,
  `./land`, `./trunk-pull`, `./pi`, `./pi/extension` — item 1 deletes three,
  item 3 deletes `./cli` and adds `./ns-extension`).
- `CCC_PACKAGE_IDENTITY` → `CMUX_PACKAGE_IDENTITY` in `src/api/index.ts`:
  `packageName: "@nseng-ai/cmux"`, `vocabularyName: "cmux"`, no expanded name,
  `ownedConcerns` trimmed to `["cmux-workspace-orchestration"]` (drop
  `graphite-stack-orchestration`, `worktree-flow-coordination`);
  `test/package-identity.test.ts` follows.
- External importers of `@nseng-ai/ccc` to rewrite (sweep-corrected 2026-07-11;
  re-enumerate): `tools/areg` (`package.json`,
  `src/command-backed-skill-registry.ts`,
  `test/unit/command-backed-skill-registry.test.ts`),
  `infra/foundation/test/cli-theme/package-boundary.test.ts`,
  `internal/typescript-style-guard/src/config.ts:82` (current row is
  `{ packageName: "@nseng-ai/ccc", cliPrefixes: ["ccc"], slashPrefixes: ["ccc"] }`;
  becomes `{ packageName: "@nseng-ai/cmux", cliPrefixes: [], slashPrefixes:
  ["cmux"] }` — `cliPrefixes` empties because item 3 deletes the bin) plus its
  test `test/typescript-style-guard/typescript-style-guard.test.ts` (~18 fixture
  lines mention `@nseng-ai/ccc`),
  `capabilities/handoffs/src/pi/command-constants.ts:17` (comment path only),
  `.pi/extensions/ccc.ts:3` (imports `@nseng-ai/ccc/pi/extension` — the import
  specifier must be rewritten in this item even though the file itself renames in
  item 4), the root workspace catalog dep `ts/package.json:37`, and doc mentions
  `docs/pi/extension-command-checklist.md:81` + `docs/pi/README.md:205` (the
  latter is also an item-3 stale-claim fix). Regenerate the lockfile
  (`ts/pnpm-lock.yaml` currently references the name at lines 99 and 690).
- Word-boundary rule: replace the exact pair `@nseng-ai/ccc` → `@nseng-ai/cmux`
  (safe: no other `@nseng-ai/ccc*` name exists). Never blanket-substitute bare
  `ccc` — it appears in immutable history (`.ns/objectives/`, wayfinding sweep
  assets, retros, ADRs ≤ 0033) and inside words in historical `nscc` references.
  Live-doc `ccc` references are handled item by item below.
- Doc ride-alongs: `CONTEXT-MAP.md` context-file inventory path (line 12) and
  package rows (lines 23–24, 60, 66, 71, 73–74 as of 2026-07-11).
  (Sweep-corrected 2026-07-11: the previously claimed root `CONTEXT.md`
  "highest-fan-out consumer (13)" figure does not exist — the entry at
  `CONTEXT.md:267` says "highest-fan-out consumer" with no count; its rewrite is
  item 6.)
- Verify: `just` green; `grep -r "@nseng-ai/ccc"` over live source/docs returns only
  immutable-history hits.

### 3. Delete the `ccc` bin; re-home the command as a kernel extension

- Delete `bin` from `package.json`, `src/ns/cli.ts`, `src/ns/cli-command-io.ts`,
  `test/scenario/ccc-cli.test.ts`. `src/ns/` reduces to the extension module.
  (Sweep-verified 2026-07-11: the bin registers exactly one hidden command,
  `exec cmux-workspace-summary`; the re-homed command is named
  `workspace-summary` since the group already says cmux.)
- Add `exports["./ns-extension"]` (`src/ns/extension.ts`) exposing group `cmux` with
  hidden `exec` subgroup and command `workspace-summary` (handler:
  `applyCmuxWorkspaceSummaryCommand` from `src/core/workspace-summary.ts`,
  pre-rename `src/cmux/workspace-summary.ts:73`), following the objectives
  pattern (`capabilities/objectives/src/ns/extension.ts` — `defineExtension` +
  `hiddenExecGroup`, plus a `test/unit/extension-descriptor.test.ts` equivalent).
  Sweep-corrected 2026-07-11: **no registration edit anywhere** —
  `kernel/src/extensions/declared-descriptors.ts` is a generic loader for
  ns.toml-declared specs, not a catalog, and objectives is not listed in it.
  In-repo the kernel's source-dev discovery
  (`kernel/src/extensions/registry.ts` `loadSourceDevPreinstalledCandidates`)
  auto-registers any workspace package exposing a descriptor-bearing
  `./ns-extension` export; installed consumers would declare it via `ns.toml`
  `extensions = [...]`.
- Surface: `ns cmux exec workspace-summary`. Rationale: a bin named `cmux` would
  shadow the external cmux CLI; kernel extension descriptors are the sanctioned
  pattern (`ts/AGENTS.md` CLI rules apply — scenario-test coverage for the new
  group).
- Callers to rewrite (sweep-corrected 2026-07-11): the **runtime caller**
  `src/cmux/objective-sidebar.ts:178-195` invokes the bin
  (`command: "ccc"`, `args: ["exec", "cmux-workspace-summary", ...]`) — rewire to
  the `ns cmux exec workspace-summary` surface, with its tests
  (`test/cmux-objective-sidebar.test.ts:63,155,207,260,382`);
  `skills/ccc-sidebar/SKILL.md` (four `ccc exec` references — three body lines
  40/44/49 plus the frontmatter description line 4) — renamed in item 5;
  `docs/pi/cmux-extension-pattern.md` (five `ccc exec` references at lines
  24/30/48/84/122 plus two `pi.exec("ccc", ...)` examples at lines 115/168).
- Doc ride-alongs (stale-claim corrections, not just renames):
  `docs/pi/README.md:101` (claims a `ccc exec autobranch` compatibility flow and
  `src/autobranch/` files — neither exists) and `docs/pi/README.md:205` (claims
  `@nseng-ai/ccc/worktree-status` — no such subpath; worktree-status is
  `hosts/pi`-owned).
- Verify: `just` green including new CLI scenario tests; `ns cmux exec
  workspace-summary --help` resolves.

### 4. Pi surfaces: `/ns:ccc:*` → `/ns:cmux:*`

- Namespace `ccc` → `cmux` (sweep-corrected 2026-07-11: there is no
  extension-level id field — the namespace is the first argument of the
  `nsCommandSurface("ccc", ...)` calls): update the nine `CCC_*_COMMAND_NAME`
  constants → `CMUX_*_COMMAND_NAME` (plus the `CCC_COMMAND_NAMES` aggregate) in
  `src/core/command-surfaces.ts`, rename `registerCccPiExtension` in
  `src/pi/extension.ts`, and rename `.pi/extensions/ccc.ts` →
  `.pi/extensions/cmux.ts`.
- Handoffs re-mint: `capabilities/handoffs/src/pi/command-constants.ts`
  `CCC_EXTENSION_ID = "ccc"` → `CMUX_EXTENSION_ID = "cmux"`, producing
  `ns:cmux:handoff-tab`; ownership comment updated; the registry uniqueness test
  keeps guarding the pair.
- Surfaces after rename (sweep-corrected 2026-07-11 — thirteen live surfaces,
  not ten): `ns:cmux:workspace:dispatch-prompt`,
  `:workspace:dispatch-from-trunk`, `:workspace:dispatch-plan`,
  `:surface:dispatch-plan`, `:workspace:open-branch`, `:sidebar:session-summary`,
  `:sidebar:branch-state-summary`, `:sidebar:objective-summary`,
  `:claude-plan-tab`, `:handoff-tab`, plus the three areg generic backing-skill
  aliases `:available-work`, `:branch-triage`, `:stack-map` (item 5 renames
  those rows).
- Word-boundary rule: replace the exact pair `ns:ccc:` → `ns:cmux:`; safe — every
  live `ns:ccc`-prefixed token is a surface in this one namespace.
- Test/file blast radius beyond the package (sweep-added 2026-07-11;
  re-enumerate): `foundation/test/ns-command-surface.test.ts`,
  `internal/pi-tools/test/backing-skill-commands/backing-skill-commands.test.ts`,
  `capabilities/handoffs/test/pi/` (`handoff-tab.test.ts`, `handoff.test.ts`,
  `handoff-test-fakes.ts`), `ccc/src/api/handlers.ts`, and ccc tests
  (`test/ccc.test.ts`, `test/claude-plan-tab.test.ts`,
  `test/cmux-objective-sidebar.test.ts`).
- Doc ride-alongs: `docs/pi/cmux-extension-pattern.md` and `docs/pi/README.md`
  command-name mentions (`hosts/pi/CONTEXT.md` and the package `CONTEXT.md`
  rewrites are item 6).
- Verify: `just` green; parity/extension tests pass; `grep -r "ns:ccc"` over live
  source returns nothing.

### 5. Skills and areg registry rows

- `git mv` skill directories: `skills/ccc-sidebar` → `skills/ns-cmux-sidebar`,
  `skills/ccc-stack-map` → `skills/ns-cmux-stack-map`, `skills/ccc-available-work`
  → `skills/ns-cmux-available-work`, `skills/ccc-branch-triage` →
  `skills/ns-cmux-branch-triage`; frontmatter `name:` and body command references
  follow (`ns-cmux-sidebar` picks up the item-3 CLI rename). Re-point **both
  symlink layers** (sweep-added 2026-07-11): `.agents/skills/ccc-*` →
  `../../skills/ccc-*` and `.claude/skills/ccc-*` → `../../.agents/skills/ccc-*`
  must be recreated under the new names. Read
  `docs/conventions/skill-conventions.md` before executing this item.
- Intra-skill references (sweep-added 2026-07-11):
  `skills/ccc-available-work/SKILL.md:15` relative cross-ref into
  `../ccc-stack-map/references/` (breaks on dir rename);
  `skills/ccc-stack-map/references/display-and-code-sketch.md:3,7` name
  references (lines 16/35/44 are illustrative branch strings — leave or rewrite
  deliberately, not by substitution);
  `skills/ccc-stack-map/references/cmux-read-only-posture.md:3` prose;
  `skills/ccc-branch-triage/SKILL.md:194` and
  `skills/ccc-available-work/SKILL.md:182,184` future-`exec`-helper prose.
- areg rows (`tools/areg/src/command-backed-skill-registry.ts`, sweep-corrected
  2026-07-11): `ccc-available-work`/`ns:ccc:available-work` (line 44),
  `ccc-branch-triage`/`ns:ccc:branch-triage` (line 49),
  `ccc-stack-map`/`ns:ccc:stack-map` (line 53 — the earlier claim of
  `ns:cmux:stack-map` was wrong; all three rows live in `ns:ccc:`)
  → `ns-cmux-*` skill names and `ns:cmux:*` surfaces; the `ccc-sidebar`
  registration imported from the capability's `pi` subpackage
  (`cccCommandBackedSkillRegistrations`, defined
  `src/pi/command-backed-skills.ts:5`, exported via `src/pi/index.ts:2`) renames
  with it — its surface field is the symbolic constant, so only `skillName`
  changes there. The registry test also hard-codes `"ccc-sidebar"` at
  `test/unit/command-backed-skill-registry.test.ts:79` and asserts no surfaces
  under `LEGACY_CCC_PREFIX = "ccc:"` (lines 29, 125-130) — decide at execution
  whether that legacy-prefix guard is kept, extended to `cmux:`, or retired.
- Cross-references to sweep (as of 2026-07-11; re-enumerate):
  `skills/ns-flow-autobranch/references/autobranch-family-boundaries.md:8` claims a
  hidden `ccc exec autobranch` — stale claim (sweep-confirmed: the bin registers
  no such command), correct to `ns flow autobranch` reality;
  `skills/architecture-topology-report/scripts/example-spec.mjs:50` names
  package `ccc` (the file references the ccc package on ~17 lines as a worked
  example — rewrite the package name, not the skill namespace);
  `docs/conventions/skill-conventions.md:90` cites `ccc-*` as a live
  domain-namespace example — replace with the renamed family.
- Verify: `areg skill find ns-cmux-sidebar` resolves; registry uniqueness test
  green; no live `skills/ccc-*` directory or dangling `.agents/.claude` symlink
  remains.

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
  Orchestration candidate. Sweep-added 2026-07-11 — the current glossary carries
  three more entries needing explicit disposition: `Project-local adapter`
  (line 31; keep/retire in the rewrite), and `Worktree status observability` +
  `Graphite metadata status` (lines 55, 59; these re-home to `hosts/pi` below —
  they do not yet exist there).
- `hosts/pi/CONTEXT.md`: correct the Worktree status adapter entry's "owned by
  CCC's worktree-status observability model" claim at line 84 (ownership is
  `hosts/pi`); absorb Worktree status observability and Graphite metadata status
  vocabulary (new entries — sweep-confirmed absent today); rewrite the "CCC
  orchestration layer" (line 35) and "CCC Pi subpackage" (line 39) entries to the
  cmux names; also sweep the intro (line 3), the "Engineered Pi implementation
  domain" entry (line 20), and the Avoid line 85.
- Root `CONTEXT.md`: rewrite the CCC entry (line 266 as of 2026-07-11; an
  `*Avoid*:` list already exists at line 268) as the cmux-capability entry; add
  "CCC" and "Cmux Command and Control" to its Avoid list. Sweep-added: CCC is
  also named at lines 251 (First-party extension entry) and 259 (Capability API
  entry, "chiefly **CCC**") — rewrite both mentions.
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
  Sweep-added blast radius (re-enumerate): `ccc/test/ccc.test.ts:65` and eleven
  fixture lines in `capability-kit/test/unit/brmem-cli.test.ts`
  (393-579, `refs/brmem/ns/ccc-dispatch/...` expected-ref strings) — rename so
  the verify grep comes up empty.
- Env var: `NS_CCC_SIDEBAR_MODEL` → `NS_CMUX_SIDEBAR_MODEL`
  (`src/core/sidebar.ts:33` pre-rename `src/cmux/sidebar.ts:33`,
  sweep-verified 2026-07-11; the only doc mention is
  `docs/pi/cmux-extension-pattern.md:90`). Breaking config rename, no alias; call
  out in PR description.
- Verify: grep for `ccc-dispatch` and `NS_CCC_` over live source returns nothing.

### 8. Kit substrate comment deletion

- Delete the stale two-line "Neutral cmux substrate … can move to a dedicated cmux
  package" comment in `capability-kit/src/cmux/gateway.ts` (lines 5–6 as of
  2026-07-11, sweep-verified). `capability-kit/cmux` stays intact (ADR 0034 §5;
  sweep-confirmed cycle rationale: `hosts/pi/src/runtime/types.ts:20,22` imports
  `@nseng-ai/capability-kit/cmux/types`); this also resolves the
  `docs/wayfinding/ontology-reshape/ideas.md:139-140` "cmux move-out promise"
  item as *delete* — mark it resolved there.
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
