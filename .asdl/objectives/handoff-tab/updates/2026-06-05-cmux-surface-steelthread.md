# cmux Surface Steelthread Decision

## Summary

Local cmux source at `/Users/schrockn/code/githubs/manaflow-ai/cmux` confirms that v1 can open the pickup session using existing CLI/RPC primitives without changing cmux:

- `CLI/cmux.swift` handles `new-surface` by calling `surface.create` with `workspace_id`, `pane_id`, and `focus` parameters.
- `CLI/cmux.swift` handles `rename-tab` by forwarding to `tab.action` with action `rename`.
- `CLI/cmux.swift` handles `send` by calling `surface.send_text` with an explicit `workspace_id` and `surface_id`.
- cmux regression tests cover focus-neutral layout defaults and background `surface.send_text` starting a terminal without selecting unrelated workspaces.

The `/handoff-tab` design is now specified as a two-phase Pi extension flow: the slash command derives and checks the slug, queues exact current-session handoff-save guidance, and the current Pi calls a deterministic launch tool only after saving the artifact. The launch tool verifies the handoff exists before creating a cmux surface, renaming it, and sending the Pi pickup command.

## Objective Impact

The design roadmap row is complete. The remaining implementation should be reviewable as a project-local Pi extension change in `ts/packages/pi-extensions/src/handoff.ts` plus `.pi/extensions/handoff.ts` registration tests, reusing existing cmux launch helpers where practical.

This resolves the main cmux API question: use `cmux identify`, `cmux --json new-surface`, `cmux rename-tab`, and `cmux send`. It also narrows “Pi launch failure” for v1 to observable failure to send the Pi launch command; process supervision and pickup completion remain out of scope.

## Follow-Ups

- Implement `/handoff-tab <focus>` and the launch tool with targeted tests in `ts/packages/pi-extensions/test/handoff.test.ts`.
- Decide during implementation whether `handoff_tab_launch` should be a normal model-visible tool or a narrower command-guided tool surface.
- Include a manual recovery command (`/handoff:pickup --branch <branch> <slug>`) in success/failure copy.
