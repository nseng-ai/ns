# Roadmap

## Work

- [x] Finalize the completion architecture boundary between Clinkr and SDL.
  - Decision: Clinkr owns the pure static completion planner/API first; reusable host-command helpers for visible `completion <shell>` commands and hidden resolver commands are deferred to shell bridge / SDL integration work.
  - Treat completion as a Clinkr primitive because Clinkr owns the surface plan; avoid fighting Commander's deliberate parser-only scope through a Commander plugin.
  - Preserve SDL as the first proving consumer without baking SDL extension policy into Clinkr.
  - Evidence: `ClinkrGroup.complete()` and `@sdl/clinkr/completion` expose tokenized static planning without requiring SDL imports or command-handler execution.

- [x] Build the static Clinkr completion engine.
  - Complete visible commands, visible options, implicit framework options, and enum choices from Clinkr/Commander command metadata without invoking handlers.
  - Prefer public Commander APIs plus Clinkr-owned surface metadata over private Commander fields.
  - Evidence: focused Clinkr tests cover nested groups, hidden groups, raw commands, rendered commands, positionals, option choices, and implicit help/version/runtime options.

- [ ] Add bash, zsh, and fish shell bridge generation.
  - Use a shell-facing resolver command or equivalent endpoint rather than embedding stale command snapshots in generated scripts.
  - Include descriptions only where shell protocols safely support them.
  - Evidence: script-generation tests plus resolver contract tests; interactive shell behavior can be manually smoke-tested and recorded later.

- [ ] Integrate SDL completion as the proving consumer.
  - Add user-facing setup such as `sdl completion bash|zsh|fish` and a hidden resolver path.
  - Top-level completion should use side-effect-light command catalog discovery; selected-command flag completion should import only the selected command.
  - Ensure malformed unrelated SDL extensions do not corrupt shell completion output.

- [x] Research and decide dynamic/custom completion hooks.
  - Decision: implement a small command-owned provider API in Clinkr, bridge it through `sdl-sdk`, and prove it with `sdl slot checkout` / `sdl slot co` local-branch completion.
  - Providers run only on the async completion path for selected command contexts; sync completion remains static.
  - Provider failures are explicitly captured so static candidates remain available and shell stdout remains candidate-only.
  - Evidence: `20260628T232011Z-dynamic-completion-hooks-slot-branches.md` plus Clinkr/kernel/Slot tests.

- [ ] Document the completion feature and its boundaries.
  - Explain supported shells, installation examples, resolver behavior, limitations, and how extension authors should think about completion metadata.
  - Explicitly state that SDL does not retain old command names or compatibility aliases for autocomplete convenience.

## Parked

- [ ] PowerShell completion.
- [ ] Carapace spec export as an optional backend.
- [ ] Rich file/directory completion helpers beyond shell-native fallback behavior.
- [ ] Dynamic completion for every Clinkr-based CLI in the monorepo after SDL proves the pattern.
