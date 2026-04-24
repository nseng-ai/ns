---
name: brmem-branch-create
description: "Thin dispatcher that creates a branch and stashes curated context onto it via `brmem`, driven entirely by a user plugin at `.twerk/prompts/brmem-branch-create.md`. The skill requires that plugin to exist (a separate init process is responsible for creating it) and then follows it verbatim: the plugin decides the slug, the bundle of entries to stash, and any pre-flight / branch-creation / push constraints. Use when the user wants to 'stash this plan on a new branch', 'prep a prefilled branch', 'park this context for a fresh worktree', or any time curated context should be attached to a branch as metadata without touching the working tree."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
---

<!-- PUBLIC SKILL: Do not reference twerk-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# brmem-branch-create

Create a branch and stash curated context onto it per the user's plugin
at `.twerk/prompts/brmem-branch-create.md`. The skill is a thin
dispatcher: every opinion — slug scheme, what to stash, namespace,
branch-creation mechanics, push / checkout constraints — lives in the
plugin, not here. The skill's job is to require the plugin to exist,
read it, and execute its instructions mechanically.

## Goal

In the current worktree:

1. **Read the plugin** at `.twerk/prompts/brmem-branch-create.md`
   (error out cleanly if it does not exist).
2. **Execute its instructions** — typically one `git branch <slug>
   HEAD` call followed by one or more `brmem put` calls.
3. **Report** the new branch, the stashed entries (ref paths + commit
   SHAs), and the plugin path.

Responsibility ends at the last `brmem put`. Nothing is pushed; no PR
is submitted.

## Core rules

- **Never touch the working tree.** No `git add`, no file writes at the
  repo root, no staging. The working tree may be arbitrarily dirty;
  this skill does not care.
- **The plugin file is authoritative.** Read
  `.twerk/prompts/brmem-branch-create.md` verbatim and follow it. Never
  modify it, never overwrite it, never fall back to an inline default,
  and never seed it — seeding is a separate (not-yet-shipped) init
  process that copies the skill's packaged `default-prompt.md` into
  place.
- **Require the plugin to exist.** If
  `.twerk/prompts/brmem-branch-create.md` is missing, abort with a
  clear error pointing the user at the init process (and at the skill's
  packaged `default-prompt.md` as the canonical text to seed). Do not
  invent a fallback.

All other constraints — slug format, what to stash, which namespace to
use, whether to check out the new branch, whether to push or `gt
submit`, which pre-flight probes to run, how to resolve a plan-file
source — are **plugin-owned**. The shipped default plugin encodes
sensible choices for each (no checkout, no push, a single `plan.md`
under the `base` namespace); a team plugin may choose differently.

## Workflow

### 1. Ensure the plugin file exists

- `git rev-parse --show-toplevel` to resolve the repo root. Abort if
  not in a git repo.
- Check that `<repo-root>/.twerk/prompts/brmem-branch-create.md`
  exists. If it does not, abort with guidance:

  ```
  Plugin file missing: .twerk/prompts/brmem-branch-create.md

  brmem-branch-create requires a user plugin at that path. Seeding
  is the responsibility of a separate init process (not yet shipped).
  Until that lands, copy the packaged canonical plugin from this
  skill's `default-prompt.md` sibling into
  .twerk/prompts/brmem-branch-create.md manually (or via your own
  setup script), then re-run the skill.
  ```

- Read the plugin file verbatim. Treat its contents as the
  authoritative instructions for the rest of the workflow.

### 2. Follow the plugin

The plugin specifies:

- **The slug** (branch name) — format, derivation rule, uniqueness
  policy.
- **The bundle** — one or more `(namespace, key, source)` triples for
  `brmem put`. The plugin is the single source of truth for what goes
  into `brmem` storage; the skill hard-codes no default.
- **Pre-flight probes** — branch-already-exists, entry-already-exists,
  detached-HEAD, working-tree-clean, or any other checks the plugin
  wants before writing.
- **Branch-creation mechanics** — which git command to use (the
  shipped default plugin requires raw `git branch <slug> HEAD` so the
  current worktree stays put; a team plugin may choose otherwise).
- **Push / submit / track constraints** — if the plugin says "never
  push", honor that; if it is silent, do nothing beyond what it
  explicitly asks for.
- **Context / source resolution** — where to get the plan (or other
  content) for each bundle entry. Explicit argument, conversation
  scan, filesystem fallback, etc. — the plugin owns the fallback
  order.

If the plugin is present but obviously unusable (empty, contradictory,
references a command that does not exist, etc.), abort with a clear
error that names the plugin path. Do **not** silently fall back to a
packaged default — the user needs to fix the plugin, not have the skill
paper over it.

### 3. Execute mechanically and report

Run the commands the plugin specifies, in the order it specifies.
Typical shape:

```
git branch <slug> HEAD
brmem put <key> --branch <slug> --file <source-path>
...
```

Add `--namespace <ns>` on `brmem` calls when the plugin-selected
namespace is not `base`. Capture the ref path and commit SHA returned
by each `brmem put` for the final report.

If a `brmem put` fails mid-bundle, stop and surface the error. Prior
puts remain attached to the branch — `brmem` history preserves them —
but do not attempt partial cleanup.

Print a short summary:

- the new branch and its start-point SHA
- each stashed entry: namespace (or `base`), key, ref path, commit SHA
- the plugin file path (`.twerk/prompts/brmem-branch-create.md`)
- a next-step hint phrased tool-agnostically:

  ```
  Branch: <slug>
  Check the branch out however you prefer (fresh worktree,
  `git checkout`, `gt checkout`, etc.). From there, enumerate the
  stashed context with `brmem list --base` (or `brmem list --namespace
  <ns>` for a named namespace) and read individual entries with
  `brmem get <key>`.
  ```

## Edge cases

- **Not in a git repo** → abort at step 1.
- **Plugin file missing** → abort at step 1 with the init-process
  pointer shown above.
- **Plugin file present but unusable** (empty / contradictory /
  references commands that do not exist) → abort at step 2 with a
  clear error naming the plugin path. Do not fall back silently.

Everything else — detached HEAD, branch already exists, brmem entry
already exists, dirty working tree, multiple context sources — is the
plugin's concern. The shipped default plugin covers each; a team plugin
may make different choices.

## Manual verification scenarios

This skill is markdown-only — there is no Python surface to cover with
automated tests. Two scenarios can be reproduced in a scratch repo:

1. **Plugin present, used verbatim.** With a `.twerk/prompts/brmem-branch-create.md`
   in place (e.g., the packaged default plugin copied there), invoke
   the skill. Expect: (a) the plugin file is byte-for-byte unchanged
   afterwards; (b) the new branch exists; (c) each bundle entry
   round-trips through `brmem get`; (d) the working tree gains no new
   files.
2. **Plugin missing.** Invoke the skill in a repo with no
   `.twerk/prompts/brmem-branch-create.md`. Expect: abort with the
   init-process pointer; no new branch; no `brmem` writes; working
   tree unchanged.

## Anti-patterns

- **Silently seeding the plugin.** The skill does not create
  `.twerk/prompts/brmem-branch-create.md`; that is the init process's
  job.
- **Inline fallback when the plugin is missing or broken.** Abort and
  point the user at the fix. Do not paper over a misconfigured plugin.
- **Writing anything to the working tree.** `git add`, file writes at
  the repo root, or staging are all off-limits — the skill's value is
  that it leaves the tree untouched.
- **Imposing skill-level rules the plugin did not ask for.** The skill
  runs the commands the plugin specifies. It does not inject extra
  pre-flights, extra probes, or extra constraints.
