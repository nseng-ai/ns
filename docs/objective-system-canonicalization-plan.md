# Objective System Canonicalization Plan

Audit date: 2026-04-29

This document captures audit findings and a tiered plan to canonicalize the
objective subsystem. It is intentionally self-contained so a future session
can resume without redoing the same discovery.

## Thesis

The objective system currently has multiple competing sources of truth:

- repo-local skills under `skills/objective*`;
- objective reference docs under `skills/objective/`;
- executable Python in `packages/asdl-objectives`;
- generic storage behavior in `packages/brmem`;
- tests that sometimes lock in behavior not reflected in the conceptual docs.

Canonicalization should make docs, code, and tests describe the same system.
Live contradictions — freshness contract drift, dead schema fields,
unimplemented stack-map promises — should be resolved first. Pushing
deterministic mechanics from skill prose into `asdl_objectives` is an
optional follow-on that further reduces drift surface; it is not required to
resolve current contradictions.

Markdown prose is not schema. Do not push heading splits, checkbox extraction,
roadmap parsing, or loose prose matching into Python unless the upstream data
model is first changed to structured data. CLI helpers should pass raw
Markdown to the agent when semantic rewriting is required.

## Current System Inventory

### Conceptual And Skill Docs

- `skills/objective/SKILL.md` is the conceptual reference. It defines the
  canonical-vs-branch model, storage shape, document anatomy, lifecycle,
  carry-forward semantics, and mutation table.
- `skills/objective/references/mutation-contract.md` is intended to be the
  shared mutation contract for `update` and `reconcile`, but parts of it are
  stale relative to Python freshness behavior.
- Operation skills:
  - `skills/objective-create/SKILL.md`
  - `skills/objective-claim/SKILL.md`
  - `skills/objective-next/SKILL.md`
  - `skills/objective-current/SKILL.md`
  - `skills/objective-digest/SKILL.md`
  - `skills/objective-update/SKILL.md`
  - `skills/objective-reconcile/SKILL.md`
- Human walkthrough: `skills/objective/README.md`.
- Templates:
  - `skills/objective/templates/body-template.md`
  - `skills/objective/templates/roadmap-template.md`
  - `skills/objective/templates/notes-template.md`

### Python Package

`packages/asdl-objectives/AGENTS.md` says the package owns schema, slug
rules, canonical-record semantics, and the `objective` CLI surface. The actual
CLI currently exposes:

- top-level commands:
  - `objective list`
  - `objective show`
  - `objective tree`
- hidden `exec` commands:
  - `objective exec current`
  - `objective exec digest`
  - `objective exec update-precheck`
  - `objective exec absorb-patches`

There is no Python command for the full mutating workflows:

- `objective-create`
- `objective-claim`
- `objective-next`
- `objective-update` prose rewrite and persistence
- `objective-reconcile`

### Storage Package

`brmem` owns generic branch-scoped storage. Objective storage is just one
namespace. The generic ref model lives in `packages/brmem/src/brmem/gateway.py`:

- snapshot ref: `refs/brmem/ns/<namespace>/<encoded-branch>`
- entry locator: `<snapshot-ref>:<key>`
- branch encoding: `/` -> `---`
- branch names containing `---` are rejected because the encoding would be
  ambiguous.

There is a private mirror in `packages/brmem/src/brmem/real.py` for snapshot
ref parsing/decoding. That is generic brmem duplication, not objective-specific
business logic, but it is relevant because objective skills currently describe
manual ref decoding.

## Canonical Model As Implemented Today

Storage:

- namespace: `objectives`
- canonical storage branch: `master`
- objective files:
  - required: `body.md`
  - optional: `roadmap.md`
  - optional: `notes.md`
  - optional machine-owned marker: `.absorbed.jsonl`

Python source:

- `OBJECTIVE_NAMESPACE` is in
  `packages/asdl-objectives/src/asdl_objectives/gateway_access.py`.
- `MASTER_BRANCH`, file constants, key helpers, slug grouping, and repo-wide
  discovery are in
  `packages/asdl-objectives/src/asdl_objectives/discovery.py`.
- current-branch slug auto-resolution is in
  `packages/asdl-objectives/src/asdl_objectives/slug_resolution.py`.
- trunk lookup delegates to the bound git gateway in
  `packages/asdl-objectives/src/asdl_objectives/trunk_resolution.py`.

Freshness:

- Python freshness is patch-id based for live branch snapshots.
- `.absorbed.jsonl` records commits observed in `trunk..branch` when
  `objective-update` confirms the snapshot covers the branch work.
- Only non-null patch IDs participate in freshness; commit SHA, subject, and
  author time are diagnostic.
- Malformed markers make live branch snapshots stale.
- Deleted branch snapshots are rendered as deleted by callers.

PR evidence:

- `objective tree` groups branch snapshots by PR state:
  `merged`, `open`, `closed`, `no_pr`, `error`.
- `objective-reconcile` skill says only merged PR-backed snapshots should
  enter canonical state.

## Drift And Duplicate Business Logic

### Freshness Contract Split

Python source:

- `freshness.py` says `.absorbed.jsonl` patch IDs are the freshness source of
  truth.
- `update_precheck.py` uses `load_branch_patch_facts`, `load_absorbed_marker`,
  and `classify_obj_state`.
- `update_precheck.py` still emits `snapshot_max_head_date` and
  `branch_max_author_iso`, but those are not authoritative for freshness.

Conflicting docs:

- `skills/objective/references/mutation-contract.md` still describes
  timestamp/author-time freshness using max `head_date` and author time.
- `skills/objective-next/SKILL.md` still tells the agent to compare brmem
  `head_date` to branch HEAD time.

Plan implication:

- Patch-id marker freshness should be canonical unless deliberately reverted.
- Timestamp fields should either be diagnostic-only or removed from the
  freshness contract.

### Downstack Absorption Is Documented But Not Implemented

`skills/objective-update/SKILL.md` says freshness is true when branch patch IDs
are absorbed by either a downstack ancestor or the branch snapshot marker.

`ObjectiveUpdatePrecheckResult` includes `downstack_absorbed_patch_ids`, but
`update_precheck.py` always returns an empty tuple.

Plan implication:

- Locked: delete (see A2). The "downstack ancestor" definition is the hard
  part — doing it without a default Graphite dependency (AGENTS.md) is
  awkward, and the current cost (re-marking ancestor commits in the
  branch's own marker) is mildly redundant but correct. Removed from
  skills/docs and the result schema.

### `objective-current` Stack Map Promise Is Not Implemented

Docs promise stack context:

- `skills/objective/SKILL.md` says `objective-current` shows downstack ancestry
  and immediate upstack children.
- `skills/objective-current/SKILL.md` advertises the same.

Python behavior:

- `exec/current.py` sets `ancestors = ()` and `children = ()`.
- The rendered stack map has only the current branch.
- Scenario tests assert current-branch-only output.

Plan implication:

- Decide whether `objective-current` should be a true stack map or a
  current-branch orientation view.
- AGENTS rules prohibit a default Graphite dependency, so any true stack
  behavior must use generic git facts or live behind an explicit
  Graphite-named command/group.

### Stack-Map Trunk Row Mislabels Master

Master is the canonical-objectives registry — every slug ever created has its
`body.md` / `notes.md` / `roadmap.md` blobs stored under
`refs/brmem/ns/objectives/master/<slug>/`. The stack-row builder in
`exec/current.py` calls `_build_objective_summary` for any branch row and
returns `sorted(slugs)[0]` as the "primary" objective. For feature branches
that's correct (they typically claim one slug). For master it produces a
coherent-looking but actively misleading row:
`master  no PR  <alphabetically-first-slug> fresh|stale`. The other slugs are
swept into `objectives_extra`, which the stack-row renderer drops.

Worse, the "stale" word is the trigger that drives `objective-update`. So an
agent reading this brief can be walked toward maintenance work on a slug it is
not even working on.

Today this manifests only when the user is sitting on master, because
`ancestors` and `children` are hardcoded empty in `current.py:130-131` and the
trunk row never appears under a non-trunk stack. No scenario test covers
"on-master with multiple canonical slugs" — `test_current_on_trunk` only
exercises the empty-registry case.

Whenever stack walking returns, master will appear as the trunk row at the
bottom of every non-trunk stack, and the same bug will mislabel the trunk row
on essentially every `objective exec current` invocation.

Plan implication:

- The trunk row should reflect the current branch's claimed slug, not the
  registry's alphabetical first. Three cases: no claim → bare master row;
  current branch claims slug `X` and master has `X` → label with master-vs-master
  freshness ("should I reconcile?"); orphan claim (`X` on current, missing
  from master) → label as "missing on master". Non-trunk ancestors keep the
  existing alphabetical-first rule. See A5.

### `objective-next` Source Semantics Conflict

`skills/objective/README.md` normal workflow:

- create canonical objective on `master`;
- run `objective-next dashboard-revamp`;
- `next` inspects canonical state and suggests the first slice branch slug;
- then create a branch and run `objective-claim`.

`skills/objective-next/SKILL.md`:

- `next` plans against the current branch only;
- there is no source cascade;
- if the prompt names a slug, it must already be claimed on the current
  branch;
- current `master` behavior is special-cased, but still manually specified.

Python:

- there is no `objective next` command or `objective exec next-plan` helper.

Plan implication:

- Locked: current-branch-only (see A4). The README's "step 2 before step 3"
  example assumes the user is still on master at step 2; the skill's
  master-aware empty-branch behavior already handles that path. To peek at
  canonical state from a feature branch, use `objective show <slug>`
  rather than overloading `next`.

### `objective-claim` Is Skill-Only Critical Logic

Critical behavior currently lives only in `skills/objective-claim/SKILL.md`:

- no-slug resolution walks nearest live ancestor branch snapshot first;
- canonical fallback happens only when no ancestor candidate exists;
- explicit source flags bypass discovery;
- target collision is per slug;
- branch sources copy the full `<slug>/` directory with `brmem copy`;
- local file sources write only `<slug>/body.md`;
- target `master` is refused.

Python currently has reusable helpers for slug/file naming and current-branch
slug resolution, but not a claim planner.

Plan implication:

- Claim source resolution and collision detection live only in skill prose,
  with manual `git for-each-ref` / `git merge-base` / `git rev-list`
  instructions and hand-decoding of `---` in branch refs. Either accept that
  drift risk explicitly, or move it into a tested Python planner (Tier D).

### `objective-reconcile` Is The Highest-Risk Duplicate Authority

`skills/objective-reconcile/SKILL.md` contains large procedural logic:

- default sweep of all canonical objectives;
- optional slug list narrowing;
- concurrent per-slug subagents;
- parent-only serial canonical writes;
- local branch snapshot discovery;
- PR state gating;
- fallback `gh pr view`;
- handoff JSON schema;
- direct `brmem put` calls;
- conservative rewrite rules.

Python currently provides only `objective tree` facts, not a reconcile planner
or writer.

Plan implication:

- Parent-only serial canonical writes is the highest-risk invariant currently
  living in skill prose. All canonical objective files share the same
  `refs/brmem/ns/objectives/master` snapshot ref, so a parallelized write
  silently corrupts state. Either accept the risk explicitly, or move
  reconcile mechanics into a tested Python planner (Tier D).

### Digest Boundary Is Partly Canonicalized But Ambiguous

`objective exec digest` computes deterministic facts and emits a prompt with
raw Markdown blocks and an output template. Tests assert the prompt/template,
not a final digest.

`objective-digest` skill tells the agent to fill the prose sections and print
the final digest.

Plan implication:

- This boundary is acceptable if explicitly documented:
  - Python computes facts and provides raw prose.
  - Agent writes the human prose.
- Do not pretend the final digest is fully deterministic unless Markdown
  parsing/summarization is redesigned.

### `objective show` Mixes Sources Per File

Without `--branch`, `objective show <slug>` prefers the current branch per
file and falls back to master per file. Tests lock this behavior:

- body may come from a branch snapshot;
- roadmap may come from master;
- notes may come from a branch snapshot.

This is a useful view, but it can look like a coherent snapshot while actually
combining sources.

Plan implication:

- Decide whether this mixed view is intentional.
- If kept, name it clearly in docs and JSON fields so it is not mistaken for
  either canonical state or one branch snapshot.

### Hard-Coded `master` Vs Trunk

Objective canonical storage currently uses `master`.

The package also has trunk resolution via git gateway, and docs sometimes say
trunk/master/main conceptually.

Plan implication:

- Decide whether canonical objective storage is permanently `master` for
  brmem compatibility, or whether it should follow repo trunk.
- Until that decision changes, docs should consistently say canonical storage
  branch `master`.

## Plan

Pushdown of mechanics into Python is treated as optional. Tier A resolves
live contradictions where docs, code, or tests disagree. Tier B clarifies
contracts that are vague but not actively wrong. Tier C adds tests over the
existing Python surface, interleaved with A/B. Tier D is opt-in pushdown
work, ordered by risk reduction; skill shrinkage only matters if any Tier D
item lands.

### Tier A — Resolve live contradictions

#### A1. Freshness alignment

Goal: docs, code, and tests describe the same freshness rule.

Tasks:

- Update `skills/objective/references/mutation-contract.md` to drop
  timestamp/author-time freshness as authoritative.
- Update `skills/objective-next/SKILL.md` to stop telling the agent to compare
  brmem `head_date` to branch HEAD time.
- Demote `snapshot_max_head_date` and `branch_max_author_iso` in
  `update_precheck.py` output to diagnostic-only, or remove if unused.
- Add tests asserting patch-id marker behavior is the only branch snapshot
  freshness classifier.

Acceptance:

- `freshness.py`, `update_precheck.py`, `objective-update`, `objective-next`,
  and `mutation-contract.md` describe the same rule.
- No skill instructs the agent to skip update based only on timestamps.

#### A2. Downstack absorption: delete

Goal: stop returning an always-empty field from a stable result schema.

Decision (locked): delete. The "downstack ancestor" definition is the
design-hard part: PR-base-graph is accurate but adds a `gh` round-trip;
`git first-parent` is generic but approximate. AGENTS.md prohibits a
default Graphite dependency, so neither is an obvious win. The current cost
of not having it — re-marking ancestor commits in the branch's own marker —
is mildly redundant but correct. If stacked-PR users later need ancestor
inheritance, re-add it as a deliberate design with a named flag and explicit
ancestor semantics.

Tasks:

- Remove `downstack_absorbed_patch_ids` from `ObjectiveUpdatePrecheckResult`
  in `packages/asdl-objectives/src/asdl_objectives/exec/update_precheck.py`
  (field at line 93, `()` assignment at line 226).
- Drop the empty-tuple assertion in
  `packages/asdl-objectives/tests/scenario/test_objective_exec_update_precheck.py:180`.
- Drop the "downstack ancestor or" clause from the freshness rule in
  `skills/objective-update/SKILL.md` (line 128).

Acceptance:

- The field does not exist.
- Skills do not reference downstack absorption.

#### A3. `objective-current` scope: option B

Goal: stop the docs from promising what the code does not do.

Tasks:

- Update `skills/objective-current/SKILL.md` to describe current-branch
  orientation, not a stack map.
- Update `skills/objective/SKILL.md` to match.
- Update the scenario test in `packages/asdl-objectives/tests/scenario/` to
  assert current-branch-only output as the documented contract.
- Leave `exec/current.py` empty-tuple defaults as-is.

Acceptance:

- No doc promises downstack/upstack from `objective-current`.
- The scenario test asserts the documented contract.

A true stack map remains available as a future opt-in (Tier D).

#### A4. `objective-next` source semantics: current-branch-only

Goal: README and skill describe the same workflow.

Decision (locked): current-branch-only. No source cascade, no `--source`
flag. The README's "step 2 before step 3" example assumes the user is still
on master at step 2 — at that point the current branch _is_ canonical
storage, and the skill's master-aware empty-branch behavior already handles
that path. To peek at canonical state from a feature branch, use
`objective show <slug>` rather than overloading `next`.

Rationale:

- Symmetric with siblings: `update` is current-branch-only, `reconcile` is
  canonical-only, `claim` is the explicit cross-source operation.
- `objective show <slug>` already covers cross-branch reads.
- Drops D12 (`next-plan` pushdown) from the Tier D budget — a current-
  branch-only `next` is short and not drift-prone in the way reconcile and
  claim are.

Tasks:

- Update `skills/objective/README.md` step 2 to clarify that
  `objective-next dashboard-revamp` runs while still on master, before
  creating the slice branch.
- Add an explicit "no source cascade, no `--source` flag" note in the Core
  Rules section of `skills/objective-next/SKILL.md` to lock the contract.
- No code changes; the skill remains the executor.

Acceptance:

- Reading README and the skill back-to-back produces no contradictions.
- The skill explicitly states current-branch-only with no source flag.

#### A5. Trunk-row labels in-scope slug, not registry alphabetical-first

Goal: stop the stack-map trunk row from labeling itself with an arbitrary slug
from master's canonical registry.

Master is the canonical-objectives registry — it accumulates body / notes /
roadmap blobs for every slug ever created. The stack-row builder in
`exec/current.py` calls `_build_objective_summary` for any branch row and
picks `sorted(slugs)[0]` as the "primary." For feature branches that's correct
because they typically claim one slug. For master it produces a coherent-looking
but misleading row: `master  no PR  <alphabetically-first-slug> fresh|stale`,
with the rest dropped via `objectives_extra`. The "stale" word is the trigger
for `objective-update`, so the bug can walk an agent toward maintenance work
on a slug it is not even working on.

Today this manifests only when the user is sitting on master (since `ancestors`
and `children` are hardcoded empty in `current.py:130-131`). Whenever stack
walking is reintroduced, master appears as the trunk row under every non-trunk
stack and the same bug scales accordingly.

Fix. Compute an in-scope slug for the trunk row from the current branch's
claimed slug, not from the trunk's registry. Three cases:

1. No claim on the current branch → bare master row.
2. Current branch claims slug `X` and master holds `X` →
   `master  no PR  X fresh|stale`, where freshness compares master's
   `<X>/body.md` last-touch to master HEAD (the answer to "should I
   reconcile?").
3. Orphan — current branch claims `X` but master lacks it →
   `master  no PR  X missing on master`.

Non-trunk ancestors and upstack children keep the existing alphabetical-first
rule; in practice each holds one claim, so it produces the right answer there.

Tasks:

- Carve the trunk-row builder out of the generic `_build_objective_summary`
  path so it can take an explicit in-scope slug.
- Add a master-vs-master freshness classifier (compares `<slug>/body.md`
  last-touch to trunk HEAD).
- Add a `missing_on_master` state on the trunk row and render it.
- Add scenario tests for on-trunk-with-N-canonicals (bare),
  on-trunk-with-orphan-claim ("missing on master"), and a future-proof test
  that injects a non-empty downstack to lock the in-scope rule for when stack
  walking returns.

Acceptance:

- Sitting on master with N canonical objectives renders a bare master row, not
  an alphabetical-first label.
- Whenever stack walking returns, the trunk row reflects the current branch's
  in-scope slug rather than the registry's alphabetical first.

### Tier B — Clarify contracts

#### B5. Authority boundaries

Goal: contributors can tell which layer owns which rule.

Tasks:

- Add a short architecture note (in `packages/asdl-objectives/AGENTS.md` or
  a sibling) stating that `asdl_objectives` owns the deterministic objective
  mechanics it currently implements.
- Mark `skills/objective/SKILL.md` as conceptual behavior reference, not
  independent implementation authority.
- Mark `skills/objective/references/mutation-contract.md` as mutation policy,
  not low-level mechanics.
- Document that brmem owns ref encoding and branch-name validation.

Acceptance:

- A future contributor can place a new rule in the right layer without
  reading every objective skill.

#### B6. Digest ownership

Goal: explicit boundary between deterministic facts and agent-authored prose.

Tasks:

- Document that `objective exec digest` emits facts, raw Markdown blocks, and
  an output template, and that the final digest is agent-authored.
- Update tests to assert the prompt/template contract — not final prose
  wording.
- Optionally rename to `objective exec digest-brief` if helpful.

Acceptance:

- Contributors know the final digest is agent-authored prose over
  CLI-provided facts.

#### B7. `master` vs trunk

Goal: decide and propagate.

Decision: keep canonical objective storage permanently on `master`, or
follow repo trunk?

The practical answer is likely permanent `master` given brmem ref shape, but
the decision should be explicit so loose "trunk/master/main" prose can be
removed.

Tasks:

- Once decided, ensure `MASTER_BRANCH` usage and surrounding docs say one
  thing consistently.

Acceptance:

- One named branch is canonical storage, and docs say so consistently.

#### B8. `objective show` source view

Goal: prevent mistaking a mixed view for canonical state or a single branch
snapshot.

Decision: keep per-file mixed fallback, or split into named views?

If kept:

- Label the source per file in `objective show` output.
- Document the behavior in the package AGENTS.md.

If split (lower priority):

- `--branch <branch>` for branch-strict.
- `--canonical` for master-only.
- `--effective` for the current mixed fallback.

Acceptance:

- A user can tell whether they are looking at canonical state, one branch
  snapshot, or an effective view.

### Tier C — Lock existing surface

#### C9. Targeted tests over existing Python

Interleave with Tier A/B work that touches each surface. Add tests for:

- patch-id freshness in `freshness.py`;
- malformed `.absorbed.jsonl` rendering branch snapshots stale;
- branch names containing `---` rejected by brmem;
- deleted/orphaned branch snapshots rendered as deleted by callers;
- multiple slugs on one branch;
- PR state classification in `objective tree`
  (`merged` / `open` / `closed` / `no_pr` / `error`).

Acceptance:

- Each tested behavior fails loudly if a future change drifts it.

### Tier D — Optional pushdown

Opt-in. Ordered by risk reduction. Skill shrinkage is meaningful only if at
least one Tier D item lands.

#### D10. Reconcile pushdown

Highest payoff. Parent-only serial canonical writes is the riskiest invariant
currently living in skill prose.

Proposed commands:

```text
objective exec reconcile-plan [slug-or-list] --format json
objective exec reconcile-apply --plan-file <path> --format json
```

`reconcile-plan` owns:

- slug set resolution;
- canonical presence checks;
- branch snapshot enumeration;
- PR lookup and state classification;
- inclusion/exclusion gating;
- old SHA capture;
- raw Markdown retrieval for canonical and eligible branch snapshots;
- stable evidence/gap/conflict JSON.

Agent owns:

- conservative semantic rewrite over raw Markdown;
- preparing proposed Markdown files.

`reconcile-apply` owns:

- file path validation;
- expected-old-SHA check;
- serial `brmem put` writes to canonical `master`;
- emitting old/new SHAs and recovery commands.

Acceptance:

- Parent-only serial writes enforced by code, not skill prose.
- PR state gates tested.
- `objective-reconcile/SKILL.md` shrinks to a small command workflow.

#### D11. Claim pushdown

Second highest. Ancestor walk and collision check are drift-prone in skill
prose.

Proposed:

```text
objective exec claim-plan [slug] [--target <branch>] [--from <branch>] [--from-file <path>] --format json
```

Plus either a separate `objective exec claim-apply --plan-file <path>` or a
top-level `objective claim` plan+apply.

Plan JSON includes: target branch, resolved slug or
ambiguity/no-candidate error, target collision status, selected source type
and source branch/path, files to carry, exact `brmem copy` or `brmem put`
operation shape, all alternatives/ties when ambiguous.

Acceptance:

- Ancestor discovery, canonical fallback, collision checking, and explicit
  source validation tested in Python.
- Skill no longer manually runs `git for-each-ref`, `git merge-base`,
  `git rev-list`, or hand-decodes `---`.

#### D12. `next-plan` command — dropped

A4 locked `objective-next` to current-branch-only. With no source cascade
and no `--source` flag, the skill prose is short and not drift-prone.
Pushing it into Python is a marginal win; the Tier D budget is better spent
on D10 (reconcile pushdown), where parent-only serial canonical writes are
genuinely dangerous in skill prose.

#### D13. `objective-create` as Python command

Lowest priority. Decide whether `create` takes ownership of templating,
collision check, and storage write, or remains skill-owned with only
collision/storage helpers pushed down.

## PR Sequence

Tier A/B/C bundles into three base PRs (must-do); Tier D becomes up to three
optional pushdown PRs (D12 dropped). C9 tests interleave into the base PRs
as the related surface is touched.

### PR1 — Freshness contract alignment

Bundles A1 + A2 + freshness slice of C9.

- Docs: `mutation-contract.md`, `objective-next/SKILL.md` (drop timestamp
  freshness Step 5), `objective-update/SKILL.md` (drop "downstack ancestor
  or" clause).
- Code: `packages/asdl-objectives/src/asdl_objectives/exec/update_precheck.py`
  — demote or remove `snapshot_max_head_date` and `branch_max_author_iso`;
  delete `downstack_absorbed_patch_ids` field and its `()` assignment.
- Tests: drop the empty-tuple assertion in
  `test_objective_exec_update_precheck.py`; add patch-id-only freshness,
  malformed marker → stale, deleted-branch snapshot rendering.

### PR2 — `objective-current` scope + trunk-row bug

Bundles A3 + A5 + scenario slice of C9.

- Docs (A3): `objective-current/SKILL.md` and `objective/SKILL.md` describe
  current-branch orientation, not stack map.
- Code (A5): carve trunk-row builder out of `_build_objective_summary` in
  `packages/asdl-objectives/src/asdl_objectives/exec/current.py`; add
  master-vs-master freshness classifier; add `missing_on_master` state on
  the trunk row.
- Tests: lock current-branch-only output as the documented contract; add
  on-trunk-with-N-canonicals (bare row, no alphabetical-first label),
  on-trunk-with-orphan-claim ("missing on master"), and an injected-non-
  empty-downstack test to future-proof the in-scope-slug rule for when
  stack walking returns.

### PR3 — Skill / doc alignment sweep

Bundles A4 + B5 + B6 + B7 + B8 + remaining C9.

- A4: README step 2 clarifies "still on master"; skill confirms current-
  branch-only with explicit no-cascade no-flag note.
- B5: authority-boundaries note in `packages/asdl-objectives/AGENTS.md`.
- B6: document `objective exec digest` as facts + raw Markdown + template;
  tests assert prompt/template, not final prose.
- B7: lock canonical objective storage to `master` permanently; remove
  loose "trunk/master/main" prose.
- B8: keep `objective show` mixed fallback, label source per file in
  output, document in package AGENTS.md.
- Remaining C9: branch names containing `---` rejected by brmem; multiple
  slugs on one branch; PR-state classification in `objective tree`
  (`merged` / `open` / `closed` / `no_pr` / `error`).

### Optional Tier D PRs

D12 dropped (see Tier D above).

- **PR4 — D10 Reconcile pushdown.** Highest payoff. Encodes parent-only
  serial canonical writes in code rather than skill prose.
- **PR5 — D11 Claim pushdown.** Replaces hand-rolled `git for-each-ref` /
  `merge-base` / `rev-list` and `---` decoding in the skill.
- **PR6 — D13 `objective-create`.** Lowest priority; decide ownership
  scope first.

### Order

PR1 → PR2 → PR3 in any order; surfaces are independent. PR4 first among
Tier D since it carries the riskiest invariant. A1 within PR1 is the
natural starting point — narrowest blast radius, existing test coverage,
and it establishes the pattern for the rest of Tier A: pick one slice of
drift, make docs/code/tests agree, and lock it with a test.

## Progress

PR1, PR2, and PR3 are landed as a local branch stack on top of
`audit-obj-duplication`. Nothing is pushed and no PRs are open. Each
slice was implemented serially with `just` exiting 0 before the next was
started.

- **PR1 — Freshness contract alignment** (A1 + A2 + freshness slice of
  C9). Branch `obj-canonicalize/01-freshness-alignment` at `2db4c0a`.
  8 files; 1170 tests pass.
- **PR2 — `objective-current` scope + trunk-row bug** (A3 + A5 +
  scenario slice of C9). Branch
  `obj-canonicalize/02-current-scope-trunk-row` at `c910dd6`. 6 files;
  1180 tests pass.
- **PR3 — Skill / doc alignment sweep** (A4 + B5 + B6 + B7 + B8 +
  remaining C9). Branch `obj-canonicalize/03-doc-alignment-sweep` at
  `d48c984`. 15 files; 1200 tests pass.

All Tier A items are landed. Tier B is landed (B7 chose permanent
`master`; B8 chose mixed fallback with per-file source labels). C9 is
interleaved across the three PRs as planned. Tier D remains opt-in:
PR4 (D10 reconcile pushdown), PR5 (D11 claim pushdown), and PR6 (D13
`objective-create`). D12 is dropped per A4.

## Lessons Learned

- **A1 demote-vs-remove was a clean remove.** `snapshot_max_head_date`,
  `branch_max_author_iso`, and the always-empty
  `downstack_absorbed_patch_ids` had zero readers outside their own
  tests. Carrying dead schema "for diagnostics" wasn't worth the API
  surface; if a future consumer needs them, reintroduce with an
  explicit non-authoritative comment.
- **A5 was silent on multi-claim feature branches.** The
  trunk-row builder treats a current branch with zero or more than one
  claimed slug as having no in-scope slug, so it renders a bare row
  rather than reaching back to the alphabetical-first rule we were
  fixing. Defensible default; revisit if multi-claim feature branches
  ever become common.
- **A3 + A5 interaction**: the trunk row only renders when the current
  branch is on trunk or when downstack is non-empty. Because A3 keeps
  downstack hardcoded empty, today the trunk row appears only on
  on-trunk invocations. Cases 2 and 3 of the in-scope-slug rule are
  exercised by the on-trunk single-canonical / orphan-claim tests plus
  the injected-non-empty-downstack tests; whenever stack walking
  returns the rule already applies.
- **B7 keyword rename was deliberately deferred.** Locking canonical
  storage to literal `master` is a doc/comment decision; the
  `trunk` keyword on
  `freshness.classify_canonical_freshness(git, *, trunk, slug)` was
  left unchanged because renaming would ripple through call sites and
  test fixtures for no semantic gain. The B7 contract is still locked
  via prose.
- **B8 label format is the contract.** File source labels in
  `objective show` (without `--branch`) are `(canonical: master)` and
  `(branch: <name>)`. Single source of truth is `_format_file_header`
  in `asdl_objectives.show`; downstream renderers and tests must use
  these exact labels.
- **Authority Boundaries section is the right home for cross-layer
  rules.** New contracts spanning `asdl_objectives` /
  `skills/objective` / `brmem` / `mutation-contract.md` should extend
  the "Authority Boundaries" section in
  `packages/asdl-objectives/AGENTS.md` rather than duplicating prose
  across skills. Tier D pushdowns should add their rules there too.
- **The base ref needs to be green before slice 1.** This plan file
  itself was failing `dprint check` at the base ref (`*is*` →
  `_is_`); slice 1's worker correctly refused to modify the plan, so
  the coordinator folded a `dprint fmt` of this file into slice 1's
  commit. Future stacker runs should verify `just` exits 0 on the base
  before launching slice 1.
