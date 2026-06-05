# Roadmap

## Work

- [x] Design the `/handoff-tab` extension steelthread around the existing directed-handoff save/load mechanics.
  - Resolved as a two-phase Pi command plus deterministic launch tool: command derives/checks slug and queues exact handoff-save guidance; current Pi saves the artifact; tool verifies the artifact before opening cmux.
- [x] Implement the command/tool orchestration and successful handoff-and-launch flow.
  - Added `/handoff-tab <focus>` to the project-local handoff extension, deriving/checking slug and branch, queueing the exact save prompt, registering `handoff_tab_launch`, verifying the saved handoff, creating/renaming/sending to a focused cmux terminal surface, and launching Pi with `/handoff:pickup --branch <branch> <slug>`.
- [x] Implement fail-closed behavior and recovery messages.
  - Covered missing cmux context, no current branch via existing branch resolution, slug collision, post-save verification failure, cmux surface creation failure, rename failure, and send/Pi-launch-request failure without opening a pickup tab before the handoff exists; rename/send failures report created surface evidence and manual recovery.
- [x] Document and exercise the user-visible behavior.
  - Objective docs capture v1 scope and behavior; regression tests cover registration, exact save/launch prompt identity, successful cmux launch, outside-cmux failure, collision behavior, missing handoff verification, and rename/send recovery copy.

## Parked

- [ ] Cross-repo, cross-branch, and new-worktree handoff support.
- [ ] Managing or supervising the launched tab after opening it.
