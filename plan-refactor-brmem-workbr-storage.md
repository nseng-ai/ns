# Plan: refactor brmem and move workbr onto typed entry refs

## Goal

Refactor `brmem` from a branch-scoped tree store into an entry store
addressed by `namespace`, `key`, and `branch`, then move the existing
workbr flow to build on top of that substrate.

This plan is intentionally a hard cut:

- No compatibility layer for `refs/brmem/brs/*`.
- No migration shim.
- Intermediate PRs may be temporarily non-runnable.
- Final workbr convention is `namespace=workbr`, `key=plan`.

## Locked decisions

- Ref shape: `refs/brmem/<namespace>/<key>/<encoded-branch>`.
- `namespace` is the public term; do not use `type`.
- `brmem list` means "list entries", not "list artifact paths".
- Each ref stores a tree, not a single fixed blob.
- Artifact paths remain relative POSIX paths within an entry tree.
- `namespace` and `key` are each a single ref path segment.
- `/` is illegal in `namespace` and `key`.
- Any domain-specific escaping beyond that belongs to the caller, not the
  generic `brmem` layer.
- Branch encoding stays as the current `/ -> ---` mapping for now.
- The old `refs/brmem/brs/<encoded-branch>` layout is retired.
- Workbr stores its plan at:

```text
refs/brmem/workbr/plan/<encoded-branch>:plan.md
```

## Why this design

The current `brmem` model is structurally branch-first:

```text
refs/brmem/brs/<encoded-branch>
  <arbitrary tree paths>
```

That shape makes "list everything on branch X" easy, but it makes
cross-branch queries structurally awkward because the meaningful metadata
is inside tree paths. The new model moves that metadata into the ref
name:

```text
refs/brmem/<namespace>/<key>/<encoded-branch>
  <tree of artifacts>
```

This gives `brmem` a cheap primitive for entry-level listing:

- all entries in a namespace
- all branches carrying a key
- all keys present on a branch

Those queries become `git for-each-ref` plus parsing. Artifact-level
inspection remains a per-entry tree operation, which is fine because it
is no longer pretending to be the same query as entry listing.

## End state

After all four PRs land:

- `brmem` is entry-oriented.
- `brmem list` lists entries.
- `brmem` has explicit entry and artifact operations.
- workbr reads and writes through `namespace=workbr`, `key=plan`.
- No code, tests, docs, or skills refer to `refs/brmem/brs/*`.

## Core model

### Entry identity

An entry is uniquely identified by:

- `namespace`
- `key`
- `branch`

The ref name is:

```text
refs/brmem/<namespace>/<key>/<encoded-branch>
```

### Artifact identity

Artifacts live inside the tree for one entry and are addressed by a
relative path such as:

- `plan.md`
- `snapshot.md`
- `attachments/log.txt`

### Query semantics

`brmem list` returns entries, not artifact paths.

`brmem list-artifacts` returns the tree contents for one resolved entry.

### Cheap operations

Cheap means one `git for-each-ref` call plus parsing:

- list all entries
- list entries in one namespace
- list entries for one `(namespace, key)`
- list entries on one branch

Artifact reads remain simple:

- `git show <ref>:<path>`
- `git ls-tree -r --name-only <ref>`

## PR sequence

## PR1: brmem substrate cutover

### Objective

Replace the legacy branch-tree storage model with the new
`namespace/key/branch` entry model and make the CLI reflect that model.

This PR should not attempt to preserve the old surface. It establishes
the new foundation cleanly.

### Outcome

- `refs/brmem/brs/*` is gone.
- `brmem` addresses entries by `namespace`, `key`, and `branch`.
- `brmem list` lists entries.
- Artifact operations are explicit.
- The real gateway and fake gateway both speak the new model.

### Progress after PR1

Status: landed on `new-brmem-part-1`.

Notable details that affect downstream PRs:

- The command surface is now stable as:

```bash
brmem put <path> --namespace <ns> --key <key> [--branch <branch>]
brmem get <path> --namespace <ns> --key <key> [--branch <branch>] [--at <sha>]
brmem list [--namespace <ns>] [--key <key>] [--branch <branch>]
brmem list-artifacts --namespace <ns> --key <key> [--branch <branch>] [--at <sha>]
brmem check-entry --namespace <ns> --key <key> [--branch <branch>]
brmem check-artifact <path> --namespace <ns> --key <key> [--branch <branch>] [--at <sha>]
```

- `brmem copy` is removed from the product surface, and the old `brmem branch ...` subgroup is gone.
- The gateway/ref contract settled on `EntryRef`, `EntryDiagnostic`, `ArtifactDiagnostic`, `ref_name_for_entry(...)`, and `parse_entry_ref(...)`.
- CLI-side validation now does LBYL and aggregates multiple bad user inputs into one `invalid_request`; a single bad field still returns the specific `invalid_*` error. Downstream skills should treat validation failures as CLI/user errors, not depend on gateway exceptions.
- `check-entry` and `check-artifact` have grep-style human exit semantics: `0` present, `1` absent, `2` invalid input / command failure. PR2 and PR3 should use those for preflight/probing instead of parsing human output or peeking at raw refs.
- `brs` is now a reserved namespace, and `list_entries()` ignores legacy `refs/brmem/brs/*` refs. There is still one intentional integration regression test that seeds a legacy ref to prove it is ignored; keep that distinction in mind when doing PR4 cleanup.

### CLI target

This is the landed PR1 shape:

```bash
brmem put <path> --namespace <ns> --key <key> [--branch <branch>]
brmem get <path> --namespace <ns> --key <key> [--branch <branch>] [--at <sha>]
brmem list [--namespace <ns>] [--key <key>] [--branch <branch>]
brmem list-artifacts --namespace <ns> --key <key> [--branch <branch>] [--at <sha>]
brmem check-entry --namespace <ns> --key <key> [--branch <branch>]
brmem check-artifact <path> --namespace <ns> --key <key> [--branch <branch>] [--at <sha>]
```

`brmem copy` should be removed or deferred in this PR unless it can be
reintroduced cleanly on top of the new model without muddying the cutover.

### Internal API target

Split the gateway into entry-level and artifact-level operations.

Entry-level operations:

- `ref_name_for_entry(namespace, key, branch)`
- `parse_entry_ref(ref)`
- `list_entries(namespace=None, key=None, branch=None)`
- `check_entry(namespace, key, branch)`

Artifact-level operations:

- `put_artifact(namespace, key, branch, path, content)`
- `get_artifact(namespace, key, branch, path, at=None)`
- `list_artifacts(namespace, key, branch, at=None)`
- `check_artifact(namespace, key, branch, path, at=None)`

### Detailed work

1. Replace branch-oriented ref helpers in
   `packages/twerk-core/src/twerk_core/brmem/gateway.py`.
2. Introduce validation for `namespace`, `key`, and artifact path.
3. Add entry dataclasses for listing and diagnostics.
4. Refactor `RealBranchMemoryGateway` into a real gateway that:
   - resolves refs by `namespace/key/branch`
   - uses a temp index to read the existing tree for one entry
   - updates one artifact in that tree
   - commits and advances only that entry ref
5. Implement `list_entries` with `git for-each-ref`.
6. Implement `list_artifacts` with `git ls-tree`.
7. Rewrite the CLI commands to require `--namespace` and `--key` where
   appropriate.
8. Remove the old `brmem branch check` concept because the substrate is
   no longer "one ref per branch".
9. Remove or stub out old branch-first wording from command help and JSON
   payloads.
10. Rewrite the fake gateway and its tests to mirror the new data model.

### Files likely touched

- `packages/twerk-core/src/twerk_core/brmem/gateway.py`
- `packages/twerk-core/src/twerk_core/brmem/real.py`
- `packages/twerk-core/src/twerk_core/brmem/fake.py`
- `packages/twerk-core/src/twerk_core/brmem/put.py`
- `packages/twerk-core/src/twerk_core/brmem/get.py`
- `packages/twerk-core/src/twerk_core/brmem/list.py`
- `packages/twerk-core/src/twerk_core/brmem/check_entry.py`
- `packages/twerk-core/src/twerk_core/brmem/check_artifact.py`
- `packages/twerk-core/src/twerk_core/brmem/check_registration.py`
- `packages/twerk-core/src/twerk_core/brmem/validation.py`
- `packages/twerk-core/src/twerk_core/brmem/group.py`
- `packages/twerk-core/src/twerk_core/brmem/main.py`
- tests under `packages/twerk-core/tests/{unit,integration,scenario}`

### Verification

- Scenario tests cover the new CLI shape.
- Integration tests prove:
  - multiple artifacts can coexist in one entry
  - updating one artifact preserves siblings
  - `list_entries` filters correctly by namespace, key, and branch
  - `list_artifacts` reports tree paths for a single entry
- No intended product surface references `refs/brmem/brs/`.
- Keep the intentional regression test that seeds a legacy `refs/brmem/brs/*` ref and asserts it is ignored.

### Non-goals

- Updating workbr skills.
- Preserving the legacy CLI.
- Migrating dev-mem-objective skills.

## PR2: move dev-workbr-create onto new brmem

### Objective

Update the "stash a plan on a branch without checkout" workflow to write
its state through the new `brmem` substrate.

### Outcome

`dev-workbr-create` writes the source plan into:

```text
refs/brmem/workbr/plan/<encoded-branch>:plan.md
```

### Detailed work

1. Update `skills/dev-workbr-create/SKILL.md` to stop referring to
   `refs/brmem/brs/<branch>`.
2. Change the stash command in the skill to:

```bash
brmem put plan.md --namespace workbr --key plan --branch <slug> --file <source-plan-path>
```

3. Change preflight checks so they validate the new model:
   - branch does not already exist
   - workbr entry does not already exist for `(namespace=workbr, key=plan, branch=<slug>)`
   - prefer `brmem check-entry --namespace workbr --key plan --branch <slug>` for the existence probe so the skill can use the landed `0/1/2` human exit contract instead of parsing output
4. Update all report text and inspection hints to reference the new ref
   path.
5. Remove any wording that implies `plan.md` is "the branch memory path";
   it is now the artifact path inside one workbr entry.
6. Update AGENTS/skill registry text if it mentions the old ref layout.

### Implementation checklist

- Keep the storage write itself as a single `brmem put ... --branch <slug>` call.
  Do not fall back to raw `git update-ref` or direct writes into `refs/brmem/...`.
- For the entry-exists probe, use `brmem check-entry --namespace workbr --key plan --branch <slug>`
  and branch on exit code:
  - `0` => fail because the workbr entry already exists
  - `1` => continue; no entry exists yet
  - `2` => fail because the input is invalid or the command failed
- Do not use `brmem list` for the existence probe; after PR1 it is an entry-listing command,
  not a yes/no check.
- Keep the artifact path literal as `plan.md` everywhere in the skill text and examples.
  The mutable part is the entry identity `(workbr, plan, <slug>)`, not the artifact path.
- Inspection/debug hints should prefer the landed commands and ref shape, e.g.:

```bash
brmem check-entry --namespace workbr --key plan --branch <slug>
git show refs/brmem/workbr/plan/<encoded-branch>:plan.md
```

- If the skill surfaces CLI failures to the user, preserve the distinction between:
  - branch creation failures
  - brmem validation failures
  - "entry already exists" as a normal preflight collision

### Files likely touched

- `skills/dev-workbr-create/SKILL.md`
- `AGENTS.md` only if it embeds the old storage wording

### Verification

Manual smoke test:

1. Create a source plan file.
2. Run the skill flow manually.
3. Confirm the branch exists and the current worktree did not move.
4. Confirm `brmem check-entry --namespace workbr --key plan --branch <slug>` exits `0`.
5. Confirm `git show refs/brmem/workbr/plan/<encoded-branch>:plan.md`
   prints the source plan verbatim.
6. Confirm `brmem get plan.md --namespace workbr --key plan --branch <slug>`
   prints the same content.

### Non-goals

- Updating `dev-workbr-impl`.
- Adding new convenience subcommands to `brmem`.

## PR3: move dev-workbr-impl onto new brmem

### Objective

Update the "pick up the stashed workbr plan and start implementing"
workflow to read from the new entry model.

### Outcome

`dev-workbr-impl` fetches `plan.md` from `namespace=workbr`, `key=plan`,
current branch.

### Detailed work

1. Update `skills/dev-workbr-impl/SKILL.md` to fetch:

```bash
brmem get plan.md --namespace workbr --key plan
```

2. Update missing-entry diagnostics so they point at the new ref path or
   the new `brmem list` / `brmem list-artifacts` / `brmem check-entry`
   commands rather than the retired `refs/brmem/brs/*` layout.
3. Update any wording that treats "branch memory" as the direct storage
   key; the direct key is now `(workbr, plan, branch)`.
4. Update AGENTS/skill registry text if it embeds the old fetch
   semantics.

### Implementation checklist

- Use `brmem get plan.md --namespace workbr --key plan` as the content fetch.
  In the normal worktree flow, omit `--branch` and let `brmem` resolve the current
  checked-out branch.
- When the skill needs to distinguish "missing plan" from invalid input or detached HEAD,
  probe first with `brmem check-entry --namespace workbr --key plan` and branch on exit code:
  - `0` => plan entry exists; proceed to `brmem get`
  - `1` => fail with a clear "no stashed workbr plan on this branch" message
  - `2` => fail because the environment or invocation is invalid
- Do not treat `brmem get` as the existence probe. After PR1, `check-entry` is the command
  with the explicit grep-style status contract.
- Diagnostics should reflect the new command roles:
  - `brmem list` => lists entry refs
  - `brmem list-artifacts` => lists artifact paths within one entry
  - `brmem check-entry` => existence/probe command
  - `brmem get` => fetch content
- If the skill includes inspect/debug suggestions, prefer commands the user can paste directly,
  e.g. `brmem list --namespace workbr --key plan`, `brmem check-entry --namespace workbr --key plan`,
  and `brmem list-artifacts --namespace workbr --key plan`.
- Do not reintroduce wording that suggests a branch owns a single monolithic branch-memory tree.
  The plan lives at artifact path `plan.md` inside the `(workbr, plan, branch)` entry.

### Files likely touched

- `skills/dev-workbr-impl/SKILL.md`
- `AGENTS.md` only if it embeds the old storage wording

### Verification

Manual smoke test:

1. Prepare a branch using the PR2 flow.
2. Open a worktree on that branch.
3. Confirm `brmem check-entry --namespace workbr --key plan` exits `0`.
4. Run the skill flow manually.
5. Confirm the skill fetches the correct plan content without writing a
   local `plan.md` file.
6. Confirm the failure path is sensible from detached HEAD and from a branch
   with no workbr entry.

### Non-goals

- Restoring removed legacy `brmem` conveniences.
- Migrating other skill families to namespaced brmem.

## PR4: cleanup, polish, and settle the final contract

### Objective

Remove any remaining legacy assumptions and make the final
entry-oriented `brmem` contract coherent for future consumers.

### Outcome

- No stale docs or tests mention the branch-tree model.
- Workbr docs and brmem docs agree on the final storage contract.
- Any intentionally deferred CLI cleanup is completed.

### Detailed work

1. Sweep for stale references to:
   - `refs/brmem/brs/`
   - "list paths stored in branch memory"
   - "branch check" as a first-class concept
2. Decide the fate of `brmem copy`:
   - reintroduce it as an explicit artifact copy between two entries, or
   - remove it from the product surface entirely for now
3. Tighten help text, JSON payload names, and renderer wording so they
   reflect entries and artifacts consistently.
4. Add or refine scenario coverage around the final UX.
5. Update top-level docs if they mention the old brmem behavior.

### Files likely touched

- remaining `packages/twerk-core/src/twerk_core/brmem/*`
- `packages/twerk-core/tests/**`
- `AGENTS.md`
- any docs or skill text still mentioning old brmem refs

### Verification

- `rg 'refs/brmem/brs/'` returns no intended product references.
- CLI help reads coherently without relying on old concepts.
- End-to-end workbr flow uses only the new namespaced entry model.

## Risks and mitigations

### Risk: "list entries" and "list artifacts" get conflated again

Mitigation:

- keep the commands separate
- keep the gateway methods separate
- name result dataclasses after entries vs artifacts, not generic "list"

### Risk: workbr instructions drift from the actual CLI

Mitigation:

- land PR2 and PR3 only after PR1 CLI names are stable
- keep all examples in skills copied from the actual command surface

### Risk: branch encoding remains lossy

Mitigation:

- accept it as an explicit prototype tradeoff in this stack
- keep the encoding logic isolated so it can be replaced later without
  redesigning the entry model

### Risk: other brmem consumers break during the cutover

Mitigation:

- accept that breakage during this stack
- treat non-workbr consumers as follow-on migrations, not hidden scope in
  these four PRs

## Explicitly deferred

- Migrating `dev-mem-objective-*` to the new `brmem` model.
- Any compatibility reader for old `refs/brmem/brs/*` refs.
- Any bulk migration tool.
- Any new namespace beyond `workbr`.
- Any redesign of branch encoding.

## Final acceptance criteria

The plan is complete when all of the following are true:

- `brmem` stores entries at `refs/brmem/<namespace>/<key>/<encoded-branch>`.
- `brmem list` lists entries, not artifact paths.
- workbr writes through `--namespace workbr --key plan`.
- workbr reads through `--namespace workbr --key plan`.
- no intended product surface refers to `refs/brmem/brs/*`.
