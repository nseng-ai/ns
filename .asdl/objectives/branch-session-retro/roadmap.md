# Roadmap

## Work

- [ ] PR 1: create the `asdl-retro` package skeleton with standalone `branch-retro` CLI, asdl plugin registration, outer `branch-retro` group, and hidden empty `exec` subgroup.
- [ ] PR 2: implement the Pi JSONL session source adapter and core session parser models with unit coverage for normal, partial, and malformed logs.
- [ ] PR 3: implement `branch-retro exec collect-evidence` with repo/branch context, conservative session association, aggregate metrics, warnings, and a stable JSON envelope.
- [ ] PR 4: add evidence aggregation for repeated file reads, repeated shell commands, failed tools, tools by name, token usage when present, and large outputs when measurable.
- [ ] PR 5: add scenario and plugin smoke coverage for the standalone CLI, hidden exec command, JSON contract, and missing-session-root behavior.
- [ ] PR 6: create or update the branch retrospective skill so it invokes `branch-retro exec collect-evidence` and writes semantic recommendations from the returned evidence.
- [ ] PR 7: validate the multi-PR steelthread against real branch sessions, tighten payload size/limits, and update docs or skill guidance discovered during validation.

## Parked

- [ ] Add explicit branch metadata capture for future sessions so association can move from repo/worktree confidence to branch confidence.
- [ ] Add a durable per-session summary cache if repeated parsing is too slow or produces too much JSON for skills.
- [ ] Add non-Pi session source adapters behind the same session source boundary.
- [ ] Add an optional human-facing Markdown report command after the skill-facing JSON contract proves useful.
- [ ] Add approved-action helpers that apply documentation, skill, or codebase recommendations after a human accepts them.
