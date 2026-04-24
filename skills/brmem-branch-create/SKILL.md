---
name: brmem-branch-create
description: "Create a branch via a repo-local branch-policy plugin, then stash the current session's plan/context onto that branch with `brmem`. The skill picks the bundle and suggested slug; `.twerk/prompts/brmem-branch-create.md` only handles repo-specific branch creation. Use when the user wants to park session context on a new branch for later pickup."
allowed-tools:
  - "Bash(git *)"
  - "Bash(gt *)"
  - "Bash(brmem *)"
  - "Bash(ls *)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference twerk-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# brmem-branch-create

Create a branch and stash current-session context onto it via `brmem`.
This skill owns source resolution, bundle selection, slug suggestion,
and every `brmem` command. The repo-local plugin at
`.twerk/prompts/brmem-branch-create.md` is a **branch-policy plugin**:
it owns only branch creation, meaning how the suggested slug is adapted
to repo conventions and which branch command is used.

## Contract split

### Skill-owned

- Resolve the source context from the current session.
- Decide what gets stashed. Default to a minimal bundle.
- Generate the suggested kebab-case slug.
- Run `brmem check` / `brmem put`.
- Report the final branch and stashed entries.

### Plugin-owned

- Accept the skill's suggested slug.
- Apply repo conventions to produce the final branch name.
- Choose the branch-creation flow (`git` vs `gt`, checkout vs no
  checkout, local pre-flights, etc.).
- Create the branch and report the final branch name plus start-point
  SHA.

### Explicitly not plugin-owned

- Choosing what from the session to stash.
- Choosing the `brmem` namespace / key layout.
- Running any `brmem put` commands.
- Pushing, submitting PRs, or doing post-creation workflow.

## Plugin contract

Treat `.twerk/prompts/brmem-branch-create.md` as a small branch-policy
prompt, not a general workflow. It should answer exactly four
questions:

1. How does the suggested slug map to the final branch name?
2. What branch-creation-only pre-flights should run?
3. What command(s) create the branch?
4. What facts should be reported back to the skill?

If the plugin tries to own stash selection, `brmem` writes, or any other
post-creation workflow, treat it as out of contract and stop rather than
following two competing sources of truth.

## Goal

From the current session, produce:

1. a resolved context bundle to stash (usually a single plan file)
2. a suggested slug derived from that context
3. a branch created per `.twerk/prompts/brmem-branch-create.md`
4. one or more `brmem` entries attached to that created branch
5. a report naming the source path(s), final branch, stashed entries,
   and plugin path

Responsibility ends at the last `brmem put`. Never push or submit.
Outside whatever branch-creation side effects the plugin explicitly
chooses, this skill does not modify the repo tree.

## Core rules

- **Require the plugin to exist.** Read
  `.twerk/prompts/brmem-branch-create.md` verbatim. Do not seed it,
  overwrite it, or fall back to an inline default.
- **The skill chooses the bundle.** For plan-centric requests, default
  to one verbatim `plan.md` entry in the base namespace unless the user
  explicitly asks to stash more.
- **The skill suggests the slug.** The plugin may adapt that slug to
  repo conventions, but the final created branch name is authoritative.
- **The final branch name must be explicit.** Do not guess which branch
  a plugin created. If the plugin's instructions make the target branch
  ambiguous, stop and ask for a clearer plugin.
- **`brmem` is always skill-owned.** The plugin never decides the stash
  bundle and never runs `brmem put`.
- **Copy bytes verbatim.** Do not rewrite, summarize, or append
  footers to stashed files.
- **No publish step.** Do not `git push`, `gt submit`, or otherwise
  publish the branch.

## Workflow

### 1. Ensure the plugin exists

- Run `git rev-parse --show-toplevel` to confirm you are in a git repo.
  Abort if not.
- Require `<repo-root>/.twerk/prompts/brmem-branch-create.md` to
  exist. If it does not, abort with guidance:

  ```
  Plugin file missing: .twerk/prompts/brmem-branch-create.md

  brmem-branch-create requires a repo-local branch-creation plugin at
  that path. Seed it from this skill's packaged `default-prompt.md`
  (manually or via your own setup flow), then re-run the skill.
  ```

- Read the plugin file verbatim. Treat it as authoritative for branch
  creation only, and expect it to follow the branch-policy contract
  above.

### 2. Resolve what to stash

Prefer a minimal, explicit bundle.

For the common plan-stashing case, resolve the source plan file in this
order:

1. **Explicit argument.** If the user passed a file path, use it.
2. **Conversation context.** If recent context names exactly one plan
   file, use it.
3. **Concrete plan-directory fallback.** If recent context identified a
   specific plan directory, list its markdown files newest-first and
   take the first one.

If several distinct plan paths appear in recent context, pick the most
recent reference and name that choice in the final report so the user
can re-run with an explicit path if needed.

Default bundle for the common case:

| namespace | key       | source                 |
| --------- | --------- | ---------------------- |
| `base`    | `plan.md` | resolved plan file     |

That means one `brmem put plan.md --branch <final-branch> --file
<source-path>` call later in the workflow.

Only widen the bundle if the user explicitly asks to stash additional
session artifacts. When that happens:

- keep keys simple and descriptive
- default to the base namespace unless the user asked for a named one
- stash source files verbatim
- do not synthesize a summary just to have something to store

If no clear source file can be resolved, abort with a short explanation
of what you tried.

### 3. Generate the suggested slug

Read the primary source file's full contents, then derive a suggested
kebab-case slug from the title plus intent:

- lowercase ASCII, hyphen-separated, ≤50 characters
- leads with a verb when natural (`add-`, `refactor-`, `migrate-`,
  `rename-`, `retire-`, etc.)
- no `-plan` suffix
- describes the change, not the document

If the bundle has multiple files, derive the slug from the primary
source or the user's stated intent, not from an arbitrary filename.

### 4. Let the plugin turn the suggestion into a branch plan

The plugin owns branch creation, so use it as a branch-policy prompt to
determine:

- the final branch name after repo-specific conventions are applied
- the branch-creation command(s) to run
- any branch-creation-only pre-flights the repo wants

Typical examples:

- keep the suggested slug unchanged and run `git branch <slug> HEAD`
- prefix or normalize the slug, then run `git switch -c <branch>`
- create the branch through `gt create <branch>` per repo policy

The plugin may change the branch name. Once it does, treat that final
branch name as authoritative for every later `brmem` call.

If the plugin is empty, contradictory, or would create a branch whose
name cannot be known clearly before stashing, abort and name the plugin
path in the error.

### 5. Pre-flight the `brmem` targets

Once the final branch name is known, pre-flight each planned stash
entry before writing anything.

For each `(namespace, key)` pair, run:

```
brmem check <key> --branch <final-branch>
```

Add `--namespace <ns>` when the namespace is not `base`.

Branch on exit code:

- `0` → abort; that entry already exists for the final branch
- `1` → continue; the slot is free
- `2` → abort; the key / namespace / branch was invalid or the command
  failed

### 6. Create the branch per the plugin

Run the branch-creation command(s) the plugin specifies.

Typical shapes:

```
git branch <final-branch> HEAD
```

or

```
gt create <final-branch>
```

Capture the branch's start-point SHA for the report. If the plugin's
creation flow checks out the new branch, accept that. If it does not,
that is also fine.

### 7. Stash the bundle via `brmem`

Run the `brmem put` commands yourself. The plugin does not do this.

For each bundle row:

```
brmem put <key> --branch <final-branch> --file <source-path>
```

Add `--namespace <ns>` only when the namespace is not `base`.
Capture the ref path and commit SHA returned by each `brmem put` for
reporting.

If a later `brmem put` fails, stop immediately and surface the error.
Do not guess a cleanup strategy. Earlier `brmem` writes, if any,
remain as-is.

### 8. Report

Print a short summary that includes:

- the source path(s) selected for the bundle
- the suggested slug
- the final created branch name
- the branch's start-point SHA
- each stashed entry: namespace (or `base`), key, ref path, commit SHA
- the plugin file path (`.twerk/prompts/brmem-branch-create.md`)

If the plugin changed the branch name from the suggestion, show both.

Close with a short next-step hint, for example:

```
Branch: <final-branch>
Inspect the attached context with `brmem list --base` (or
`brmem list --namespace <ns>`) and `brmem get <key>`.
```

## Edge cases

- **Not in a git repo** → abort at step 1.
- **Plugin file missing** → abort at step 1 with the seed-it-manually
  guidance above.
- **Plugin file unusable** (empty / contradictory / ambiguous target
  branch) → abort at step 4 and name the plugin path.
- **No clear source file** → abort at step 2 rather than synthesizing
  something vague.
- **Multiple plan files in context** → pick the most recent reference
  and report that choice.
- **A target `brmem` entry already exists** → abort at step 5 before
  writing anything.
- **Branch creation succeeds but a later `brmem put` fails** → report
  the partial state; do not try to undo the branch creation.

## Manual verification scenarios

1. **Default plugin + explicit plan file.** Invoke the skill with a
   concrete plan path. Expect: the plugin file is unchanged, a branch is
   created, and `plan.md` round-trips through `brmem get` on that
   branch.
2. **Custom plugin that rewrites the branch name.** Use a plugin that
   prefixes or normalizes the suggested slug before branch creation.
   Expect: the final report shows both the suggestion and the actual
   branch, and `brmem put` targets the actual branch.
3. **Missing plugin.** Invoke the skill without
   `.twerk/prompts/brmem-branch-create.md`. Expect: clean abort, no new
   branch, no `brmem` writes.

## Anti-patterns

- **Letting the plugin decide the stash bundle.** The plugin creates
  branches; it does not choose or write `brmem` content.
- **Hiding slug logic inside the plugin.** The skill proposes the slug;
  the plugin may adapt it to repo conventions.
- **Rewriting the plan or adding a footer.** Stashed files should round-
  trip verbatim.
- **Guessing which branch got created.** If the plugin does not make the
  final branch explicit, stop.
- **Pushing or submitting automatically.** This skill ends at local
  branch creation plus local `brmem` writes.
