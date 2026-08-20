# Provider-Explicit Flow Autobranch Families (`gt` and `gs`)

## Goal and outcome

Deliver a three-PR Graphite stack that makes Flow's stack provider explicit and adds official `github/gh-stack` v0.1.0 variants of the autobranch family.

The final user-facing CLI is:

```text
ns flow gt autobranch
ns flow gt branch-latest-commit
ns flow gt autoslot
ns flow gt submit
ns flow gt land
ns flow gt squash-stack

ns flow gs autobranch
ns flow gs branch-latest-commit
ns flow gs autoslot
```

Provider-neutral Flow commands remain directly under `ns flow` (for example `changes`, `cp`, `push`, `pull-trunk`, and `generate-pr-inventory`). The old flat Graphite paths are removed without aliases.

The final Pi mirrors are:

```text
/ns:flow:gt:autobranch
/ns:flow:gt:branch-latest-commit
/ns:flow:gt:autoslot
/ns:flow:gt:submit
/ns:flow:gt:land
/ns:flow:gt:squash-stack

/ns:flow:gs:autobranch
/ns:flow:gs:branch-latest-commit
/ns:flow:gs:autoslot
```

The existing six Graphite Pi names stay stable; their backing CLI argv changes from flat `ns flow <command>` to `ns flow gt <command>`. The three `gs` mirrors are new.

The final provider-explicit Skill-Backed Command identities are:

```text
ns-flow-gt-autobranch
ns-flow-gt-branch-latest-commit
ns-flow-gs-autobranch
ns-flow-gs-branch-latest-commit
```

Their approved canonical destinations are:

```text
skills/incubating/flow/ns-flow-gt-autobranch/
skills/incubating/flow/ns-flow-gt-branch-latest-commit/
skills/incubating/flow/ns-flow-gs-autobranch/
skills/incubating/flow/ns-flow-gs-branch-latest-commit/
```

`autoslot` remains a direct CLI/Pi workflow without a new backing skill. Existing `ns-flow-submit` is updated to invoke `ns flow gt submit` but is not renamed in this scope; there is no competing `gs submit` workflow yet.

## Settled requirements

- `gt` is the Graphite provider subgroup.
- `gs` is the command-surface abbreviation for the official `github/gh-stack` provider. Help and documentation must define it; do not assume the abbreviation is self-explanatory.
- Move all six commands already classified as Graphite-dependent under the CLI `gt` subgroup, not only the autobranch family.
- Remove the old flat Graphite CLI commands in a direct pre-release cutover. Do not add public or hidden compatibility aliases.
- Expose symmetric three-command autobranch families for `gt` and `gs`: `autobranch`, `branch-latest-commit`, and `autoslot`.
- Keep checkpoint message generation, staging semantics, and checkpoint commits owned by Flow. Invoke `gh stack add <branch>` without `-A`, `-u`, or `-m`.
- If a `gs` command starts on an untracked non-trunk branch, automatically initialize local gh-stack state by adopting the current branch with `gh stack init <current-branch>`, using gh-stack's detected default trunk, then continue with `gh stack add`.
- If an untracked invocation starts on detected Git trunk, refuse without creating a degenerate `trunk ← trunk` stack. Tell the caller to create or check out a non-trunk source branch first.
- Never parse or edit `.git/gh-stack` directly. Treat it as provider-private state.
- Verify provider claims through observed Git facts and parsed `gh stack view --json` topology.
- Do not broaden this stack into the unfinished repository-wide ADR 0049 provider-neutral submit/land migration. Implement a narrow, Flow-owned autobranch provider seam with two real adapters.

## Context and discovered facts

### Repository architecture

- Flow owns lifecycle workflow policy and the `ns flow ...` Command Face: `ts/packages/incubating/extensions/flow/CONTEXT.md`.
- The separate `@nseng-ai/pi-ns-flow` package owns Pi registration, interaction, and parity: `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/CONTEXT.md`.
- Slots owns managed worktree placement. `autoslot` composes `@nseng-ai/slots/api`; provider work must not leak into Slots: `ts/packages/incubating/extensions/slots/CONTEXT.md`.
- ADR 0049 (`docs/adr/0049-opt-in-provider-neutral-stacking.md`) is immutable. It requires explicit provider selection, provider-private-state isolation, and observed Git/GitHub postconditions. It also records the broader capability split as follow-up work. Do not rewrite the ADR.
- `docs/conventions/stack-provider-capability-matrix.md` currently records a gh-stack v0.0.8 baseline and must be rebaselined to the consulted v0.1.0 facts.
- The named neutral `BranchCreationProvider`/stack capability interfaces described by ADR 0049 are not implemented. Existing Flow autobranch directly invokes `gt`.

### Existing Flow behavior

- `src/autobranch/checkpoint-flow.ts` loads one pending-worktree snapshot and dispatches dirty worktrees to dirty autobranch, clean worktrees to latest-commit extraction, or refuses according to command mode.
- `src/autobranch/dirty-transaction.ts` currently performs stash → `gt create` → stash restore → Flow checkpoint commit.
- `src/autobranch/latest-commit-preparation.ts` currently calls `gt children --no-interactive` to ensure the source has no children.
- `src/autobranch/latest-commit-transaction.ts` creates a recovery branch, resets the source to its parent, runs `gt create`, resets the child to the original commit, verifies HEAD, and cleans up.
- `src/autoslot/autoslot.ts` calls the any-state autobranch checkpoint flow and then uses a `SlotClient` to move the resulting clean branch into a managed Slot.
- Existing transaction failures and recovery prose use Graphite-specific discriminants and text. Provider generalization must keep failures typed and recovery facts honest.

### Nested command mechanics

Clinkr filesystem discovery already supports nested groups; no Clinkr framework change is needed.

Precedents:

- `ts/packages/incubating/extensions/slots/src/ns/cli/slot/gt/group.ts`
- `ts/packages/incubating/extensions/slots/src/ns/cli/slot/gt/exec/group.ts`
- `ts/packages/incubating/extensions/slots/test/unit/descriptor.test.ts`

Flow discovery starts at `ts/packages/incubating/extensions/flow/src/ns/cli/`. Add `flow/gt/group.ts` and `flow/gs/group.ts`, then place command directories beneath them.

`FLOW_COMMAND_SPECS` in `src/api/command-surfaces.ts` currently assumes `argvPrefix: readonly ["flow", string]` and keys commands by a name that will become ambiguous when both providers have `autobranch`, `branch-latest-commit`, and `autoslot`. Replace that assumption with a stable command identity and arbitrary-length argv prefix. Pi's fresh CLI bridge already forwards arbitrary-length prefixes.

### Official gh-stack v0.1.0 facts

The official extension is installed locally as `github/gh-stack` v0.1.0 and was consulted at `https://github.com/github/gh-stack`, especially `README.md`, `cmd/add.go`, `cmd/init.go`, and `internal/stack/*`.

- `gh stack init [branches...]` initializes local stack tracking. Existing branches are adopted; missing branches are created. The default trunk is detected unless `--base` is supplied. It also enables Git rerere.
- `gh stack add <branch>` adds only at the top of the current stack (the stack trunk is also accepted by v0.1.0). It creates a missing branch or adopts an existing unstacked branch, checks it out, appends topology, and saves state.
- For an adopted branch, gh-stack records the merge base with the current branch.
- `gh stack add` supports commit flags, but those are deliberately outside this plan because Flow owns checkpoint commits.
- `gh stack view --json` provides machine-readable `trunk`, `currentBranch`, and ordered branch records (`name`, `base`, `isCurrent`, merge/queue/rebase facts).
- Local provider metadata lives in `.git/gh-stack`; interrupted rebase state uses `.git/gh-stack-rebase-state`.
- `gh stack modify` is interactive. `gh stack unstack --local` removes the whole local stack, not one branch. Therefore Flow cannot safely repair one metadata entry after a partial failure and must not invent a metadata rollback.

## Architecture and behavior design

### Flow-private provider seam

Introduce a small Flow-private autobranch provider interface with two adapters, one for Graphite and one for gh-stack. Exact internal symbol names are implementation-level, but the interface must express semantic operations/results rather than exposing subprocess text or provider metadata objects.

Required capabilities:

1. Inspect the current provider stack sufficiently to determine:
   - tracked versus untracked;
   - provider trunk;
   - ordered branches/current branch;
   - whether the current source is eligible to receive a child (topmost, or a provider-supported trunk case);
   - direct/upstack children needed by latest-commit refusal policy.
2. Prepare the source for child creation:
   - Graphite: preserve existing tracked-branch behavior.
   - gh-stack: when untracked, detect Git trunk; refuse on trunk; otherwise run `gh stack init <current-branch>` and re-inspect.
3. Add or adopt a named child branch:
   - Graphite: `gt create <branch> --no-interactive --no-ai`.
   - gh-stack: `gh stack add <branch>`.
4. Return typed semantic outcomes, including whether automatic gh-stack initialization occurred and whether post-command state is verified, absent, or ambiguous.

Keep the interface internal to Flow. Do not export it through `@nseng-ai/flow/api` unless a real downstream consumer appears.

Validate `gh stack view --json` as an external boundary with Zod before translating it into private neutral facts. Do not let raw JSON, stdout text, or `.git/gh-stack` shapes enter workflow logic.

### Dirty-worktree transaction

Preserve the existing Flow-owned transaction for both providers:

1. Resolve the repository/worktree snapshot and generated/requested branch slug.
2. Generate the Flow checkpoint message.
3. Stash tracked and untracked pending changes and locate the exact stash ref.
4. Prepare the selected provider:
   - `gt`: existing tracked Graphite expectations.
   - `gs`: inspect; if untracked non-trunk, run `gh stack init <source>` and verify; if untracked trunk, return a typed refusal.
5. Add the child using the provider adapter (`gt create` or plain `gh stack add`).
6. Verify with Git facts that the requested branch exists, is current, and starts from the expected source HEAD; verify provider topology where available.
7. Restore the exact stash.
8. Commit through the existing Flow checkpoint helper.
9. Run the existing cleanliness/completion checks and return provider-aware warnings/recovery facts.

If automatic gh-stack initialization succeeds but later work fails, do not attempt to remove initialization metadata. Report that the source is now locally tracked and provide concrete recovery state. A failed child add must be followed by Git and `gh stack view --json` inspection before deciding whether restoring/deleting anything is safe.

### Latest-commit transaction

Retain all existing upstream, root-commit, merge-commit, and worktree-clean eligibility checks. Replace `gt children` with provider topology inspection.

For Graphite, preserve current behavior behind the new adapter.

For gh-stack:

1. Inspect or auto-initialize the untracked non-trunk source before destructive Git mutation.
2. Require the source to be the top stack branch and refuse when it has children/upstack branches.
3. Capture original source branch, original HEAD, parent SHA, commit message/diff, and checkpoint/slug facts.
4. Create the recovery branch as today.
5. Create the desired child branch at the original commit SHA before resetting the source. This gives `gh stack add <child>` an existing branch to adopt.
6. Reverify source branch and HEAD, then reset the source to the parent SHA.
7. Run `gh stack add <child>`; gh-stack adopts and checks out the child, recording its merge base against the reset source.
8. Verify with Git that source points to the parent, child/HEAD point to the original SHA, and the worktree is on the child. Verify with `gh stack view --json` that the source → child relationship is present and current.
9. Delete the recovery branch only after verification.

Rework recovery so it is provider-aware:

- Before gh-stack saves/adopts the child, ordinary Git restoration and branch deletion may remain safe.
- Once gh-stack topology may include the child, never delete only the Git branch as a purported full rollback; that can leave stale provider state.
- On ambiguous command failure or failed postcondition after observed adoption, preserve recoverable branches and return exact source/child/backup facts plus manual guidance. Do not edit `.git/gh-stack` and do not call whole-stack `gh stack unstack --local`.
- Provider initialization that already succeeded is an honest retained side effect, not a rollback failure.

### Autoslot composition

Parameterize `createFlowAutobranchCheckpointFlow`/`createAutoslotFlow` with explicit provider selection or an injected provider adapter. Both `gt autoslot` and `gs autoslot` reuse the same any-state dispatch and Slot checkout behavior. Slots receives only the resulting branch/current-worktree facts; it must not learn provider topology.

Preserve existing outcomes:

- autobranch refusal;
- autobranch failure;
- branch created but Slot skipped because the worktree is not clean;
- branch created but Slot placement failed;
- moved successfully with Slot/worktree/navigation facts.

Where machine results or failure data identify the backend, use stable values `graphite` and `gh-stack`; reserve `gt` and `gs` for command namespace spelling.

## Three-PR implementation stack

### PR 1 — `flow-gt-command-group-cutover`

**Outcome:** make the existing Graphite provider explicit everywhere without changing Graphite workflow semantics.

**Why separate:** this is a broad but mechanical breaking command-surface migration. Keeping it independent lets reviewers verify route/parity/skill topology before reviewing gh-stack transaction logic.

**Depends on:** current trunk only.

#### Changes

1. Add `src/ns/cli/flow/gt/group.ts` with clear Graphite help metadata.
2. Move all six complete command directories under `src/ns/cli/flow/gt/`:
   - `autobranch/`
   - `branch-latest-commit/`
   - `autoslot/`
   - `submit/`
   - `land/`
   - `squash-stack/`
3. Adjust moved relative imports; do not leave flat wrappers or aliases.
4. Redesign `src/api/command-surfaces.ts` so each spec has a stable unique identity, explicit provider classification where applicable, arbitrary-length argv prefix, display name, and explicit Pi surface. Avoid name-only lookups once provider command names overlap.
5. Route all six Graphite specs through `argvPrefix: ["flow", "gt", <command>]` while preserving their existing `/ns:flow:gt:*` surfaces.
6. Update Flow descriptor/API tests to assert nested routes and absence of the six old flat routes.
7. Update `@nseng-ai/pi-ns-flow` tests so the stable GT Pi commands invoke nested GT argv. Preserve submit-recovery behavior keyed by its existing Pi surface.
8. Rename the two existing autobranch-family skills using the approved topology:
   - `ns-flow-autobranch` → `ns-flow-gt-autobranch`
   - `ns-flow-branch-latest-commit` → `ns-flow-gt-branch-latest-commit`
9. Follow `docs/conventions/skill-conventions.md` and `skills/internal/skill-system/skill-management/SKILL.md`: use exact `git mv` destinations, replace only the affected `.agents/skills` and `.claude/skills` symlinks, update only affected lock keys/sources, and regenerate real hashes through supported `npx skills` behavior. Do not hand-invent hashes.
10. Update Skill-Backed Command registrations and downstream parity tests to the GT-explicit identities. Update `ns-flow-submit` to call `ns flow gt submit` without renaming it.
11. Update live Flow/host README, CONTEXT, Pi docs, recovery prompt, command help, and skill references needed to make PR 1 independently truthful. Historical Objective/reference records remain historical unless they are active machine-checked invariants.

#### Primary files/tests

- `ts/packages/incubating/extensions/flow/src/ns/cli/flow/**`
- `ts/packages/incubating/extensions/flow/src/api/command-surfaces.ts`
- `ts/packages/incubating/extensions/flow/test/unit/descriptor.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/api.test.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/extension.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/test/extension.test.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/test/flow-pi-parity.test.ts`
- `ts/packages/public/sdk/test/integration/flow-extension-cli.test.ts`
- `ts/packages/internal/hosts/pi/tools/pi-tools/test/skill-backed-commands/skill-backed-commands.test.ts`
- `skills/incubating/flow/ns-flow-{gt-autobranch,gt-branch-latest-commit}/**`
- `.agents/skills/*`, `.claude/skills/*`, `skills-lock.json`
- `ts/packages/incubating/extensions/flow/README.md`
- `ts/packages/incubating/extensions/flow/CONTEXT.md`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/{README.md,CONTEXT.md}`
- `docs/pi/README.md`
- `.ns/prompts/flow.submit.pre.recovery.md`

### PR 2 — `flow-gs-autobranch-provider`

**Outcome:** add the tested gh-stack v0.1.0 adapter plus `gs autobranch` and `gs branch-latest-commit`, while preserving GT behavior through the same narrow provider seam.

**Why separate:** this contains the highest-risk transaction and recovery changes. It should be reviewed without Slot composition or broad final documentation noise.

**Depends on:** PR 1 command identity/group foundation.

#### Changes

1. Add the Flow-private provider interface and semantic result/failure vocabulary.
2. Move direct `gt create` and `gt children` operations behind the Graphite adapter without behavior regressions.
3. Add the gh-stack v0.1.0 adapter:
   - execute `gh stack view --json`, `gh stack init <source>`, and `gh stack add <child>` through injected command execution;
   - validate view JSON with Zod;
   - translate provider output into semantic topology facts;
   - verify branch/HEAD postconditions through `AutobranchGitGateway`.
4. Extend the Git gateway only for semantic facts genuinely needed by both production and fake-driven tests (for example branch existence/ref SHA or trunk comparison). Keep cwd bound once in the adapter as existing Flow code requires.
5. Implement automatic initialization of untracked non-trunk sources and typed refusal for untracked trunk.
6. Generalize dirty transaction failures from Graphite-only names/prose to provider-aware discriminants and recovery data. Preserve exact stash restoration guarantees.
7. Generalize latest-commit preparation to provider topology and implement the gh-stack pre-created-child/adoption sequence.
8. Rework latest-commit recovery so no path deletes a Git child after gh-stack adoption without accounting for provider state. Preserve branches and return explicit recovery facts on ambiguity.
9. Add `src/ns/cli/flow/gs/group.ts`, `gs/autobranch`, and `gs/branch-latest-commit` command directories and metadata. Reuse shared command factories/handlers with explicit provider injection rather than copying workflow logic.
10. Add `/ns:flow:gs:autobranch` and `/ns:flow:gs:branch-latest-commit` Pi specs and parity.
11. Add the two approved GS skills and overlays:
    - `skills/incubating/flow/ns-flow-gs-autobranch/`
    - `skills/incubating/flow/ns-flow-gs-branch-latest-commit/`
    Follow `npx skills` ownership and lock/symlink invariants exactly.
12. Replace the Graphite-only family convention with provider-explicit shared guidance in `docs/conventions/autobranch-family-boundaries.md`; update all four skills to call only their selected provider commands and to explain initialization/refusal behavior.
13. Rebaseline `docs/conventions/stack-provider-capability-matrix.md` from the old v0.0.8 observation to official v0.1.0 facts and provenance. Do not modify ADR 0049.
14. Update Flow and Pi CONTEXT/README surfaces in the same PR so `gs` becomes canonical ground truth with implementation.

#### Required fake-driven scenarios

- GT dirty and latest-commit transcripts remain behaviorally unchanged except command path/provider injection.
- GS tracked top branch: dirty autobranch succeeds.
- GS untracked non-trunk: init adopts source, add creates child, Flow restores and commits.
- GS untracked trunk: refusal occurs before stash/provider mutation or branch creation.
- GS current branch in middle of stack: typed refusal/failure with top guidance.
- `gh stack view --json` command failure, malformed JSON, missing current branch, and inconsistent topology.
- `gh stack init` failure with stash safely restored.
- init succeeds but add fails: retained initialization is reported; stash restoration remains authoritative.
- add reports failure with no observed child/adoption versus ambiguous/observed partial mutation.
- dirty stash restore or checkpoint commit fails after branch creation: resulting branch/provider state is reported honestly.
- GS latest-commit success adopts the pre-created original-SHA child and preserves source at parent SHA.
- latest-commit refuses root, merge, ineligible upstream, non-top source, and child/upstack topology before destructive mutation.
- source reset, add/adoption, Git verification, topology verification, and recovery-branch cleanup failures each retain enough facts for recovery.
- No test reads/writes real `.git/gh-stack`; default tests use injected fakes. A narrowly scoped real-adapter integration test may use a temporary repository and installed `gh stack` only in the integration lane if needed to protect v0.1.0 compatibility.

#### Primary files/tests

- `ts/packages/incubating/extensions/flow/src/autobranch/shared.ts`
- `ts/packages/incubating/extensions/flow/src/autobranch/git-gateway.ts`
- `ts/packages/incubating/extensions/flow/src/autobranch/checkpoint-flow.ts`
- `ts/packages/incubating/extensions/flow/src/autobranch/dirty-worktree.ts`
- `ts/packages/incubating/extensions/flow/src/autobranch/dirty-transaction.ts`
- `ts/packages/incubating/extensions/flow/src/autobranch/latest-commit-preparation.ts`
- `ts/packages/incubating/extensions/flow/src/autobranch/latest-commit.ts`
- `ts/packages/incubating/extensions/flow/src/autobranch/latest-commit-transaction.ts`
- New provider adapter modules under `src/autobranch/`
- `ts/packages/incubating/extensions/flow/src/ns/commands/{autobranch,branch-latest-commit}.ts` or provider-aware factories replacing them
- `ts/packages/incubating/extensions/flow/src/ns/cli/flow/gs/**`
- `ts/packages/incubating/extensions/flow/test/autobranch/**`
- `ts/packages/incubating/extensions/flow/test/scenario/{autobranch-command,branch-latest-commit-command,flow-command-fakes}.test.ts` (adjust exact filenames to existing tree)
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/test/**`
- `skills/incubating/flow/ns-flow-gs-*/**`
- `docs/conventions/{autobranch-family-boundaries,stack-provider-capability-matrix}.md`

### PR 3 — `flow-gs-autoslot-and-surface-completion`

**Outcome:** complete the symmetric family with `gs autoslot`, finish host/docs/skill conformance, and prove both providers compose with Slots without provider leakage.

**Why separate:** autoslot adds an optional extension/package composition boundary and depends on the provider-aware any-state checkpoint flow from PR 2. Combining it with PR 2 would make transaction review and Slot composition/recovery review unnecessarily large.

**Depends on:** PR 2.

#### Changes

1. Refactor `createAutoslotFlow`/command construction to take an explicit selected provider or provider-bound checkpoint flow.
2. Keep one autoslot domain workflow; register thin `gt autoslot` and `gs autoslot` command edges rather than duplicating result mapping or Slot checkout logic.
3. Add `gs/autoslot` command metadata and `/ns:flow:gs:autoslot` Pi registration.
4. Ensure optional Slots registration behavior remains unchanged: when Slots is unavailable, autoslot surfaces follow the package's existing hidden/registration policy rather than adding a predictable runtime failure.
5. Verify both dirty and clean GS autoslot paths:
   - dirty uses stash/add/Flow commit, then Slot checkout;
   - clean uses latest-commit adoption, then Slot checkout.
6. Preserve branch-created-but-Slot-failed and branch-created-but-worktree-not-clean outcomes; never roll back a successfully created provider branch because Slot placement fails.
7. Complete surface inventory/parity tests for six GT Pi commands, three GS Pi commands, and the provider-neutral Flow commands.
8. Perform a final live-reference sweep for old flat CLI invocations and old skill identities. Classify remaining matches as live defects to fix or immutable/historical records to leave. Do not rewrite historical Objectives merely to erase old strings.
9. Finish README/CONTEXT/Pi documentation examples, command tables, installation prerequisites (`gh extension install github/gh-stack`), `gs` abbreviation definition, auto-init side effects (including gh-stack enabling rerere), and recovery guidance.
10. Run skill topology verification for all four provider-explicit skills: canonical sources, flat overlays, lock entries/hashes, invocation metadata, Skill-Backed Command registrations, and absence of unexplained live old identities.

#### Required scenarios

- GT autoslot retains all existing outcomes.
- GS dirty autoslot on tracked stack succeeds and places current child in a Slot.
- GS dirty autoslot auto-initializes an untracked non-trunk source before child creation.
- GS clean autoslot performs latest-commit adoption and places the child in a Slot.
- Untracked trunk refuses before Slot calls.
- Autobranch refusal/failure causes no Slot call.
- Non-clean completion skips Slot placement with the created branch reported.
- Slot placement failure preserves and reports the successfully created provider branch.
- Success returns slot name, worktree path, warnings, and navigation command exactly once.
- Pi `gs autoslot` invokes `ns flow gs autoslot`; Pi `gt autoslot` invokes `ns flow gt autoslot`.

#### Primary files/tests

- `ts/packages/incubating/extensions/flow/src/autoslot/autoslot.ts`
- `ts/packages/incubating/extensions/flow/src/autoslot/slot-checkout.ts`
- `ts/packages/incubating/extensions/flow/src/autoslot/presentation.ts`
- `ts/packages/incubating/extensions/flow/src/ns/commands/autoslot.ts`
- `ts/packages/incubating/extensions/flow/src/ns/cli/flow/{gt,gs}/autoslot/**`
- `ts/packages/incubating/extensions/flow/test/scenario/autoslot-command.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/slot-checkout.test.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/{src,test}/**`
- `ts/packages/incubating/extensions/flow/{README.md,CONTEXT.md}`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/{README.md,CONTEXT.md}`
- `docs/pi/README.md`
- Four provider-explicit skill directories/overlays plus `skills-lock.json`

## Validation guidance

Each PR must be independently reviewable and green. Use fake-driven default tests; do not put real Git, subprocess, network, or shared mutable state in the shared-cache default lane.

Focused checks during development should include the Flow package tests, Pi Flow adapter tests, SDK real-loader CLI tests, and skill-backed command tests. Before each PR is complete, run the repository-required validation appropriate to the changed architecture, including:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-sanity
just ts-test-typescript-style-guard
just dprint-check
just
```

Run `just ts-test-isolated` only if the implementation adds or changes genuine isolated-lane coverage. If formatter checks fail, use `just ts-format-fix` or `just dprint-fix` as directed by repository policy and rerun validation.

CLI validation must cover:

- filesystem descriptor route inventories;
- `-h`/`--help`, `--runtime`, and `--json-schema` where part of the existing command contract;
- stable Clinkr envelope status/exit behavior;
- structured negative/refusal versus operational failure data;
- old flat GT paths being absent;
- arbitrary-length argv forwarding from Pi;
- machine schemas for all new GS commands.

Skill validation must use supported management tooling and explicit path checks:

```bash
npx skills check
npx skills list
readlink .agents/skills/<identity>
readlink .claude/skills/<identity>
```

Inspect `git diff -- skills-lock.json` and reject unrelated lock churn. Search bounded live surfaces for old skill identities and old flat Flow commands; explain historical matches rather than editing immutable records.

For optional real gh-stack compatibility coverage, first assert the installed extension/version and skip or clearly fail with installation guidance according to the integration-test convention. Do not make the default test lane depend on a globally installed extension.

## Risks, assumptions, and implementation-level open points

### Risks

- **Provider-private metadata cannot be partially repaired safely.** gh-stack has no non-interactive remove-one-layer operation. Recovery must preserve ambiguous state rather than deleting a branch and claiming rollback.
- **Automatic initialization has durable side effects.** It writes `.git/gh-stack` and enables Git rerere. User documentation and structured outcomes must disclose initialization; later failures do not undo it.
- **Command-spec ambiguity.** Adding duplicate action names under `gt` and `gs` will break name-only lookup. Establish unique identities in PR 1 before adding GS specs.
- **Latest-commit mutation is destructive before adoption.** Reverify source branch and HEAD immediately before reset, retain recovery branches until all Git/provider postconditions pass, and never trust command exit alone.
- **Broad GT regroup has a large reference surface.** Skills, Pi argv, SDK loader tests, recovery prompts, docs, and command help must move atomically in PR 1.
- **Optional Slots composition can accidentally become a hard dependency.** Preserve existing extension-package-API and registration boundaries.
- **gh-stack is pre-1.0.** Pin docs/tests to observed official v0.1.0 semantics and keep translation inside the adapter so future drift is localized.

### Assumptions

- `github/gh-stack` remains an external user-installed prerequisite; this implementation does not package or install it automatically.
- `gs` selects only `github/gh-stack`; it is not a generic GitHub provider label.
- Graphite remains selected explicitly through `gt`; this stack does not make submit, land, or squash available through gh-stack.
- The four approved skill destinations retain incubating disposition and Flow family ownership.
- Machine-facing provider values use descriptive identities (`graphite`, `gh-stack`), while CLI/Pi namespaces use abbreviations (`gt`, `gs`).
- Internal module and type names may be refined during implementation as long as the semantic seam, recovery rules, and public command contracts remain intact.

No material product questions remain open. If official gh-stack behavior differs from the consulted v0.1.0 source during implementation, stop that PR, capture the exact version/evidence, and revise the adapter plan rather than silently coding to a new contract.

## Review and remediation

Review each PR on two axes before stacking the next one:

1. **Standards:** repository instructions, TypeScript style, fake-driven gateway discipline, CLI envelopes, skill-management ownership, context synchronization, and no ADR rewriting.
2. **Spec:** exact command/Pi/skill names, breaking alias-free GT cutover, auto-init/refuse-on-trunk policy, Flow-owned commits, symmetric three-command autobranch families, and safe provider-aware recovery.

For findings:

- Fix correctness, recovery-state honesty, command-contract, and skill-topology findings in the PR that introduced them.
- Keep tests/docs with the behavior they protect; do not create cleanup-only follow-up PRs for required conformance.
- If a review proves the internal provider seam is too broad, narrow it to the semantic operations used by dirty/latest transactions; do not replace it with raw command pass-through.
- If safe gh-stack rollback cannot be proven, choose preservation plus explicit recovery facts over a best-effort metadata mutation.
- If a real-adapter test exposes v0.1.0 drift, update the capability matrix and adapter together with primary-source provenance.
- After remediation, rerun focused suites and the full required validation for that PR, then inspect the cumulative three-PR diff to ensure no old flat route or ambiguous autobranch skill remains live.
