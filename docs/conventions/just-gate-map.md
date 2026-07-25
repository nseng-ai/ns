# Just Gate Map

The single home for mapping a failing signal to the narrowest `just` gate in this repo. Skills and workflows that reproduce CI failures, verify conflict resolutions, or validate scoped changes point here instead of carrying their own gate tables. The `justfile` is authoritative for the live recipe inventory; when this map and the justfile disagree, the justfile wins — fix this map.

| Failing signal / touched area               | Narrowest gate                                         |
| ------------------------------------------- | ------------------------------------------------------ |
| dprint formatting (Markdown/JSON/YAML/TOML) | `just dprint-check` (autofix: `just dprint-fix`)       |
| TypeScript formatting                       | `just ts-format-check` (autofix: `just ts-format-fix`) |
| TypeScript lint                             | `just ts-lint` (autofix: `just ts-lint-fix`)           |
| TypeScript types/compile                    | `just ts-check`                                        |
| TypeScript unit/scenario tests              | `just ts-test`                                         |
| Integration tests                           | `just ts-test-integration`                             |
| Isolated-lane tests                         | `just ts-test-isolated`                                |
| TypeScript style guard                      | `just ts-test-typescript-style-guard`                  |
| Objective record structure                  | `just objective-check`                                 |
| Skill Exposure Policy drift                 | `just skill-exposure-check`                            |
| Docs/markdown only                          | `just dprint-check`; no code gate                      |
| Mixed or uncertain                          | `just check` (the full default suite)                  |

Prefer autofixers over hand-editing formatter output: `just fix` runs the dprint, TypeScript format, and TypeScript lint fixers together.
