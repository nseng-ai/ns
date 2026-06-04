# Roadmap

## Work

- [ ] Design the `/handoff-tab` extension steelthread around the existing directed-handoff save/load mechanics.
  - Resolve the concrete extension location, slash-command registration shape, focus prompting behavior, semantic slug creation, and collision handling.
- [ ] Implement the successful handoff-and-launch flow.
  - Save a directed handoff for the current cwd/current git branch, open a focused cmux tab in the current workspace titled `handoff: <slug>`, and start Pi in the same cwd with instructions to load and summarize that handoff.
- [ ] Implement fail-closed behavior and recovery messages.
  - Cover missing cmux context, detached HEAD/no branch, handoff save failure, slug collision, cmux tab launch failure, and Pi launch failure without opening a pickup tab before the handoff is saved.
- [ ] Document and exercise the user-visible behavior.
  - Ensure the original session confirmation, pickup-session first action, and v1 scope constraints are clear enough for later hardening and regression tests.

## Parked

- [ ] Cross-repo, cross-branch, and new-worktree handoff support.
- [ ] Managing or supervising the launched tab after opening it.
