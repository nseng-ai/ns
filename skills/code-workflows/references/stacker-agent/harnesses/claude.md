# Claude Code adapter

Use this adapter after reading `generic.md`. Concrete mappings for
Claude Code follow. Where this file and the core `SKILL.md` disagree,
the core skill wins.

## Worker delegation = the `Agent` tool

Map **run worker** to a single `Agent` tool call.

- Use `subagent_type: "general-purpose"`. Do not use `Plan` or
  `Explore` — those cannot implement and commit code.
- Put the filled-in brief from `references/stacker-agent/brief-template.md` directly
  into the `prompt` argument. Do not hand the worker a path and ask it
  to read the brief.
- Give the tool call a short `description` naming the slice, e.g.
  `"Slice 2: add reconcile CLI"`.

### Do **not** set `isolation: "worktree"`

`Agent` supports `isolation: "worktree"`, which runs the worker in a
temporary git worktree. That silently breaks this skill: the
coordinator reads `git` state in the parent worktree between slices and
would not see the worker's branch, head SHA, or diff. Always leave
`isolation` unset so the worker shares the coordinator's cwd and
filesystem.

## One worker per slice, one `Agent` call per message

Claude Code generally encourages batching independent tool calls in a
single message. That guidance **does not apply here**. The coordinator
must:

- issue exactly one `Agent` call for the current slice,
- wait for that call to return,
- verify the handoff locally, and only then
- issue the next slice's `Agent` call in a later message.

Never place two `Agent` calls for two different slices in the same
message. Never start slice N+1 before slice N's handoff verifies.

## Retry = `SendMessage`, not a second `Agent` call

If the handoff is malformed or `status != "ok"` and the skill's
failure/retry policy allows one targeted follow-up, continue the
_existing_ worker via `SendMessage` (`to: <agent id or name>`) with a
short, concrete correction ("validation failed on X; fix and re-emit
the handoff"). Do not call `Agent` a second time for the same slice —
that starts a fresh worker with no memory of the slice context.

If the follow-up still does not produce a clean handoff, stop and
surface per the main skill's failure policy.

## Extracting the structured handoff

The `Agent` tool returns the worker's final assistant message as the
tool result. The brief instructs the worker to put a single JSON line
conforming to `stacker-handoff/v1` in that message.

To parse it:

1. Scan the returned text for a line starting with
   `{"schema":"stacker-handoff/v1"`.
2. Parse that line as JSON.
3. Treat any surrounding prose as commentary only — verification runs
   off the parsed JSON plus the coordinator's own `git` inspection.

If no such line is present, treat it as a malformed handoff and apply
the retry policy above.

## Verification is the coordinator's job, not the worker's

After the worker returns, the coordinator — still in Claude Code, not
via another `Agent` call — runs the verification steps from the main
`SKILL.md` directly with `Bash` and `Read`:

- resolve `branch` locally and confirm its head equals `head_sha`,
- run the validation command if the worker's report is at all
  suspicious,
- `git diff <base>..<branch> --stat` and skim the full diff,
- for commit-series runs, confirm `branch` is the target branch and
  `head_sha` is a descendant of the resolved slice base, and
- record `downstream_notes` for the next slice's brief.

Do not delegate verification back to a subagent.

## Progress tracking is optional

`TaskCreate` / `TaskUpdate` can make the serial loop easier to follow,
but they are not part of the protocol. Skip them for short stacks; use
them for longer ones if it helps you keep slices in order. Either way,
the protocol's source of truth is the structured handoff plus local
`git` state, not the task list.

## Shared worktree: supported

Claude Code's `Agent` tool (with `isolation` unset) runs the worker in
the coordinator's cwd and on the real filesystem. Branches, commits,
and files the worker creates are visible to the coordinator
immediately. That is the execution model this skill requires, so the
generic adapter's "shared repo/worktree assumption" is satisfied in
Claude Code by default — provided you follow the `isolation` rule
above.
