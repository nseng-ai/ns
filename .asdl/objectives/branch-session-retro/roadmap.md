# Roadmap

## Work

- [x] PR 1: create the `asdl-retro` package skeleton with standalone `branch-retro` CLI, asdl plugin registration, outer `branch-retro` group, and hidden empty `exec` subgroup.
- [x] PR 2: add the reusable `asdl-core` session library with harness-neutral source/query models, the Pi JSONL adapter/parser, source refs, conservative repo/worktree association, warnings, fake source coverage, and tests for normal, partial, malformed, missing-root, and discovery behavior.
- [ ] PR 3: implement `branch-retro exec collect-evidence` as a thin consumer of `asdl-core` sessions, with repo/branch context, conservative session association, warnings, and a stable JSON envelope.
- [ ] PR 4: add reusable `asdl-core` evidence aggregation for repeated file reads, repeated shell commands, failed tools, tools by name, token usage when present, and large outputs when measurable, then expose it through `collect-evidence`.
- [ ] PR 5: add scenario and plugin smoke coverage for the standalone CLI, hidden exec command, JSON contract, and missing-session-root behavior.
- [ ] PR 6: create or update the branch retrospective skill so it invokes `branch-retro exec collect-evidence` and writes semantic recommendations from the returned evidence.
- [ ] PR 7: validate the multi-PR steelthread against real branch sessions, tighten payload size/limits, and update docs or skill guidance discovered during validation.

## Parked

- [ ] Add explicit branch metadata capture for future sessions so association can move from repo/worktree confidence to branch confidence.
- [ ] Add a durable per-session summary cache if repeated parsing is too slow or produces too much JSON for skills.
- [ ] Add Claude, Codex, or other non-Pi session source adapters behind the same session source boundary after the Pi steelthread proves the contract.
- [ ] Add an optional human-facing Markdown report command after the skill-facing JSON contract proves useful.
- [ ] Add approved-action helpers that apply documentation, skill, or codebase recommendations after a human accepts them.
