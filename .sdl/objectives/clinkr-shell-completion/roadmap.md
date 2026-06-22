# Roadmap

## Work

- [ ] Finalize the completion architecture boundary between Clinkr and SDL.
  - Decide whether Clinkr owns only a pure completion planner or also owns reusable host-command helpers for `completion <shell>` and hidden resolver commands.
  - Treat completion as a Clinkr primitive because Clinkr owns the surface plan; avoid fighting Commander's deliberate parser-only scope through a Commander plugin.
  - Preserve SDL as the first proving consumer without baking SDL extension policy into Clinkr.

- [ ] Build the static Clinkr completion engine.
  - Complete visible commands, visible options, implicit framework options, and enum choices from Clinkr/Commander command metadata without invoking handlers.
  - Prefer public Commander APIs plus Clinkr-owned surface metadata over private Commander fields.
  - Evidence: focused Clinkr tests over nested groups, hidden groups, raw commands, rendered commands, positionals, option choices, and implicit help/version/runtime options.

- [ ] Add bash, zsh, and fish shell bridge generation.
  - Use a shell-facing resolver command or equivalent endpoint rather than embedding stale command snapshots in generated scripts.
  - Include descriptions only where shell protocols safely support them.
  - Evidence: script-generation tests plus resolver contract tests; interactive shell behavior can be manually smoke-tested and recorded later.

- [ ] Integrate SDL completion as the proving consumer.
  - Add user-facing setup such as `sdl completion bash|zsh|fish` and a hidden resolver path.
  - Top-level completion should use side-effect-light command catalog discovery; selected-command flag completion should import only the selected command.
  - Ensure malformed unrelated SDL extensions do not corrupt shell completion output.

- [ ] Research and decide dynamic/custom completion hooks.
  - Compare yargs default-completion fallback, tabtab/Omelette callback models, Carapace specs/macros, and oclif manifest/cache patterns against Clinkr’s goals.
  - Produce a decision: implement a small provider API, park with blockers, or split follow-up work into a new Objective.
  - If implemented here, keep providers command-owned and explicitly fallible so runtime I/O does not leak into static completion planning.

- [ ] Document the completion feature and its boundaries.
  - Explain supported shells, installation examples, resolver behavior, limitations, and how extension authors should think about completion metadata.
  - Explicitly state that SDL does not retain old command names or compatibility aliases for autocomplete convenience.

## Parked

- [ ] PowerShell completion.
- [ ] Carapace spec export as an optional backend.
- [ ] Rich file/directory completion helpers beyond shell-native fallback behavior.
- [ ] Dynamic completion for every Clinkr-based CLI in the monorepo after SDL proves the pattern.
