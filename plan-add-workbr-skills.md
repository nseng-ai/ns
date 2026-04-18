# Plan: brmem-backed plan-to-branch workflow

## Context

`skills/dev-plan-to-branch/` today stamps a plan file onto a new Graphite
branch as its first commit. It requires the working tree clean, checks out
the new branch, commits `plan-<slug>.md` into the repo, and relies on a
"self-destruct" footer so the final commit can delete the file. This
couples the plan artifact to the codebase, forces a checkout, and means
the user must be ready to abandon their current worktree before stamping.

We want a sibling workflow that decouples **"capture the plan"** from
**"work on the plan"**:

1. From the _current_ worktree, create a new branch without checking it
   out and stash the plan into **branch memory** (`brmem`, stored under
   `refs/brmem/brs/<encoded-branch>`).
2. The user opens a _new_ worktree on that branch (e.g. `slot checkout
   <branch>`) when they're actually ready to start.
3. In that new worktree, a companion skill pulls the plan out of brmem
   and begins executing it.

Benefits over the existing skill:

- No clean-tree requirement — the current worktree is untouched; we only
  update refs.
- No in-tree `plan-<slug>.md` file to commit, rebase, or self-destruct.
- The plan stays attached to the branch as metadata, visible to anyone
  with the ref (`git show refs/brmem/brs/<slug>:plan.md`), but never
  pollutes the working tree or PR diff.
- Work is parallel-friendly: you can stash many plan branches from one
  worktree and pick them up across a pool of slot worktrees on demand.

## End-to-end workflow

**Stage 1 — create** (current worktree, new skill `dev-workbr-create`):

```
resolve plan file  →  generate slug  →  git branch <slug> HEAD
                                    →  brmem put --branch <slug> plan.md
                                    →  report with next-step hint
```

**Stage 2 — checkout** (user runs this; skill just tells them how):

```
slot checkout <slug>          # twerk-slots allocates a worktree
cd <worktree-path>            # clipboard hint already provides this
```

**Stage 3 — implement** (in the new worktree, companion skill
`dev-workbr-impl`):

```
detect current branch  →  brmem get plan.md  →  surface plan as the
                                                active session plan
                                                and begin implementation
```

"workbr" = "work branch": a branch that's been prepared ahead of time
with a plan stashed in brmem, ready to be picked up in a fresh worktree.

## Skill 1: `dev-workbr-create` (stasher)

**Location:** `skills/dev-workbr-create/SKILL.md` with the standard
`internal: true` frontmatter.

**Allowed tools:** `Bash(git branch *)`, `Bash(git rev-parse *)`,
`Bash(git status *)`, `Bash(brmem *)`, `Read`, `Write` (for the session
plan file only), `ExitPlanMode`.

**Workflow:**

1. **Exit plan mode if active.** Resolve the source plan, generate the
   slug, write a short session plan describing the stash action, call
   `ExitPlanMode`. Same pattern as current
   `skills/dev-plan-to-branch/SKILL.md:63-99`.
2. **Resolve the plan file** (verbatim copy of step 2 from the existing
   skill: explicit arg → conversation context → filesystem fallback).
3. **Generate the slug** (verbatim rules from the existing skill: kebab
   case, ≤50 chars, verb-leading, describes the change).
4. **Pre-flight:**
   - `git rev-parse --show-toplevel` (must be a git repo).
   - `git rev-parse --verify refs/heads/<slug>` — must _not_ exist. If it
     does, abort and ask the user to pick a different slug or delete the
     stale branch.
   - `git rev-parse --verify refs/brmem/brs/<encoded-slug>` — must _not_
     exist. If it does, abort. (This catches the rare case where brmem
     memory was created without a matching branch.)
   - `git rev-parse HEAD` — capture the start-point SHA for the report;
     abort on detached HEAD.
   - No clean-tree requirement. We never touch the working tree.
5. **Create the branch without checkout:**
   `git branch <slug> HEAD` — the new branch points at the same commit
   as the current worktree, but the worktree stays on its current
   branch. `gt create` is not used here because it always checks out;
   raw `git branch` is the right primitive. (`git branch` only manages
   refs, so the branch won't be Graphite-tracked yet; `gt track` can run
   later inside the new worktree if the user wants to stack on top.)
6. **Stash the plan via brmem:**
   `brmem put <source-plan-path> --branch <slug> --path plan.md` — this
   creates `refs/brmem/brs/<encoded-slug>` with a single file `plan.md`
   whose contents are the source plan **verbatim**. No self-destruct
   footer — brmem entries aren't in the tree and don't need one.
7. **Report:**
   - branch name + start-point SHA
   - brmem ref path (`refs/brmem/brs/<encoded-slug>`) and commit SHA
     returned by `brmem put`
   - source plan file path (for wrong-resolution detection)
   - next-step hint:
     ```
     Open a worktree on this branch:
       slot checkout <slug>
     Then from the new worktree, run:
       /dev-workbr-impl
     to pull the plan from brmem and begin implementing.
     ```

**Core rules (copied with adjustments):**

- Plan is stored in brmem verbatim, no footer, no rewriting.
- Slug is generated by the model (not a utility), same rules as existing
  skill.
- Bare slug branch name (no `plan/` prefix).
- Never push, never `gt submit`.
- Never touch the working tree — no `git add`, no file writes at repo
  root (the session-plan write to the harness-owned path is the only
  `Write` call).

## Skill 2: `dev-workbr-impl` (implementer)

**Location:** `skills/dev-workbr-impl/SKILL.md` with the standard
`internal: true` frontmatter.

**Allowed tools:** `Bash(brmem get *)`, `Bash(git rev-parse *)`,
`Bash(git branch *)`, `Read`, plus whatever normal implementation tools
the agent already has (this skill hands off to regular coding once the
plan is loaded — it doesn't over-scope its own permissions).

**Workflow:**

1. **Detect the current branch:**
   `git rev-parse --abbrev-ref HEAD`. Abort on detached HEAD with a
   clear error. This is the brmem key.
2. **Fetch the plan:**
   `brmem get plan.md` (uses the current branch implicitly). On missing
   memory, abort with the `brmem get` error that already points the user
   at `git ls-tree -r refs/brmem/brs/<branch>` for inspection. Do _not_
   guess alternate paths.
3. **Surface the plan:**
   Print the plan to the agent's context and acknowledge it. Do not
   write a file to the working tree — the plan lives in brmem for the
   lifetime of the branch. If the user ends up wanting a local copy,
   they can re-run `brmem get plan.md > plan.md` themselves; the skill
   does not bake that in.
4. **Begin implementing.**
   The skill's terminal step is to start working on the plan using
   normal tooling. The plan is the active spec for the branch; the
   skill's job is to hand it off into the session, not to implement it
   programmatically.

**Anti-patterns:**

- Writing `plan.md` to the working tree and committing it — that's what
  the _other_ `dev-plan-to-branch` skill does; this variant keeps the
  plan out of the tree on purpose.
- Deleting the brmem entry after implementing. Brmem is
  append-history-preserving; leaving the plan attached to the branch is
  a feature (anyone inspecting the branch can see the original spec).
- Running inside the wrong worktree. If the skill runs in the original
  stashing worktree (current branch ≠ stash branch), it will fetch a
  different branch's plan — the user should always run it from the
  worktree created in Stage 2.

## Coexistence with existing `dev-plan-to-branch`

Keep the existing skill as-is. It solves a different problem (the plan
lives in the codebase as a commit, usable by consumers who don't have
brmem). The new pair is additive:

- Use **`dev-plan-to-branch`** when the plan should become part of the
  branch's history as a committed spec.
- Use **`dev-workbr-create`** + **`dev-workbr-impl`** when the plan
  should stay out of the tree and the user wants to defer checkout to a
  separate worktree.

Both live under `skills/` and are registered via the existing
`skills-lock.json` flow (no change to that mechanism).

## Critical files

- `skills/dev-workbr-create/SKILL.md` — new file (stasher).
- `skills/dev-workbr-impl/SKILL.md` — new file (implementer).
- `skills/dev-plan-to-branch/SKILL.md` — unchanged; referenced only for
  shared rules (slug generation, plan resolution, ExitPlanMode pattern).
- `AGENTS.md` — add both new skills to the "Available skills" registry
  (same entry style as existing skills). No code changes.

Supporting primitives (no changes needed, only consumed):

- `brmem put --branch <name> <file> --path plan.md` →
  `packages/twerk-core/src/twerk_core/brmem/put.py:69`.
- `brmem get <path>` →
  `packages/twerk-core/src/twerk_core/brmem/get.py:51`.
- `slot checkout <branch>` (user-run, not skill-invoked) →
  `packages/twerk-slots/src/twerk_slots/cli/slot/checkout.py:150`.

## Verification

End-to-end smoke test (manual, in a throwaway repo or slot worktree):

1. In the current worktree, create a trivial plan at
   `~/.claude/plans/demo.md` with "# Add greet command\n\nAdd a `greet`
   CLI command that prints hello." and invoke `/dev-workbr-create`.
2. Expect a new branch `add-greet-command` to exist (`git branch --list
   add-greet-command` returns a hit) but the current worktree to still
   be on its original branch (`git branch --show-current` unchanged).
3. `git show refs/brmem/brs/add-greet-command:plan.md` should print the
   plan verbatim.
4. `slot checkout add-greet-command` — lands the user in a new worktree
   on that branch.
5. In that worktree, `/dev-workbr-impl` fetches the plan, prints it, and
   begins implementation.
6. After the implementation commits land, the plan is still retrievable
   via `brmem get plan.md` on the branch — brmem entries persist.

Negative tests:

- Re-running `/dev-workbr-create` with a slug whose branch already
  exists — should abort with the "branch already exists" error, not
  clobber.
- Running `/dev-workbr-impl` on a branch that has no brmem entry —
  should surface the `brmem get` "branch memory missing" error with the
  `git ls-tree` inspection hint, not silently succeed.
- Running `/dev-workbr-impl` on detached HEAD — should abort with the
  shared detached-head error.

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-add-workbr-skills.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
