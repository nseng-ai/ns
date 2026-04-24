# brmem-branch-create — packaged canonical plugin

This file is the **packaged canonical plugin** for the
`brmem-branch-create` skill. The skill itself does **not** read this
file; it reads whatever is at `.twerk/prompts/brmem-branch-create.md`.
A separate (not-yet-shipped) init process is responsible for copying
this file to that canonical location.

Until the init process exists, copy this file manually to
`.twerk/prompts/brmem-branch-create.md` (or via your own setup script)
before running the skill. Edit it **in place here** to tweak the
shipped default; edit the per-repo copy at
`.twerk/prompts/brmem-branch-create.md` for team-specific customization.

## What the skill should do under this plugin

Stash a single plan file onto a new branch as one `brmem` entry in the
base namespace. The plan is the context; the branch is the address.
The current worktree is never touched, never checked out, never pushed.

## Resolving the plan file (context source)

Try in order; stop at the first that succeeds:

1. **Explicit argument.** If the user passed a path to the skill, use
   it. Abort if the file does not exist or is not readable.
2. **Conversation context.** Scan recent context for a plan file path.
   Harnesses that support plan mode often surface one in a system
   reminder or equivalent session metadata. If exactly one such path
   appears recently, use it. If several distinct paths appear, pick
   the most recent reference and name that choice in the final report
   so the user can re-run with an explicit path if it picked wrong.
3. **Filesystem fallback.** If the conversation identified a concrete
   plan directory, list its markdown files newest-first and take the
   first one (e.g. `ls -t ~/.claude/plans/*.md | head -1` in Claude
   Code).

If all three fail, abort with a clear error describing what was tried.

## Deriving the slug

Read the resolved plan's full contents, then produce a kebab-case slug
from its title plus intent:

- lowercase ASCII, hyphen-separated, ≤50 characters
- leads with a verb when natural (`add-`, `refactor-`, `migrate-`,
  `rename-`, `retire-`, etc.)
- no `-plan` suffix — the stashed file's key already signals that
- describes the _change_, not the document (e.g.
  `retire-workbr-for-brmem`, not `plan-for-workbr-retirement`)

The slug doubles as the branch name and the `brmem` entry's branch
scope.

## The bundle

This plugin owns — completely — what goes into `brmem` storage. The
skill has no hard-coded bundle default; whatever is listed here is
what gets stashed.

Stash exactly one entry:

| namespace | key       | source                          |
| --------- | --------- | ------------------------------- |
| `base`    | `plan.md` | the resolved plan file verbatim |

That is: a single `(base, plan.md, <resolved-plan-path>)` triple, to
be passed to `brmem put plan.md --branch <slug> --file <path>` by the
skill. The resulting address is `refs/brmem/base/<encoded-slug>:plan.md`.

Do not add a summary, footer, or rewrite of any kind. The plan is
metadata attached to the branch — it should round-trip verbatim.

## Pre-flight probes

Run these and abort on the first failure, before any branch or `brmem`
write:

- `git rev-parse HEAD` must succeed and must not be detached. Abort on
  detached HEAD — `brmem` keys are scoped by branch name, so we need
  one.
- `git rev-parse --verify refs/heads/<slug>` must **fail** (non-zero
  exit). If the branch already exists, abort; do not clobber. Ask the
  user to pick a different slug or delete the stale branch first.
- `brmem check plan.md --branch <slug>` must exit `1` (grep-style "no
  entry"). Branch on exit code:
  - `0` → abort; a `brmem` entry already exists at
    `refs/brmem/base/<slug>:plan.md` (typically a half-created stash
    from an earlier run).
  - `1` → continue; no entry yet.
  - `2` → abort; the slug / key was rejected by `brmem`'s validation.
    Surface the stderr so the user can fix it.

## Branch creation

Create the new branch without ever checking it out:

```
git branch <slug> HEAD
```

- Use raw `git branch`, **not** `gt create` (it always checks out the
  new branch — exactly the behavior we are avoiding) and **not**
  `git checkout -b` / `git switch -c` / `git worktree add` (same
  reason: any checkout of the new branch is off-limits for this
  plugin).
- The worktree stays on its current branch; nothing in the working
  tree changes.
- The new branch is not Graphite-tracked. If the user wants to stack
  on top, they can run `gt track` later, inside a fresh worktree of
  their own making.

## Stash the bundle

For each row in the bundle table:

```
brmem put <key> --branch <slug> --file <source-path>
```

Pass `--namespace <ns>` only when the row's namespace is not `base`.
Contents are written verbatim. Capture the ref path and commit SHA
returned by each `brmem put` for the report.

## Push / submit / track constraints

This plugin forbids all of the following — the skill must not run any
of them, and the user must explicitly invoke them later from a fresh
worktree if they want them:

- `git push`
- `gt submit`
- `gt track`
- any other operation that publishes the new branch or its `brmem`
  entries remotely

## Report shape

After the stash succeeds, the skill's report should name:

- the new branch and its start-point SHA
- the stashed `plan.md` entry (ref path + commit SHA)
- the resolved source plan file path
- this plugin file's path
  (`.twerk/prompts/brmem-branch-create.md`)
- a next-step hint: the user can check the branch out however they
  prefer (fresh worktree, `git checkout`, `gt checkout`) and then
  enumerate stashed context with `brmem list --base` and read
  entries with `brmem get plan.md`.

## Customizing this prompt

To teach a team variant of this plugin, edit the copy at
`.twerk/prompts/brmem-branch-create.md` (or this packaged file, if you
want to change the shipped default). A few examples of what you might
change:

- **Multi-file bundles.** Replace the one-row table above with several
  rows — e.g. `(base, plan.md, <plan-path>)` plus `(base, intent.md,
  <intent-path>)`. The skill walks the table and does one `brmem put`
  per row.
- **Named namespace.** Replace `base` with a named namespace (e.g.
  `my-team`) to stash under `refs/brmem/ns/my-team/<slug>:<key>` instead.
  The skill will pass `--namespace <name>` on both the `brmem check`
  probe and the `brmem put`.
- **Relax the pre-flight probes.** If a team wants to allow stashing
  onto an existing branch (e.g., reusing a slug across runs), drop or
  weaken the branch-absent / entry-absent checks in "Pre-flight probes"
  above.
- **Permit publishing.** If a team wants the skill to push or submit
  automatically, loosen the "Push / submit / track constraints" section
  above. (The default prohibition is conservative; a team plugin may
  trust its operators.)
- **Branch-type variants.** If feature branches, bugfix branches, and
  spike branches want different slug schemes, bundle shapes, or
  constraints, encode the variants as conditionals in this one plugin
  rather than splitting into multiple files — the skill reads exactly
  one plugin per repo.

The skill treats the canonical plugin as authoritative. It will not
overwrite it, it will not seed it, and it will not fall back to an
inline default if it is missing or broken — surface the problem so it
can be fixed in `.twerk/prompts/brmem-branch-create.md`.
