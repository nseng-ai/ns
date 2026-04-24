# Retire workbr; rely on brmem + a pluggable `brmem-branch-create` skill

_Status: brainstorm / requirements. 2026-04-24._

## Context

"workbr" was introduced as an ergonomic way to stash a plan onto a freshly
created branch so an agent in a later worktree could pick it up and execute.
In practice, it is not a real subsystem — it is:

- A **namespace-name convention** (`--namespace workbr`) reserving a slot in
  `brmem` for one file (`plan/plan.md`) per branch, plus
- Two thin dev-only skills, `dev-workbr-create` and `dev-workbr-impl`, that
  wrap `brmem put` and `brmem get` against that slot, plus slug generation
  and `git branch <slug> HEAD`.

The underlying storage is already `brmem`. So "workbr" adds a named concept,
two skills, and docs — but no capability. Worse, it misuses what a `brmem`
namespace actually is: a plugin-style ownership boundary where a tool
"takes over" a subpart of `brmem` and applies its own semantics across
_all_ branches. `workbr` repurposed namespace-as-plugin to mean "ad-hoc
scratch slot per branch," which pollutes the mental model.

The intended end state has three layers:

1. **`brmem` stays fully untouched.** It is a pure storage primitive —
   `put / get / check / list / copy` — and does not know about branches in
   the sense of creating them. Ad-hoc branch stashing lives in the base
   (unnamespaced) entries at `refs/brmem/base/<branch>`, which is the
   simplest mental model.
2. **A new shipped skill, `brmem-branch-create`,** owns the mechanical
   choreography of "create a branch and prefill its memory." It calls
   `git branch <slug> HEAD` and a series of `brmem put` commands.
3. **A user-editable plugin prompt** — a free-form markdown file at
   `.twerk/prompts/brmem-branch-create.md` in the current repo — supplies
   the opinions: slug rule, which files to stash, what content to
   generate, any team conventions. The file is always present after first
   invocation: if it is missing, the skill **populates it with a shipped
   default** (mirroring the old workbr flow) before running. Users see
   the default, understand it, and can edit it. There is no hidden
   fallback prompt — the plugin is always a real file on disk.

`.twerk/prompts/` is intentionally a **shared prompts directory** for any
future pluggable twerk skill, not a directory of variants of one skill.
If a later skill (say `memjective-next`) also grows a plugin hook, it
lands at `.twerk/prompts/<skill-name>.md` alongside this one. Each
pluggable skill has exactly one plugin file, named after the skill.

This keeps `brmem` clean and composable, puts the one useful workbr
ergonomic (one-shot branch + stash) behind a single discoverable skill,
and makes the opinionated part (what to stash, how to slug) team-pluggable
rather than hard-coded.

## Problem

1. `workbr` is a named concept with no subsystem behind it. It invites
   mental overhead and future callers to reach for "what namespace should
   I use?" when the answer is almost always "none, use base."
2. It misuses `brmem`'s namespace semantics. Namespaces are plugin
   boundaries (e.g., `memjectives` — a subsystem that owns its slot).
   Using one for ad-hoc per-branch scratch confuses the contract.
3. The two skills (`dev-workbr-create`, `dev-workbr-impl`) are thin,
   opinionated, and un-fork-friendly. A team with different conventions
   (different slug rule, different curated-memory shape, a post-stash
   push step) has no extension point; they would have to edit
   `dev-workbr-create` itself.
4. There is still a real ergonomic need: "create a branch and prefill it
   with curated context" in one agent action. That need should be met
   once, behind a shipped skill with a clean plugin surface, not by
   reinvention in every caller.

## Goals

- Remove the `workbr` concept from the user-visible surface of twerk:
  - Delete `skills/dev-workbr-create/` and `skills/dev-workbr-impl/`.
  - Stop using `workbr` as an example namespace in `brmem` help text and
    related docs.
- Ship a new skill, `brmem-branch-create`, that:
  - Takes a plan/context source as input.
  - Looks for `.twerk/prompts/brmem-branch-create.md` in the current repo.
    If absent, writes the shipped default prompt to that path so the user
    can see and edit it, then proceeds.
  - Uses the contents of that file verbatim as plugin instructions for an
    agent to decide slug, files, and content. The shipped default
    reproduces the old workbr flow (kebab-case slug from the plan
    content; single `plan.md` under base namespace).
  - Creates the branch via `git branch <slug> HEAD` — the branch is never
    checked out, the working tree is not otherwise modified.
  - Stashes files via `brmem put` (base namespace by default, unless the
    plugin specifies otherwise).
- Update `memjective` and any other in-repo references so the retired
  "upper workbr frame" language disappears.
- Leave `brmem`'s CLI surface unchanged except for removing the `workbr`
  example from namespace help text.

## Non-goals

- **No `brmem` CLI additions.** In particular, no `--create-branch` flag
  on `brmem put`. Branch creation lives in the new skill, which calls
  `git` directly.
- **No remote / autonomous execution work.** `refs/brmem/**` stay local
  only. Pushable `brmem` refs and remote handoff are a separate,
  later-stage design.
- **No richer "curated bundle" primitive in `brmem`.** Multi-file stashing
  is achieved by the skill sequencing multiple `brmem put` calls under
  the plugin's direction. `brmem put` stays single-file.
- **No migration of existing data.** Any `refs/brmem/ns/workbr/**`
  entries already on users' machines are left untouched. They are local,
  harmless, and still readable with `brmem get --namespace workbr` if
  needed. No rewrite, no rename, no deletion.
- **No memjective redesign.** Only the narrative references to "workbr
  plan frame" get updated; memjective behavior is unchanged.
- **No companion `-impl` skill.** `dev-workbr-impl` was a trivial wrapper
  around `brmem get`. No replacement is needed — any agent that lands on
  a prepared branch can run `brmem list --base` to see what's stashed and
  `brmem get <key>` to read it.
- **No plugin frontmatter / schema.** Plugin files are pure free-form
  markdown. No YAML frontmatter, no required fields. The agent reads the
  file as instructions.
- **No multi-variant plugin support.** Each pluggable skill has exactly
  one plugin file. Teams that need branch-type variants (feature, bugfix,
  spike) express that as conditionals inside their single plugin prompt.

## Design sketch

### Architecture

```
┌──────────────────────────────────────────────┐
│ brmem-branch-create (shipped skill)          │
│                                              │
│   1. Ensure plugin file exists:              │
│        .twerk/prompts/brmem-branch-create.md │
│        if missing → write shipped default    │
│   2. Read plugin file; follow its            │
│      instructions to decide:                 │
│        - slug                                │
│        - list of (key, content) pairs        │
│   3. git branch <slug> HEAD                  │
│   4. for each (key, content):                │
│        brmem put <key> --branch <slug>       │
│                  --file <tmp>                │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
                brmem (unchanged primitive)
```

- `brmem-branch-create` is the only shipped entry point. It owns the
  orchestration.
- The plugin is data, not code — a single free-form markdown file the
  agent reads and follows. No Python plugin system, no entry points, no
  frontmatter.
- `brmem` is completely unaware of the skill or the plugin.

### Shipped skill: `brmem-branch-create`

- Location: `skills/brmem-branch-create/SKILL.md` (public; _not_
  `dev-`-prefixed, because this is a supported user-facing skill).
- Inputs (from the invoking agent / user): the plan or context source —
  typically a path to a plan file, or inline content. Anything the plugin
  needs to produce its outputs.
- Behavior:
  1. **Ensure plugin file exists.** Check
     `.twerk/prompts/brmem-branch-create.md` in the repo root. If
     missing, create the parent directory if needed and write the shipped
     default prompt to the file. Report that the default was just
     written so the user knows to review/commit it.
  2. **Read plugin file.** Load the file verbatim. This is the
     instruction body for the next step.
  3. **Decide slug + content bundle.** The agent follows the plugin
     instructions to produce (a) a kebab-case slug and (b) a list of
     `(key, path-or-content)` pairs.
  4. **Create the branch.** `git branch <slug> HEAD`. Never `git checkout`;
     the branch is never checked out.
  5. **Stash the bundle.** For each entry, `brmem put <key> --branch
     <slug> --file <path>`. Base namespace by default. If the plugin
     explicitly requests a namespace (rare — this would mean the team
     wants its own `brmem` plugin boundary), honor it.
  6. **Report.** Echo the created branch name, the stashed keys, and the
     plugin file path used.

### Shipped default plugin (written to `.twerk/prompts/brmem-branch-create.md` on first run)

The default prompt's behavior:

- Slug: kebab-case derived from the provided plan content (title / first
  meaningful heading).
- Bundle: a single entry, `plan.md`, whose content is the provided plan
  file verbatim, stashed under base namespace.
- This reproduces the old workbr flow
  (`refs/brmem/base/<slug>:plan.md` instead of
  `refs/brmem/ns/workbr/<slug>:plan/plan.md`) with no workbr-namespace
  baggage.

The default prompt text is a constant shipped inside the skill
implementation (e.g., a sibling file like
`skills/brmem-branch-create/default-prompt.md`, or an inline
heredoc in the skill), and is written verbatim to
`.twerk/prompts/brmem-branch-create.md` when that file is missing.

### Side-effects

Writing the default plugin file _does_ modify the user's working tree
(a new file appears at `.twerk/prompts/brmem-branch-create.md`). This is
a one-time configuration side-effect, not a per-branch action, and the
user is told in the skill's report that the file was created. The
branch-prep operation itself continues not to modify the working tree
beyond this initial seeding.

### User plugin contract

The plugin is a free-form markdown file at
`.twerk/prompts/brmem-branch-create.md`. No frontmatter, no schema — the
agent reads it and follows it. Typical contents:

- Slug rule (e.g., "slug is `<ticket-id>-<short-name>`, derived from the
  plan header").
- Bundle composition (e.g., "stash `plan.md`, `constraints.md` generated
  from the plan's 'Constraints' section, and `refs/ticket.md` copied from
  the ticket URL").
- Any team conventions (e.g., "if a branch already exists with the same
  slug, error instead of proceeding").

Because the plugin is a prompt, not code, it composes naturally with the
agent's existing reasoning. Teams iterate on the plugin without changing
twerk.

`.twerk/prompts/` is reserved as the canonical location for any future
pluggable skill's prompt. Adding a new pluggable skill later means
shipping the skill under `skills/<name>/` and documenting that its plugin
lives at `.twerk/prompts/<name>.md`.

## Scope of changes

### Files to delete

- `skills/dev-workbr-create/` (whole directory)
- `skills/dev-workbr-impl/` (whole directory)

### Files to add

- `skills/brmem-branch-create/SKILL.md` — the new shipped skill.
- `skills/brmem-branch-create/default-prompt.md` (or equivalent) — the
  shipped default prompt body. This is the exact text the skill writes
  to `.twerk/prompts/brmem-branch-create.md` on first invocation when
  that file is missing. Keeping it as a sibling file (rather than an
  inline heredoc inside `SKILL.md`) makes the default directly readable
  and easier to evolve.

### Files to modify

- `packages/twerk-core/src/twerk_core/brmem/put.py` — remove `'workbr'`
  from the `--namespace` help text example at
  `packages/twerk-core/src/twerk_core/brmem/put.py:45`. Replace with
  `'memjectives'` (a real plugin namespace) only, or drop the example
  entirely.
- `packages/twerk-core/src/twerk_core/brmem/check.py`,
  `brmem/get.py`, `brmem/copy.py` — remove `workbr` from any example
  help text / docstrings.
- `skills/dev-memjective-create/SKILL.md` — drop the "upper workbr frame"
  language. Memjective's one-per-branch invariant stands on its own
  without referring to workbr.
- `skills/objective-list/SKILL.md` — remove any workbr reference.
- Test files that use `workbr` as an example namespace string
  (`packages/twerk-core/tests/unit/test_brmem_tree_helpers.py`,
  `tests/unit/test_brmem_parse_entry_ref.py`,
  `tests/integration/test_real_brmem_gateway.py`,
  `tests/scenario/test_memjective_cli.py`,
  `tests/scenario/test_brmem_cli.py`,
  `tests/scenario/test_memjective_tree_cli.py`,
  `tests/gateways/test_fake_brmem_gateway.py`) — rename the example
  namespace string from `workbr` to something neutral (e.g.,
  `example-plugin`) so fixtures reflect the "namespace = plugin" model
  rather than the retired `workbr` one. Tests that specifically exercise
  memjective keep `memjectives` since that _is_ a real plugin namespace.

### New tests

- Scenario test: `brmem-branch-create` invoked in a repo with no
  `.twerk/prompts/brmem-branch-create.md` present. Expected: the file is
  created with the default prompt contents, a new branch is created
  (visible in `git branch`), a `plan.md` entry is stashed at
  `refs/brmem/base/<slug>:plan.md` round-trippable via `brmem get`, and
  the working tree contains exactly one new file (the plugin file).
- Scenario test: `brmem-branch-create` invoked with a custom
  `.twerk/prompts/brmem-branch-create.md` already present (e.g., a
  plugin that stashes two files instead of one). Expected: the existing
  plugin file is used verbatim (not overwritten), both entries round-trip,
  and the working tree gains no additional files.
- Scenario test: `brmem-branch-create` invoked against an
  already-existing branch. Behavior is defined by the plugin (default:
  error or no-op on branch creation, still stashes — pick one during
  implementation).

## Success criteria

- `rg workbr` across the repo returns zero hits outside this brainstorm
  doc and historical git log.
- Running `brmem-branch-create` in a repo with no
  `.twerk/prompts/brmem-branch-create.md` writes the default prompt to
  that path, then creates a branch plus a `plan.md` entry at
  `refs/brmem/base/<slug>:plan.md`, reproducing the essential workbr
  behavior without any workbr naming. The plugin file is left in the
  working tree for the user to review/commit.
- Running `brmem-branch-create` in a repo that _has_
  `.twerk/prompts/brmem-branch-create.md` uses that file verbatim without
  touching or overwriting it.
- `dev-memjective-create` and `objective-list` still read coherently
  without any "workbr" reference.
- `brmem`'s CLI surface is unchanged aside from example help text.

## Assumptions

- `refs/brmem/ns/workbr/**` entries in users' existing local repos are
  not actively relied upon. They remain readable via
  `brmem get --namespace workbr` after this change; we are just dropping
  the convention that anything new should use that namespace.
- `twerk` is pre-release and private, so breaking the "workbr" name
  without a deprecation window is acceptable (consistent with
  `CLAUDE.md`'s "we can break backwards compatibility freely").
- No tooling outside this repo currently assumes `--namespace workbr` as
  a fixed convention.
- The skill system honors a plain `skills/<name>/SKILL.md` without a
  `dev-` prefix for public, user-facing skills. (If a frontmatter flag is
  needed for public vs internal, set it accordingly per AGENTS.md's
  "Dev Skill Naming Convention" section.)

## Decisions (formerly open questions, now resolved)

1. **Skill name:** `brmem-branch-create`. Groups it with the `brmem-*`
   family, describes the action directly, and leaves room for sibling
   skills (`brmem-branch-<other-action>`) if they ever emerge.
2. **Plugin multiplicity per skill:** one plugin file per pluggable skill.
   `.twerk/prompts/` is a shared prompts directory for _different_
   pluggable skills — not variants of one skill. Branch-type variants
   (feature, bugfix, spike) are expressed inside the single plugin prompt
   as conditionals.
3. **Plugin shape:** pure free-form markdown. No frontmatter, no schema.
4. **Missing-plugin behavior:** populate, don't hide. If
   `.twerk/prompts/brmem-branch-create.md` is missing, the skill writes
   the shipped default to that path (a visible, editable file) before
   using it. No silent inline fallback. The user sees what ran, can
   edit it, and can commit it.

## Verification

- `just` (lint + format + types + tests) runs green.
- Manual (in a scratch repo or worktree):
  ```
  # No plugin present → default is written and used
  rm -f .twerk/prompts/brmem-branch-create.md
  invoke brmem-branch-create with a plan file /tmp/plan.md
  cat .twerk/prompts/brmem-branch-create.md   # default prompt visible
  git branch --list <slug>                    # exists
  brmem list --branch <slug> --base           # shows plan.md
  brmem get plan.md --branch <slug>           # round-trips

  # Plugin already present → used verbatim, not overwritten
  cat > .twerk/prompts/brmem-branch-create.md <<'EOF'
  Slug: use the first line of the plan as kebab-case.
  Stash plan.md (the plan itself) and refs/intent.md (a one-liner
  summarizing the plan in the first person).
  EOF
  invoke brmem-branch-create with /tmp/plan.md
  brmem list --branch <slug> --base           # plan.md, refs/intent.md
  diff .twerk/prompts/brmem-branch-create.md <(cat <<'EOF'
  Slug: use the first line of the plan as kebab-case.
  Stash plan.md (the plan itself) and refs/intent.md (a one-liner
  summarizing the plan in the first person).
  EOF
  )                                           # unchanged
  ```
- Confirm `rg workbr packages/ skills/` returns zero matches after the
  change.
- Confirm no scenario test still asserts against `--namespace workbr`.
