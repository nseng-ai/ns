# Completion Roadmap Rebaseline

## Summary

Rebaselined the Objective record against the current branch evidence after the SDL shell bridge and dynamic provider slices. The shell bridge row and SDL proving-consumer row are now marked complete in `roadmap.md` because current branch commits provide:

- bash, zsh, and fish setup script generation through `sdl completion <shell>`;
- hidden newline-delimited resolver support through `sdl completion exec resolve`;
- top-level catalog completion without eager-loading command modules;
- selected-command-only imports for command-specific completion;
- stdout candidate-only behavior with selected-command diagnostics on stderr; and
- dynamic slot checkout branch completion via the first command-owned provider API.

`objective.md` now records the resolved open questions for the resolver output contract, diagnostics policy, dynamic-provider composition, and file/directory helper boundary. The retained file/directory helper and richer shell metadata work stays parked.

## Objective Impact

This corrects stale durable tracking that still showed the shell bridge and SDL proving-consumer roadmap rows as unchecked even though the current branch and existing Semantic Updates had delivered them. The only non-parked semantic roadmap row still open is user-facing documentation for the completion feature and its boundaries.

Closure is not ready yet because the documentation completion criterion remains unsatisfied and the Objective still asks for supported-shell/setup/limitations/alias-boundary docs.

## Follow-Ups

- Write the completion documentation covering supported shells, setup commands, resolver behavior, limitations, extension-author completion metadata, and the no-compatibility-aliases boundary.
- After documentation lands, run targeted validation and consider `objective-update`/`objective-close` if completion criteria are satisfied.
