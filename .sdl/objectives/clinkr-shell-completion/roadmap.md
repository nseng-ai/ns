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

- [x] Add bash, zsh, and fish shell bridge generation.
  - Use a shell-facing resolver command or equivalent endpoint rather than embedding stale command snapshots in generated scripts.
  - Descriptions are intentionally omitted in the first bridge; candidate stdout is newline-delimited values only.
  - Evidence: Clinkr shell script renderer and newline formatter plus kernel resolver scenario tests, recorded in `20260628T224146Z-sdl-shell-completion-proving-consumer.md`.

- [x] Integrate SDL completion as the proving consumer.
  - `sdl completion bash|zsh|fish` prints setup scripts and hidden `sdl completion exec resolve` resolves candidates.
  - Top-level completion uses catalog metadata without eager-loading command modules; selected-command flag/value completion imports only the selected command.
  - Malformed unrelated SDL extensions do not corrupt resolver stdout; selected broken command diagnostics go to stderr with shell-friendly exit code 0.
  - Evidence: kernel completion CLI scenario tests and dynamic slot branch completion tests, recorded in `20260628T224146Z-sdl-shell-completion-proving-consumer.md` and `20260628T232011Z-dynamic-completion-hooks-slot-branches.md`.

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
