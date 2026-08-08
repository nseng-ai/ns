# Just Gate Map

The single home for mapping a failing signal to the narrowest `just` gate in this repo. Skills and workflows that reproduce CI failures, verify conflict resolutions, or validate scoped changes point here instead of carrying their own gate tables. The `justfile` is authoritative for the live recipe inventory; when this map and the justfile disagree, the justfile wins — fix this map.

| Failing signal / touched area                     | Narrowest gate                                         |
| ------------------------------------------------- | ------------------------------------------------------ |
| dprint formatting (Markdown/TOML)                 | `just dprint-check` (autofix: `just dprint-fix`)       |
| TypeScript and selected workspace JSON formatting | `just ts-format-check` (autofix: `just ts-format-fix`) |
| TypeScript lint                                   | `just ts-lint` (autofix: `just ts-lint-fix`)           |
| TypeScript types/compile                          | `just ts-check`                                        |
| TypeScript unit/scenario tests                    | `just ts-test`                                         |
| Integration tests                                 | `just ts-test-integration`                             |
| Isolated-lane tests                               | `just ts-test-isolated`                                |
| TypeScript style guard                            | `just ts-test-typescript-style-guard`                  |
| Objective record structure                        | `just objective-check`                                 |
| Docs/markdown only                                | `just dprint-check`; no code gate                      |
| Mixed or uncertain                                | `just check` (the full default/core suite)             |

`just check` (and bare `just`) covers the default/core suite, not the specialized integration,
isolated, or TypeScript style guard lanes. Use the narrow dedicated gate above when one of those lanes
is relevant; `just ci` is the broader opt-in local aggregate that adds integration and the style guard
while still omitting isolated tests.

Prefer autofixers over hand-editing formatter output: `just fix` runs the dprint, TypeScript format, and TypeScript lint fixers together.
