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

**The skill owns:** resolving the source context, choosing the stash bundle and its `brmem` namespace/key layout, generating the suggested kebab-case slug, running every `brmem check` / `brmem put`, and reporting what landed.

**The plugin at `.twerk/prompts/brmem-branch-create.md` owns only branch creation:** mapping the suggested slug to the final branch name under repo conventions, running branch-creation-only pre-flights, and executing the branch-creation command (`git` vs `gt`, checkout or no checkout). It does **not** decide what to stash, does not run `brmem put`, and does not push or submit.

If a plugin tries to own stash selection or `brmem` writes, stop rather than follow two competing sources of truth.

## Rules

- **Require the plugin to exist.** Read `.twerk/prompts/brmem-branch-create.md` verbatim. Do not seed it, overwrite it, or fall back to an inline default.
- **The skill chooses the bundle.** For plan-centric requests, default to one verbatim `plan.md` entry in the `base` namespace unless the user explicitly asks for more.
- **The skill suggests the slug; the plugin may adapt it** to repo conventions. The final created branch name is authoritative for every later `brmem` call.
- **The final branch name must be explicit.** If the plugin makes the target branch ambiguous, stop and ask for a clearer plugin — do not guess.
- **Copy bytes verbatim.** Stashed files round-trip unchanged: no rewriting, summarizing, or footers.
- **No publish step.** Never `git push`, `gt submit`, or otherwise publish the branch. Responsibility ends at the last `brmem put`.
- **Don't hide slug logic inside the plugin.** The skill proposes; the plugin adapts.

## Workflow

### 1. Ensure the plugin exists

- Run `git rev-parse --show-toplevel` to confirm a git repo. **Abort if not.**
- Require `<repo-root>/.twerk/prompts/brmem-branch-create.md` to exist. **If it does not, abort with this guidance:**

  ```
  Plugin file missing: .twerk/prompts/brmem-branch-create.md

  brmem-branch-create requires a repo-local branch-creation plugin at
  that path. Seed it from this skill's packaged `default-prompt.md`
  (manually or via your own setup flow), then re-run the skill.
  ```

- Read the plugin file verbatim. Treat it as authoritative for branch creation only.

### 2. Resolve what to stash

Prefer a minimal, explicit bundle. For the common plan-stashing case, resolve the source plan file in this order:

1. **Explicit argument** — user passed a file path.
2. **Conversation context** — recent context names exactly one plan file.
3. **Concrete plan-directory fallback** — recent context named a plan directory; list its markdown files newest-first and take the first.

If several distinct plan paths appear in recent context, pick the most recent reference and name that choice in the final report. **If no clear source file can be resolved, abort** with a short explanation of what you tried.

Default bundle:

| namespace | key                    | source             |
| --------- | ---------------------- | ------------------ |
| `base`    | `plans/<slug-name>.md` | resolved plan file |

That becomes one `brmem put plans/<slug-name>.md --branch <final-branch> --file <source-path>` call in step 7.

Only widen the bundle if the user explicitly asks to stash more. When that happens: keep keys simple, default to the `base` namespace unless asked otherwise, stash files verbatim, and do not synthesize a summary just to have something to store.

### 3. Generate the suggested slug

Read the primary source file, then derive a kebab-case slug from title + intent:

- lowercase ASCII, hyphen-separated, ≤50 characters
- lead with a verb when natural (`add-`, `refactor-`, `migrate-`, `rename-`, `retire-`)
- no `-plan` suffix
- describes the change, not the document

If the bundle has multiple files, derive from the primary source or stated intent, not an arbitrary filename.

### 4. Let the plugin turn the suggestion into a branch plan

Use the plugin as a branch-policy prompt to determine:

- the final branch name after repo-specific conventions
- the branch-creation command(s) to run
- any branch-creation-only pre-flights

Typical shapes:

- keep the slug unchanged and run `git branch <slug> HEAD`
- prefix/normalize the slug, then `git switch -c <branch>`
- create via `gt create <branch>` per repo policy

**If the plugin is empty, contradictory, or would create a branch whose name cannot be known before stashing, abort and name the plugin path.**

### 5. Pre-flight the `brmem` targets

Once the final branch name is known, pre-flight each planned entry before writing anything:

```
brmem check <key> --branch <final-branch>
```

Add `--namespace <ns>` when the namespace is not `base`.

Branch on exit code:

- `0` → **abort**; that entry already exists for the final branch
- `1` → continue; the slot is free
- `2` → **abort**; the key / namespace / branch was invalid or the command failed

### 6. Create the branch per the plugin

Run the branch-creation command(s) the plugin specifies. Typical shapes:

```
git branch <final-branch> HEAD
```

or

```
gt create <final-branch>
```

Capture the branch's start-point SHA for the report. Checkout or no-checkout is the plugin's call — accept whichever.

### 7. Stash the bundle via `brmem`

Run the `brmem put` commands yourself — the plugin does not. For each bundle row:

```
brmem put <key> --branch <final-branch> --file <source-path>
```

Add `--namespace <ns>` only when the namespace is not `base`. Capture the ref path and commit SHA returned by each call.

**If a later `brmem put` fails, stop immediately and surface the error.** Do not guess a cleanup strategy — earlier writes and the new branch remain as-is; report the partial state.

### 8. Report

Print a short summary including:

- source path(s) selected for the bundle
- the suggested slug (and the final branch if the plugin changed it)
- the final created branch name and start-point SHA
- each stashed entry: namespace (or `base`), key, ref path, commit SHA
- the plugin file path (`.twerk/prompts/brmem-branch-create.md`)

Close with a next-step hint, for example:

```
Branch: <final-branch>
Inspect the attached context with `brmem list --base` (or
`brmem list --namespace <ns>`) and `brmem get <key>`.
```

## Manual verification scenarios

1. **Default plugin + explicit plan file** — invoke with a concrete plan path; plugin file unchanged, branch created, `plan.md` round-trips through `brmem get`.
2. **Custom plugin that rewrites the branch name** — plugin prefixes/normalizes the slug; report shows both suggestion and final branch, and `brmem put` targets the final branch.
3. **Missing plugin** — invoke without `.twerk/prompts/brmem-branch-create.md`; clean abort, no branch, no `brmem` writes.
