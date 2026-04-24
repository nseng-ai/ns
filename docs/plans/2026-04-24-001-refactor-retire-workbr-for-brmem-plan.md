---
title: "refactor: Retire workbr in favor of brmem + brmem-branch-create skill"
type: refactor
status: active
date: 2026-04-24
origin: docs/brainstorms/retire-workbr-for-brmem.md
---

# refactor: Retire workbr in favor of brmem + brmem-branch-create skill

## Overview

Retire the `workbr` concept — a namespace-name convention plus two thin
`dev-*` skills that wrap `brmem` — and replace it with a single shipped
public skill, `brmem-branch-create`, that creates a branch and stashes a
curated bundle using `brmem`'s base (unnamespaced) entries. The skill's
opinions live in a user-editable plugin file at
`.twerk/prompts/brmem-branch-create.md`, seeded from a shipped default on
first invocation.

`brmem`'s CLI surface is unchanged (only example help text is cleaned up).
No data migration. No new Python plugin infrastructure. No companion
`-impl` skill — any agent on a prepared branch can enumerate via
`brmem list --base` and read via `brmem get`.

Delivered as a 2-PR Graphite stack: PR #1 ships the new skill; PR #2
retires every `workbr` reference and deletes the old skills. See the
**Delivery & PR Split** section for details.

---

## Problem Frame

`workbr` was introduced as an ergonomic wrapper to stash a plan onto a
freshly created branch. In practice it added:

- A **named concept** with no subsystem behind it.
- A **misuse of `brmem` namespaces** — namespaces are plugin-style
  ownership boundaries (e.g., `memjectives` is a real subsystem that owns
  its slot across all branches). `workbr` repurposed that slot as
  per-branch scratch, which pollutes the mental model.
- **Two un-forkable skills** (`dev-workbr-create`, `dev-workbr-impl`) that
  bake in one slug rule and one bundle shape. A team with different
  conventions has no extension point.

The underlying ergonomic need ("create a branch and prefill curated
context in one agent action") is real. The retirement keeps that
capability, but expresses it as: base-namespace `brmem` entries + one
shipped skill + one user-editable plugin prompt per pluggable skill,
living in the shared `.twerk/prompts/` directory.

See origin: `docs/brainstorms/retire-workbr-for-brmem.md`.

---

## Requirements Trace

- R1. `rg workbr` across the repo returns zero hits outside the origin
  brainstorm and historical git log.
- R2. A new shipped skill, `skills/brmem-branch-create/`, takes a plan
  source, creates a branch via `git branch <slug> HEAD` (no checkout),
  and stashes the bundle via `brmem put` under base namespace by default.
- R3. If `.twerk/prompts/brmem-branch-create.md` is missing, the skill
  writes the shipped default prompt to that path before using it, and
  reports the one-time seeding in its output. If present, the file is
  used verbatim and never overwritten.
- R4. The shipped default plugin reproduces the essential workbr flow:
  kebab-case slug from plan content, single `plan.md` entry under base
  namespace (`refs/brmem/base/<slug>:plan.md`).
- R5. `dev-memjective-create` and `objective-list` still read coherently
  without any `workbr` / "upper workbr frame" language.
- R6. `brmem`'s CLI surface is unchanged aside from removing `workbr`
  from `--namespace` help-text examples.
- R7. `skills/dev-workbr-create/` and `skills/dev-workbr-impl/` (and
  their `.agents/skills/` and `.claude/skills/` symlinks) are removed.
- R8. Existing local `refs/brmem/ns/workbr/**` entries are left untouched
  (no rewrite, rename, or deletion).

---

## Scope Boundaries

- No `brmem` CLI additions (no `--create-branch` flag on `brmem put`;
  branch creation stays in the new skill).
- No remote / autonomous execution work. `refs/brmem/**` stay local-only.
- No multi-file "curated bundle" primitive in `brmem`. Multi-file
  stashing is achieved by the skill sequencing multiple `brmem put`
  calls under the plugin's direction. `brmem put` stays single-file.
- No migration of existing `refs/brmem/ns/workbr/**` data. It remains
  locally readable via `brmem get --namespace workbr` for users who need
  it; nothing is rewritten or deleted.
- No memjective redesign. Only narrative references to the "upper workbr
  frame" are updated; memjective behavior, layout, and one-per-branch
  invariant are unchanged.
- No companion `-impl` skill. `dev-workbr-impl` was a trivial wrapper
  around `brmem get`; agents on a prepared branch use
  `brmem list --base` + `brmem get <key>` directly.
- No plugin frontmatter / schema. Plugin files are pure free-form
  markdown.
- No multi-variant plugin support. One plugin file per pluggable skill;
  branch-type variants (feature, bugfix, spike) are conditionals inside
  the single prompt.

---

## Context & Research

### Relevant Code and Patterns

- **Target CLI files** (each has a `--namespace` help example mentioning
  `workbr`):
  - `packages/twerk-core/src/twerk_core/brmem/put.py:45`
  - `packages/twerk-core/src/twerk_core/brmem/get.py:38`
  - `packages/twerk-core/src/twerk_core/brmem/check.py:38`
  - `packages/twerk-core/src/twerk_core/brmem/copy.py:32`
- **Ref layout semantics** (unchanged by this plan, but relied on by the
  new skill):
  - Base entries: `refs/brmem/base/<encoded-branch>:<key>` (branches with
    `/` encode `/` → `---`).
  - Namespaced entries: `refs/brmem/ns/<ns>/<encoded-branch>:<key>`.
- **Skills to retire** (real dirs + symlinks):
  - `skills/dev-workbr-create/` and `skills/dev-workbr-impl/` are real
    directories with a single `SKILL.md` each.
  - `.agents/skills/dev-workbr-create`, `.agents/skills/dev-workbr-impl`,
    `.claude/skills/dev-workbr-create`, `.claude/skills/dev-workbr-impl`
    are symlinks that chain back to the `skills/<name>/` directory.
- **Narrative cleanup targets**:
  - `skills/dev-memjective-create/SKILL.md:67-69` ("Do not touch the
    workbr plan entry … upper execution frame").
  - `skills/dev-memjective-create/SKILL.md:299` ("Branch already has a
    `workbr` plan entry" in the edge-cases list).
  - `skills/objective-list/SKILL.md:83` (mock rendered issue
    "Implement workbranch primitive …" in the output table example).
- **Public skill pattern to mirror** for `skills/brmem-branch-create/`:
  - `skills/objective-list/SKILL.md` — canonical public SKILL.md
    frontmatter (no `internal: true`, no twerk-internal module refs).
  - `skills/dev-memjective/` + `skills/dev-memjective-create/` — skills
    with sibling files (`templates/`, `references/`) referenced by
    SKILL.md via relative paths, a pattern to reuse for the shipped
    `default-prompt.md`.
- **Test files that use `workbr` purely as a sample namespace string**
  (none test workbr-specific behavior; all can be renamed):
  - `packages/twerk-core/tests/unit/test_brmem_parse_entry_ref.py`
  - `packages/twerk-core/tests/unit/test_brmem_tree_helpers.py`
  - `packages/twerk-core/tests/integration/test_real_brmem_gateway.py`
  - `packages/twerk-core/tests/scenario/test_brmem_cli.py`
  - `packages/twerk-core/tests/scenario/test_memjective_cli.py` (only
    the non-memjective seed rows)
  - `packages/twerk-core/tests/scenario/test_memjective_tree_cli.py`
    (only the non-memjective seed rows)
  - `packages/twerk-core/tests/gateways/test_fake_brmem_gateway.py`

### Institutional Guidance (from AGENTS.md)

- **Public skill authoring** — `skills/brmem-branch-create/SKILL.md` is a
  public user-facing skill: no `dev-` prefix, no `metadata.internal: true`,
  and no references to twerk-internal module paths/classes. Describe
  what CLI operations to call (`brmem put`, `git branch`), not how
  they're implemented.
- **Vendored vs first-party skills** — `skills/<name>/` is canonical;
  `.agents/skills/<name>` and `.claude/skills/<name>` are symlinks
  auto-maintained by the skill-management tooling. Add/remove via
  `npx skills` per the `ns-skill-management` skill, not by hand, so
  symlinks stay consistent.
- **No data migration / compatibility shims** — twerk is pre-release and
  private. The "move into a new house" tenet applies: leave old data
  untouched, do not ship a deprecation window.

### External References

None needed. The work is fully local to the repo.

---

## Key Technical Decisions

- **Skill name: `brmem-branch-create`**, grouped with the `brmem-*`
  family. Action-first, leaves room for future siblings like
  `brmem-branch-<other-action>` without forcing them now.
- **Public skill, not `dev-`**. This is a supported user-facing capability
  intended to survive past prototype. Frontmatter carries no
  `internal: true` flag; SKILL.md body references only CLI surfaces.
- **Plugin location: `.twerk/prompts/brmem-branch-create.md`**. The
  `.twerk/prompts/` directory is introduced here as a shared home for
  any future pluggable skill's prompt (one file per skill, named after
  the skill). This is the first entry.
- **Plugin shape: free-form markdown**. No frontmatter, no schema. The
  agent reads the file as instructions. This keeps the plugin surface
  maximally permissive and forkable.
- **Missing-plugin behavior: populate, don't hide**. If the plugin file
  is missing, the skill writes the shipped default to the path so the
  user sees it in their working tree and can review/commit/edit. No
  hidden inline fallback.
- **Default namespace: base (unnamespaced)**. The shipped default stashes
  to `refs/brmem/base/<slug>:plan.md`. A team plugin can override to a
  namespace, but the default reflects "ad-hoc per-branch scratch" → base.
- **Default bundle: a single `plan.md` entry**. Reproduces the essential
  workbr flow without the `workbr` naming or the nested `plan/plan.md`
  key.
- **One plugin per pluggable skill**. Branch-type variants are expressed
  as conditionals inside a team's single prompt, not as separate files
  in a variants directory.
- **Shipped default lives as a sibling file** (`default-prompt.md`) next
  to `SKILL.md`, not as an inline heredoc inside SKILL.md. This mirrors
  the `templates/` pattern used by `dev-memjective` and makes the
  default directly readable and easier to evolve.
- **Help-text replacement rule**: in `put.py`, `get.py`, `check.py`
  replace `'workbr', 'memjectives'` with just `'memjectives'` (the one
  real plugin namespace we have today) so the example still illustrates
  "a namespace is a plugin." In `copy.py`, drop `'workbr'` and keep
  `'memjectives'`.
- **Test-fixture rename target: `example-plugin`**. Neutral, self-describing,
  and preserves the "namespace = plugin" implication in assertions.
- **Deletion via `npx skills remove`**, not manual `rm -rf`, so the
  `skills/` real directory and both `.agents/skills/` and `.claude/skills/`
  symlinks are cleaned up consistently. Falls back to manual removal only
  if the tool can't handle it (and that fallback removes all three
  locations explicitly).

---

## Open Questions

### Resolved During Planning

- **Should `objective-list/SKILL.md:83`'s fictional `workbranch primitive`
  issue be changed?** Yes. Although `workbranch` is not literally
  `workbr`, the brainstorm's intent is to sever the association with the
  retired concept and pass `rg workbr` cleanly in spirit. Replace with a
  neutral fictional issue title.
- **Does the new skill need any Python code or scenario (`pytest`) tests?**
  No. The skill is pure markdown — an instruction bundle read by an
  agent. Its three verification scenarios (seed-from-default, plugin
  present, already-existing branch) are documented in SKILL.md as
  manual verification and in the plan's verification section, not as
  `pytest` cases. If a thin Python helper is ever extracted, it can
  pick up scenario tests then.
- **Do we rename the `workbr` fixture in `test_memjective_cli.py` and
  `test_memjective_tree_cli.py`?** Yes, but only the seed rows that use
  `workbr` as a "some other namespace" marker. Rows using `memjectives`
  stay as-is — they test the real memjectives subsystem.

### Deferred to Implementation

- **Exact wording of the default plugin prompt** (tone, level of detail,
  whether to include a commented example of a multi-file bundle). Draft
  during implementation; the shipped default must reproduce the
  one-plan-under-base-namespace behavior described in R4 but is
  otherwise free-form.
- **Exact wording of the `dev-memjective-create` narrative edit**. The
  two sites (lines 67-69 and line 299) need rephrasing that preserves
  "leave any pre-existing per-branch plan alone" guidance without
  mentioning `workbr`. Final wording decided during the unit.
- **Exact replacement for the `objective-list` mock issue**. A neutral
  fictional title that doesn't collide with any real twerk concept.
  Pick during implementation.
- **Whether `brmem-branch-create` validates the slug before `git branch`**
  (e.g., aborts if a branch by that name already exists, as
  `dev-workbr-create` does today). Mirror the old skill's pre-flight
  checks unless the plugin explicitly overrides them. Final contract
  text goes in SKILL.md during U1.

---

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should
> treat it as context, not code to reproduce._

```
┌──────────────────────────────────────────────────────────────┐
│ brmem-branch-create (shipped public skill, markdown only)    │
│                                                              │
│   1. Ensure .twerk/prompts/brmem-branch-create.md exists:    │
│        if missing → write skill's default-prompt.md there    │
│                     → report "seeded default plugin"         │
│   2. Read plugin file verbatim as instructions.              │
│   3. Following plugin instructions, decide:                  │
│        - slug (kebab-case branch name)                       │
│        - list of (key, source-content) pairs                 │
│   4. Pre-flight: git repo? branch <slug> absent? HEAD sane?  │
│   5. git branch <slug> HEAD       (no checkout)              │
│   6. for (key, content) in bundle:                           │
│        brmem put <key> --branch <slug> --file <path>         │
│        (base namespace by default; plugin may specify one)   │
│   7. Report: branch name, stashed keys, plugin path.         │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
       brmem (unchanged primitive — put/get/list/check/copy)
```

Narrative-level layout of the resulting skill directory:

```
skills/brmem-branch-create/
├── SKILL.md             # workflow, rules, edge cases, verification
└── default-prompt.md    # text seeded into .twerk/prompts/... on first run
```

The plugin directory introduced in the user's repo on first invocation:

```
.twerk/prompts/
└── brmem-branch-create.md    # seeded from default-prompt.md; editable
```

---

## Implementation Units

- U1. **Ship the `brmem-branch-create` skill**

**Goal:** Create a new public, shipped skill that owns the "create a
branch and prefill curated context" ergonomic, with a user-editable
plugin surface.

**Requirements:** R2, R3, R4

**Dependencies:** None

**Files:**

- Create: `skills/brmem-branch-create/SKILL.md`
- Create: `skills/brmem-branch-create/default-prompt.md`
- Create: `.agents/skills/brmem-branch-create` (symlink → `../../skills/brmem-branch-create`)
- Create: `.claude/skills/brmem-branch-create` (symlink via `npx skills` install flow)

**Approach:**

- `SKILL.md` frontmatter: `name: brmem-branch-create`, descriptive
  trigger text covering "stash a plan on a new branch", "prep a prefilled
  branch", etc. **No `metadata.internal: true`** (public skill). Allowed
  tools: `Bash(git branch *)`, `Bash(git rev-parse *)`, `Bash(brmem *)`,
  `Read`, `Write`.
- `SKILL.md` body describes the 7-step workflow from the High-Level
  Technical Design. Uses only public CLI surfaces (`git`, `brmem`) —
  never `twerk_core` internals, per AGENTS.md's public-skill rule.
- Workflow steps include the seed-from-default mechanism: check for the
  plugin file at a relative-to-repo-root path (`.twerk/prompts/brmem-branch-create.md`);
  if missing, create the parent directory and copy the contents of
  `./default-prompt.md` (sibling file) into it; report the one-time
  seeding in the final summary.
- Pre-flight checks: in a git repo; target branch does not already exist;
  HEAD is not detached. Defer the "branch already exists" behavior to
  whatever the plugin says (the default errors, matching
  `dev-workbr-create`'s behavior today).
- Rule: never check out the new branch, never modify the working tree
  beyond the one-time seed of `.twerk/prompts/brmem-branch-create.md`.
- `default-prompt.md` contents (directional): instruct the agent to
  derive a kebab-case slug from the plan's title or first meaningful
  heading, and to stash a single entry keyed `plan.md` containing the
  plan file verbatim, in the base namespace. No frontmatter.
- Installation of symlinks goes through `ns-skill-management` /
  `npx skills`. If doing manual install, create both the
  `.agents/skills/brmem-branch-create` and `.claude/skills/brmem-branch-create`
  symlinks consistently.

**Patterns to follow:**

- Public skill frontmatter shape: `skills/objective-list/SKILL.md`
  (lines 1-12, including the `PUBLIC SKILL` comment banner).
- Skill-with-sibling-files layout: `skills/dev-memjective/` and
  `skills/dev-memjective-create/` (template sibling files referenced by
  relative path from `SKILL.md`).

**Test scenarios:** No automated `pytest` coverage. This is a
markdown-only skill; no Python surface to assert against.

Document these as **manual verification scenarios** in the SKILL.md and
reproduce them in this plan's own Verification section:

- Happy path (seed-from-default): Invoke the skill in a repo with no
  `.twerk/prompts/brmem-branch-create.md` present and a plan file
  `/tmp/plan.md`. Expected outcomes: (a) `.twerk/prompts/brmem-branch-create.md`
  exists with the shipped default contents; (b) `git branch --list <slug>`
  shows the new branch; (c) `brmem list --branch <slug> --base` shows a
  single `plan.md` entry; (d) `brmem get plan.md --branch <slug>`
  round-trips the original plan; (e) the working tree contains exactly
  one new file (the plugin file itself).
- Happy path (plugin present, used verbatim): Invoke the skill with a
  pre-existing custom plugin (e.g., one that stashes both `plan.md` and
  `refs/intent.md`). Expected outcomes: (a) the plugin file is byte-for-byte
  unchanged afterwards; (b) both stashed keys round-trip; (c) the
  working tree gains no additional files.
- Edge case (branch already exists): Invoke the skill with a slug that
  matches an existing branch. Expected outcome with the shipped default:
  aborts with a clear error (no partial branch or brmem state).

**Verification:**

- `skills/brmem-branch-create/SKILL.md` exists and does not reference
  any `twerk_core.*` module or class.
- `skills/brmem-branch-create/default-prompt.md` exists, is non-empty,
  and describes the single-`plan.md`-under-base behavior.
- `.agents/skills/brmem-branch-create` and `.claude/skills/brmem-branch-create`
  resolve (readlink or equivalent) to the canonical `skills/brmem-branch-create/`.
- The three manual verification scenarios above pass in a scratch repo.

---

- U2. **Remove `workbr` from `brmem` CLI help text**

**Goal:** Drop every `workbr` mention from the live `brmem` command
surface so help output reflects only real plugin namespaces.

**Requirements:** R1, R6

**Dependencies:** None

**Files:**

- Modify: `packages/twerk-core/src/twerk_core/brmem/put.py` (line 45)
- Modify: `packages/twerk-core/src/twerk_core/brmem/get.py` (line 38)
- Modify: `packages/twerk-core/src/twerk_core/brmem/check.py` (line 38)
- Modify: `packages/twerk-core/src/twerk_core/brmem/copy.py` (line 32)

**Approach:**

- In `put.py`, `get.py`, `check.py`: replace the example list
  `'workbr', 'memjectives'` with just `'memjectives'` — preserves the
  "namespace = real plugin" framing with a single concrete example.
- In `copy.py`: the help text is `"Entry namespace (e.g. 'memjectives',
  'workbr')."`. Drop `'workbr'`; keep `'memjectives'`.
- No behavioral changes, no option changes, no import changes. The
  change is strictly in the `help=` string values.

**Patterns to follow:**

- Existing help-text style in the same files — short, parenthesized
  examples, period-terminated.

**Test scenarios:**

- Test expectation: none — pure help-text wording change with no
  behavioral surface. Existing scenario tests for `brmem put/get/check/copy`
  assert outputs and exit codes, not help-text content; no regression
  risk. If a `--help` snapshot test existed it would need updating, but
  one does not.

**Verification:**

- `rg "'workbr'" packages/twerk-core/src/twerk_core/brmem/` returns zero
  matches.
- `just` (lint + format + types + tests) runs green.

---

- U3. **Rename `workbr` sample namespace in tests**

**Goal:** Replace every test-fixture use of `workbr` with a neutral
sample namespace name so the retired term does not linger in assertions
or seed data.

**Requirements:** R1

**Dependencies:** None (independent of U2)

**Files:**

- Modify: `packages/twerk-core/tests/unit/test_brmem_parse_entry_ref.py`
- Modify: `packages/twerk-core/tests/unit/test_brmem_tree_helpers.py`
- Modify: `packages/twerk-core/tests/integration/test_real_brmem_gateway.py`
- Modify: `packages/twerk-core/tests/scenario/test_brmem_cli.py`
- Modify: `packages/twerk-core/tests/scenario/test_memjective_cli.py`
  (only the non-memjective seed rows)
- Modify: `packages/twerk-core/tests/scenario/test_memjective_tree_cli.py`
  (only the non-memjective seed rows)
- Modify: `packages/twerk-core/tests/gateways/test_fake_brmem_gateway.py`

**Approach:**

- Rename the literal string `workbr` to `example-plugin` in every
  occurrence listed above, along with any expected-output assertions
  that embed the name (e.g., `refs/brmem/ns/workbr/...` → `refs/brmem/ns/example-plugin/...`).
- Do **not** rename occurrences where the test is specifically
  exercising the `memjectives` namespace or any other real namespace;
  only the `workbr` sample strings change.
- Keep test semantics identical: the renaming is a pure find-and-replace
  within each file, followed by a `just` run to confirm nothing broke.

**Patterns to follow:**

- Existing neutral sample names in the codebase (`memjectives` where
  real, otherwise short descriptive kebab-case).

**Test scenarios:**

- Test expectation: none of these tests gain new assertions; they are
  renamed in place and must still pass. The change is "the test suite
  continues to pass with the renamed fixture string" — verified by
  running `just` after the change.

**Verification:**

- `rg "\bworkbr\b" packages/twerk-core/tests/` returns zero matches.
- `just` runs green (in particular, all renamed scenario/integration/
  unit tests still pass).

---

- U4. **Purge `workbr` narrative from `dev-memjective-create`**

**Goal:** Remove references to the "workbr plan entry" and "upper
execution frame" so `dev-memjective-create/SKILL.md` stands on its own
without relying on the retired concept.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**

- Modify: `skills/dev-memjective-create/SKILL.md` (lines 67-69 and line 299)

**Approach:**

- Lines 67-69 sit in the "Rules" section. Rephrase to preserve the
  actual operational guidance — "do not overwrite any pre-existing
  per-branch plan entry the memjective is sitting beneath" — without
  mentioning `workbr` or the "upper execution frame" metaphor. A short
  rule like "Do not touch per-branch plan entries in the base namespace;
  the memjective sits alongside them, not inside them" captures the
  intent without anchoring it to the retired concept. Final wording is
  decided during implementation.
- Line 299 sits in the "Edge cases" list. Either drop the bullet
  entirely (it's a variant of "don't touch pre-existing plans," which
  the rewritten rule above now covers) or rephrase to match the new
  general form.
- Do not modify any other sections: the one-per-branch invariant,
  namespace key conventions, and workflow stay exactly as-is.

**Patterns to follow:**

- Surrounding bullet rhythm and tone in the "Rules" and "Edge cases"
  sections of `dev-memjective-create/SKILL.md`.

**Test scenarios:**

- Test expectation: none — documentation-only edit.

**Verification:**

- `rg workbr skills/dev-memjective-create/` returns zero matches.
- `skills/dev-memjective-create/SKILL.md` reads coherently end-to-end
  (manual review). The "Rules" and "Edge cases" sections still prevent
  the memjective from clobbering a pre-existing plan entry.

---

- U5. **Replace the `workbranch` mock in `objective-list`**

**Goal:** Remove the fictional `workbranch primitive` issue from the
sample output in `objective-list/SKILL.md` so even spiritually-related
references to the retired concept disappear.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**

- Modify: `skills/objective-list/SKILL.md` (line 83)

**Approach:**

- Replace the mocked row
  `#40   ● open     Implement workbranch primitive: branch-embedded c…    2h ago`
  with a neutral fictional issue title that doesn't reference the
  retired concept or any real in-flight twerk feature (e.g., something
  generic like "Audit CLI help-text examples" — final wording chosen
  during implementation). Keep the column widths, status badge, and
  relative-time format identical so the table still illustrates the
  same render shape.

**Patterns to follow:**

- Existing mock row on the adjacent line (`#34   ● open     Explore
  using pluggy …`).

**Test scenarios:**

- Test expectation: none — mock output text only.

**Verification:**

- `rg -w 'workbr|workbranch' skills/objective-list/` returns zero matches.
- The sample table in `objective-list/SKILL.md` still visually
  demonstrates a two-row render.

---

- U6. **Delete `dev-workbr-create` and `dev-workbr-impl`**

**Goal:** Fully remove the retired skills from disk — real directories
and all symlinks — so `rg workbr` hits zero outside the origin
brainstorm and git history.

**Requirements:** R1, R7, R8 (leave existing `refs/brmem/ns/workbr/**`
data untouched).

**Dependencies:** U1 (ship the replacement first so users have a
successor skill visible), U2-U5 (preferable to delete after narrative
and help-text references are gone, so no in-tree reference briefly
points at a dead skill name). Hard dependency is only on U1; U2-U5 are
soft preferences.

**Files:**

- Delete: `skills/dev-workbr-create/` (whole directory)
- Delete: `skills/dev-workbr-impl/` (whole directory)
- Delete: `.agents/skills/dev-workbr-create` (symlink)
- Delete: `.agents/skills/dev-workbr-impl` (symlink)
- Delete: `.claude/skills/dev-workbr-create` (symlink)
- Delete: `.claude/skills/dev-workbr-impl` (symlink)

**Approach:**

- Prefer `npx skills remove dev-workbr-create --agent codex claude-code -y`
  and the same for `dev-workbr-impl` per the `ns-skill-management`
  convention in `AGENTS.md`. The tool removes the real directory under
  `skills/` and cleans up the `.agents/skills/` and `.claude/skills/`
  symlinks in one pass.
- If `npx skills remove` cannot handle the removal cleanly, fall back
  to manual deletion of all six paths listed above. Confirm symlinks
  are gone (`readlink` returns nothing) before finishing.
- **Do not** touch any `refs/brmem/ns/workbr/**` entries in local
  repositories. Those are local user data, outside this plan's scope.

**Patterns to follow:**

- The `ns-skill-management` workflow for skill removal (see
  `.agents/skills/ns-skill-management/SKILL.md`).

**Test scenarios:**

- Test expectation: none — deletions of markdown skills with no Python
  behavior.

**Verification:**

- `ls skills/dev-workbr-create skills/dev-workbr-impl` fails with
  no-such-file for both.
- `ls .agents/skills/dev-workbr-create .agents/skills/dev-workbr-impl
   .claude/skills/dev-workbr-create .claude/skills/dev-workbr-impl`
  fails with no-such-file for all four.
- `rg workbr` across the repo returns matches only inside
  `docs/brainstorms/retire-workbr-for-brmem.md` and this plan itself.
- `just` runs green (nothing depended on the removed skills).

---

## Delivery & PR Split

Ship as a **2-PR Graphite stack**. Split rationale: PR #1 is a design PR
(new user-facing skill + precedent-setting convention) that benefits
from focused review; PR #2 is mechanical cleanup whose review posture
is "does `rg workbr` come out clean and does `just` stay green?" —
different lens, different pace.

### PR #1 — Ship `brmem-branch-create`

- **Units:** U1
- **Shape:** design / feature PR. Introduces the new public skill, the
  shipped default prompt, and the `.twerk/prompts/` convention.
- **Reviewer focus:** SKILL.md wording, default-prompt content, and
  the precedent set by `.twerk/prompts/` as the shared home for future
  pluggable-skill prompts.
- **Standalone:** the new skill works alongside the still-present
  `dev-workbr-create` and `dev-workbr-impl`; `rg workbr` still returns
  hits while this PR is open (expected — cleanup lives in PR #2).

### PR #2 — Retire `workbr` (stacked on PR #1)

- **Units:** U2, U3, U4, U5, U6
- **Shape:** mechanical cleanup. Help-text wording, test-fixture
  rename to `example-plugin`, narrative edits in sibling skills,
  deletion of retired skills and their symlinks.
- **Reviewer focus:** verifying the success criteria (`rg workbr` zero,
  `just` green) end-to-end; spot-checking that no assertion semantics
  changed during the test-fixture rename.
- **Success criterion realized here:** R1 (`rg workbr` zero outside
  the origin brainstorm and git history) is fully satisfied only at
  the end of this PR — it is explicitly not a PR #1 gate.

Unit ordering **within** PR #2 is flexible; U2-U5 are mutually
independent, and U6's dependency on U1 is already satisfied (PR #1 has
landed). U6's soft preference for U2-U5 to land first is naturally met
by committing U2-U5 earlier in the PR #2 series. Standard Graphite flow
(`gt create`, `gt modify`, `gt submit --no-interactive`) per the repo's
`graphite` skill conventions.

---

## System-Wide Impact

- **Interaction graph:** `brmem-branch-create` replaces the
  `dev-workbr-create` / `dev-workbr-impl` skill pair. Any in-repo
  instructions or prompts that formerly pointed at `dev-workbr-*` (none
  survive after U4-U6) should now reference `brmem-branch-create` or
  describe the pattern directly (`brmem list --base` + `brmem get`).
- **Error propagation:** Unchanged. `brmem`'s exit-code contract (0 ok,
  1 not found, 2 validation/failure) is untouched; the new skill calls
  `brmem put` in the same way `dev-workbr-create` did.
- **State lifecycle risks:** The one net-new piece of on-disk state is
  `.twerk/prompts/brmem-branch-create.md`, seeded on first invocation
  in any given repo. Users may see an unexpected new file in `git status`
  the first time they run the skill; this is intended and reported in
  the skill's output. Nothing else in the working tree is touched.
- **API surface parity:** `brmem`'s command flags and behavior are
  unchanged. Only `--namespace` help-text examples change. No downstream
  consumer of `brmem` exit codes or outputs is affected.
- **Integration coverage:** Existing `brmem` scenario and integration
  tests continue to cover the read/write/list/check/copy surfaces; they
  retain their assertions after the `workbr` → `example-plugin` rename.
- **Unchanged invariants:** (a) `brmem` ref layout semantics
  (`refs/brmem/base/<branch>:<key>` and
  `refs/brmem/ns/<ns>/<branch>:<key>`) — explicitly preserved. (b) The
  memjective one-per-branch invariant and its `memjectives` namespace
  usage — explicitly preserved. (c) Any pre-existing
  `refs/brmem/ns/workbr/**` entries on users' local machines — explicitly
  preserved (no rewrite, rename, or delete).

---

## Risks & Dependencies

| Risk                                                                                                                                                                                       | Mitigation                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test fixture rename (`workbr` → `example-plugin`) accidentally renames a memjective-related assertion that was using `workbr` as an "other namespace" marker, and the semantic is changed. | Scope the rename per-file and re-run `just` after each file to catch assertion drift; in `test_memjective_cli.py` and `test_memjective_tree_cli.py`, only rename the seed rows that use `workbr` — rows referencing `memjectives` stay untouched. |
| Deleting `dev-workbr-create` / `dev-workbr-impl` leaves dangling symlinks under `.agents/skills/` or `.claude/skills/`.                                                                    | Delete via `npx skills remove` (canonical path) so all three locations stay in sync. If falling back to manual deletion, explicitly `readlink` each symlink target to confirm the chain is clean.                                                 |
| Users on older worktrees still have local `refs/brmem/ns/workbr/**` entries and get surprised when `brmem list --namespace workbr` still returns hits.                                     | Explicitly in-scope: those entries stay readable. The brainstorm's non-goal stance is documented in the origin doc, and the new skill's writeup mentions that existing local workbr data remains accessible via `brmem get --namespace workbr`.   |
| First-run side-effect of the new skill: a new file appears in `.twerk/prompts/`, which the user might not expect.                                                                          | The skill's final "report" explicitly names the seeded file so the user sees it and can review/commit/gitignore as they prefer. `.twerk/prompts/` is the convention going forward; teams will develop their own norm for whether to commit it.    |
| `npx skills remove` breaks or is unavailable, leaving partial state mid-removal.                                                                                                           | Fallback removal procedure (manual `rm -rf` + `rm` on symlinks) is spelled out in U6's Approach and Verification sections; the unit is not complete until all six paths are absent.                                                               |

---

## Documentation / Operational Notes

- No user-facing docs live outside the brainstorm and affected `SKILL.md`
  files. No changelog entry is required (twerk is pre-release).
- No rollout, feature flag, or monitoring concerns — all changes are
  static/in-repo and take effect on `main` merge.
- After this plan lands, agents that previously would have invoked
  `/dev-workbr-create` will be surfaced to `/brmem-branch-create`
  through normal skill discovery. No migration of existing
  local `refs/brmem/ns/workbr/**` data is performed.

---

## Sources & References

- **Origin document:** [docs/brainstorms/retire-workbr-for-brmem.md](docs/brainstorms/retire-workbr-for-brmem.md)
- Related code: `packages/twerk-core/src/twerk_core/brmem/` (CLI surface), `skills/dev-workbr-create/SKILL.md`, `skills/dev-workbr-impl/SKILL.md` (retiring), `skills/dev-memjective-create/SKILL.md` (narrative cleanup), `skills/objective-list/SKILL.md` (mock cleanup)
- Related skills: `.agents/skills/ns-skill-management/SKILL.md` (`npx skills` install/remove flow)
- AGENTS.md: public-skill authoring rule, dev-skill naming convention, vendored-vs-first-party skills, CLI scenario testing convention
