# Branch Memory Handoff

## Thesis

Agents need a durable, branch-scoped handoff workflow that is as easy to invoke as the current handoff skill, but stores the next-session handoff in Branch Memory instead of an arbitrary temp file. The first steel thread is a first-party handoff riff that writes a concise handoff document to `brmem` for the current branch so a fresh session can reliably load it before continuing work.

Over time, the workflow should also capture a session summary and a self-improvement analysis: what repo, skill, or process changes would have made the session more efficient. That gives the project a lightweight path toward compound-engineering-style learning without turning handoffs into a heavyweight task system.

## Scope

- Create a repo-local handoff workflow inspired by the existing vendored handoff skill.
- Store the primary next-session handoff document in Branch Memory for the current branch.
- Define the Branch Memory namespace/key convention and overwrite behavior for handoff entries.
- Provide clear load instructions so the next agent/session can retrieve and use the handoff.
- Preserve the current handoff discipline: compact summary, references to durable artifacts instead of duplicating them, and suggested skills for the next session.
- Plan follow-on capture for a session summary and a repo-efficiency/self-learning analysis.
- Add enough documentation and tests around any new skill or CLI behavior to make the workflow safe for repeated agent use.

## Non-Goals

- Do not store secrets, tokens, binary data, generated output, or large logs in Branch Memory.
- Do not create a general task database, state machine, or objective/initiative attachment system.
- Do not require commits, PR comments, issues, or temp files as the durable handoff location.
- Do not overhaul Branch Memory itself unless a concrete limitation blocks the handoff workflow.
- Do not mutate vendored third-party skill code unless the intended change is explicitly to update that vendored dependency.

## Completion Criteria

- An agent can invoke the new repo-local handoff workflow and produce a handoff document stored in `brmem` on the current branch.
- A fresh agent can discover and load the stored handoff using documented `brmem` commands.
- The Branch Memory namespace/key convention is documented and avoids collision with ad-hoc branch notes.
- The workflow keeps the handoff concise and references existing artifacts by path or URL rather than duplicating them.
- Tests or scenario coverage exercise the write and read path for the handoff behavior.
- Follow-on design is captured for session summaries and self-improvement analysis, even if the first steel thread only implements the primary handoff document.

## Decisions

- The first steel thread is a first-party `brmem-handoff` skill sourced from `skills/brmem-handoff/SKILL.md` and installed through the repo skill symlink chain.
- The primary handoff lives in Branch Memory namespace `handoff` at entry key `current.md`, scoped to the relevant Git branch.
- Saving a handoff replaces the previous `handoff/current.md` for that branch. Timestamped handoff history remains parked for later.
- The durable load command is `brmem get current.md --namespace handoff --branch <branch>`.
- The initial retrieval UX is skill-driven: agents load the `brmem-handoff` skill and run the documented `brmem get` command before continuing work.

## Open Questions

- What test or scenario harness should exercise the save/load behavior without mutating a user's real Branch Memory?
- Should the session summary and self-improvement analysis be separate Branch Memory entries or sections in one compound handoff document?
- What exact shape and names should the session summary and repo-efficiency/self-learning artifacts use?
- What lessons from compound engineering should influence the self-learning analysis without making the workflow too heavy?
