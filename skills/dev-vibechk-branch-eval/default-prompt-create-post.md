# vibechk — packaged create-post hook prompt

Packaged starting point for `.twerk/prompts/brmem-branch-create-post.md`. The invoking skill (`brmem-branch-create`) reads whatever is at that path after its primary stash succeeds; copy this file there (manually or via a setup flow) to use the default.

**Scope: capture planning-session learning as `brmem` notes.** This hook does not edit the working tree, does not push, and does not modify the primary `base/plans/<slug>.md` entry. It writes one new `brmem` entry under the `vibechk` namespace on the branch the skill just created.

## Input from the invoking skill

- the **final branch name** (already created and stashed-onto by the skill)
- the **primary stash key/SHA** for `base/plans/<slug>.md`
- current planning-session context (everything the agent saw and decided in this session)

## Contract

The hook-time agent should:

1. Compose a prose summary of the planning session covering, at minimum:
   - what was examined (files read, prior art consulted, repo areas explored)
   - alternatives considered and why they were ruled out
   - decisions made and the reasoning behind them
   - open questions or known unknowns left for the implementer

   The summary is freeform prose, not a checklist. Aim for the tone of a short engineering retrospective: enough context that the impl-side reader could reconstruct the planning intent without having to re-read the conversation. Multiple paragraphs are fine; bullets are fine where they serve clarity.

2. Pipe the summary into `brmem` as a single new entry on the **final branch name** the skill just created:

   ```
   brmem put plan-session-notes.txt --namespace vibechk --branch <final-branch> --stdin
   ```

   The `--stdin` flag reads the summary from standard input — feed the prose composed in step 1.

## Default behavior

- Produces exactly one new `brmem` entry: `vibechk/plan-session-notes.txt` on the final branch.
- Never edits the working tree, never runs `git`/`gt`, never pushes.
- Does not touch the primary `base/plans/<slug>.md` entry the skill already wrote.
- Reports only: ref path and commit SHA returned by `brmem put`.

## Customization guidance

This is `vibechk`'s opinionated take on what to capture at plan-session close. Edit the repo-local copy at `.twerk/prompts/brmem-branch-create-post.md` to change what gets stashed in this repo. Common changes:

- **Capture more than one note** — e.g., add a separate `plan-decisions.md` or `plan-open-questions.md` entry. Each becomes another `brmem put` call.
- **Switch namespace** — use the `base` namespace if you want notes to round-trip with `brmem list --base`, or a different custom namespace if you prefer keeping vibechk-flavored notes isolated.
- **Tighten the summary shape** — e.g., require a fixed set of headings, or impose a length budget.
- **Skip the hook for some plans** — add a guard at the top of the file (e.g., abort if the plan file is under a `docs/scratch/` path).

Do **not** widen this hook into branch creation or primary bundle selection — those belong in the skill and the branch-creation plugin, not here.
