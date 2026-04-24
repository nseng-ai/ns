# Claude adapter

Use this adapter after reading `generic.md`.

## Claude-specific notes

- Map **run worker**, **follow up**, and **wait** to the current
  Claude environment's native delegation primitives.
- Keep the protocol serial. Do not start the next slice until the
  current worker has returned a valid `stacker-handoff/v1` payload and
  the coordinator has verified it locally.
- Treat task tracking, progress UIs, and other coordinator niceties as
  optional harness features, not protocol requirements.
- Surface worker questions verbatim rather than letting the coordinator
  guess.

## Important constraint

Only use this skill if the delegated worker can participate in the live
repo/worktree that the coordinator is verifying. If the current Claude
environment cannot provide that, the skill is unsupported as written.
