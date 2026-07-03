# Danger tiers (ADR 0014)

Four **authoring** danger tiers. Tiers are `sdl-cli-design` discipline, not a
Clinkr framework type; `ClinkrInteraction.confirm` is the only confirmation
primitive, and `ClinkrInteraction.isInteractive()` gates prompting.

| Tier | Meaning                          | Authoring requirement                                         |
| ---- | -------------------------------- | ------------------------------------------------------------- |
| 0    | Read-only                        | No confirmation; safe to run unprompted.                      |
| 1    | Scoped / reversible local change | No prompt required; clear state-change feedback.              |
| 2    | Destructive or external write    | TTY-gated confirm; `--yes`/`-y` to confirm non-interactively. |
| 3    | High blast radius                | `--force`/`-f` precondition override; strongest confirmation. |

## Verb split — do not blur

- **`--yes` / `-y`** = "I confirm this destructive action" (Tier 2). Used when the
  command would otherwise prompt for confirmation.
- **`--force` / `-f`** = "override a failed precondition" (Tier 3). Used when a
  safety check would otherwise block the command.

A command needing both confirmation and precondition override should expose both
flags with these distinct meanings.

## Behavior rules

- **TTY-gated prompting.** Prompt only when `isInteractive()` is true. In
  non-interactive mode, do not prompt — fail fast with a `usageError(...)` whose
  `data` names the missing flag (`--yes` or `--force`).
- **Dry-run is success.** `--dry-run` inspects intended changes and returns
  `ok(...)` with the planned effect in `data`; it never mutates and never exits
  non-zero for "would change things."
- **Precondition override stays a failure path.** A blocked precondition without
  `--force` returns `failure(...)` (exit 2), with `errorType`/`data` explaining
  what to override and how.
- **User-environment writes outside the repo are Tier 2** (ADR 0015 #6). Writing
  dotfiles, shell config, or external tool state mutates the user's environment
  beyond the project, so gate it with `--yes`/`-y` + `requireInteractiveOrUsageError`
  (e.g. `ji shell install`). An explicit user-requested output path
  (`--output <path>`) stays Tier 1, and reversible external metadata keyed by
  caller-supplied IDs (not a user dotfile) stays Tier 1.

## Landed conformance (reference examples)

From the `clinkr-confirmation-danger-tiers` subobjective (ADR 0014 conformance):

- `ji handoff delete` — Tier 2, `--yes`; its missing `-y` is a cutover
  exception, not a pattern for new commands.
- `ji handoff gc`, `slot gc` — Tier 3, `--force`; apply `-f` for new
  human-facing Tier 3 commands unless a steered exception says otherwise.
- These examples fail fast non-interactively with `usageError` data naming the flag.
- `brmem put` remains a `failure(...)` precondition override; dry-runs remain
  `ok(...)`; typed `--confirm` phrases stay parked until a concrete command needs
  one.

## Known limitation

No first-class danger-tier metadata, typed preview, or required-confirmation-phrase
primitive exists in Clinkr. Implement tiers command-locally; do not claim a
framework tier API.
