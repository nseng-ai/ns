# Roadmap

## Work

- [x] Design the `/handoff-tab` extension steelthread around the existing directed-handoff save/load mechanics.
  - Resolved as a two-phase Pi command plus deterministic launch tool: command derives/checks slug and queues exact handoff-save guidance; current Pi saves the artifact; tool verifies the artifact before opening cmux.
- [ ] Implement the command/tool orchestration and successful handoff-and-launch flow.
  - Add `/handoff-tab <focus>` to the project-local handoff extension, derive/check slug and branch, queue the save prompt, add the launch tool, verify the saved handoff, create/rename/send to a focused cmux terminal surface, and launch Pi with `/handoff:pickup --branch <branch> <slug>`.
- [ ] Implement fail-closed behavior and recovery messages.
  - Cover missing cmux context, detached HEAD/no branch, slug collision, current-session handoff save failure, post-save verification failure, cmux surface creation failure, rename failure, and send/Pi-launch-request failure without opening a pickup tab before the handoff is saved.
- [ ] Document and exercise the user-visible behavior.
  - Ensure the original session confirmation, pickup-session first action, manual recovery command, and v1 scope constraints are clear enough for later hardening and regression tests.

## Parked

- [ ] Cross-repo, cross-branch, and new-worktree handoff support.
- [ ] Managing or supervising the launched tab after opening it.
