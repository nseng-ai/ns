# Sub-agent brief template

Fillable brief the `dev-stacker-agent` coordinator composes per PR and
passes as the `Agent` tool's `prompt` argument. Replace every `[bracketed]`
placeholder with the concrete value for this PR. Drop any section that does
not apply (e.g., _Context from prior PRs_ on PR 1, _Do-not-touch_ when the
plan's scope section has no such list). Do not rename sections — downstream
sub-agents and the coordinator's verification step rely on the shape.

---

## Plan file

Read the full plan at:

`[absolute-path-to-plan-file]`

Your assigned scope section in that plan is:

`[exact scope-section heading, e.g., "## PR 2 — Storage switch (the big atomic one)"]`

Read the plan end-to-end for context, but implement **only** what your
scope section describes. If the plan has a "Coordinator / sub-agent
contract" section, honor its terms on top of this brief.

## Environment

- Repo root: `[absolute-repo-root]`
- Base branch (verified by coordinator): `[branch-name]`
- You are stacking this PR **on top of** the base branch. Do not rebase
  onto trunk if the base is not trunk.

## Context from prior PRs

[Forwarded summary fragments flagged `important for downstream` by prior
sub-agents. Include exact names / shapes / contracts that this PR must
adopt verbatim. Empty on PR 1.]

## Branching

1. Use `gt create <branch-name> -m "<commit-message>"` on top of the
   verified base. Do not use raw `git commit`, `gt submit`, `git push`,
   or `gh pr create`.
2. Suggested branch name: `[suggested-slug]`. You may choose a
   different kebab-case slug if it fits the scope better; report whichever
   name you actually used in the handoff payload.
3. Suggested commit subject: `[commit-subject-stub]`. Rewrite if a more
   accurate subject fits. Use the project's commit-message conventions
   (see the `graphite` skill's notes on commit messages if unsure).

If `gt create` refuses for any reason, stop and report the exact error
rather than falling back to raw `git`.

## Scope

[Paste the plan's scope bullets for this PR verbatim. Keep the "Files to
add/modify" list intact so the sub-agent sees the exact file-level
scope.]

## Do-not-touch

[Paste the plan's "Do not touch" list for this PR. If none exists,
write: "No explicit do-not-touch list. Infer scope boundaries from
the Files to add/modify list above."]

## Lint / format

Do not hand-edit files to satisfy the formatter. Run `just fix` for
ruff failures and `just dprint-fix` for Markdown / TOML failures, then
re-run `just`. Only edit by hand for real lint/type/test bugs the
autofixer can't resolve. (Full policy: `AGENTS.md`.)

## Green bar

From the repo root, run:

```
[green-bar-command — default `just`]
```

The exit code **must** be `0`. If it is non-zero, include the last ~40
lines of output in the handoff prose so the coordinator can retry you
with the specific failure.

## Exit criteria

When your assigned scope lands and the green bar is clean:

1. Emit a single JSON line (machine-readable handoff):

   ```json
   {"branch": "<name>", "commit_sha": "<full-sha>", "exit_code": 0}
   ```

   Non-zero `exit_code` means the green bar failed. Report anyway — the
   coordinator decides whether to retry.

2. Emit a short prose summary flagging:
   - **Deviations** — any files touched outside the Files to add/modify
     list, any tests added beyond what the plan asked for, any do-not-touch
     entries you had to interpret.
   - **Hidden design choices** — naming, argument ordering, helper
     placement, error message strings. Mark any of these `important for
     downstream` if PR N+1 must adopt the exact name or shape verbatim.
   - **Blocking questions** — anything the plan does not answer that
     forced you to guess. Prefer to stop and ask rather than guess on
     anything architectural.

Do **not**:

- move on to the next PR's scope,
- submit, push, or open a PR (`gt submit`, `git push`, `gh pr create`),
- modify the plan file itself,
- silently scope-expand. If the task as written cannot succeed (e.g. a
  failing test reveals a plan flaw), stop and report with a specific
  question — the coordinator decides whether to expand scope or fix
  the plan.
