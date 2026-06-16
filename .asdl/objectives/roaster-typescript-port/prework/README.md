# Roaster TypeScript Port — Prework

This directory is downstream-execution prework for the **roaster-typescript-port** objective
(`../objective.md`, `../roadmap.md`). It captures the verified, code-referenced contracts of the
Python `packages/roaster` source and the TS target conventions (`ts/packages/pr-address` as
reference), so a downstream agent can implement each roadmap slice without re-reverse-engineering.

Every claim here was extracted from source with `file:line` references and the two highest-risk
facts (the Claude Code argv and the CI invocation contract) were independently re-verified against
`packages/roaster/src/roaster/harness/invocation.py` and `.github/workflows/roaster.yml`.

## Documents

| Doc | Covers | Roadmap slice(s) |
|---|---|---|
| `01-architecture-and-module-map.md` | Python→TS module map, target file tree, slice ordering & dependencies, resolved decisions, conventions | all |
| `02-pure-core-spec.md` | diff parsing, token estimation, review-definition frontmatter, applicability globs, `asdl.toml [roaster.diff]` + git-pathspec conversion | Slice 1, parts of 3 |
| `03-harness-spec.md` | Claude Code CLI invocation contract, stdin pump, output parsing, prompt assembly, diff-cap/coverage math, the harness seam | Slice 4 |
| `04-github-and-publication-spec.md` | the 5-method roaster-local GitHub gateway, inline-commentability mapping, findings publication (markers/rendering/activity-log), the three `exec` commands | Slices 5, 6, 7 |
| `05-ts-scaffold-and-ci-cutover.md` | `package.json`/`tsconfig`/`cli.ts` scaffold, clinkr + asdl-core helpers, CLI surfaces (`review list`/`run`), CI invocation contract & cutover | Slices 1, 7, 8, 9 |

## How to use

1. Read `01-architecture-and-module-map.md` first — it is the map and the slice plan.
2. Before any TS implementation, load the `typescript-style` and `typescript-fake-driven-testing`
   skills (required by repo `AGENTS.md`).
3. For the slice you are executing, read its spec doc above. Each spec doc ends with a **TS test
   checklist** distilled from the existing Python tests — port those cases.
4. Treat the Python source as the parity oracle, **not** as a structure to mimic. Per the objective
   this is a clean break: markers, the CLI JSON envelope, and error-type names are free to be
   redesigned idiomatically. The spec docs flag exactly which behaviors must match (the parity
   oracle is the *model input* and *CI wire contract*) vs. which are free to change.

## Resolved decisions (were objective "Open Questions")

These are settled by codebase evidence; see `01-architecture-and-module-map.md §Decisions` for the
reasoning and `file:line` evidence.

- **YAML parser:** `yaml` (eemeli), v2.x — already transitively in the TS lockfile; parse then
  validate the mapping with Zod. Do **not** use `js-yaml` (absent from the tree).
- **TOML parser:** `smol-toml` (confirmed: direct dep of `ts/packages/areg`, locked at 1.6.1).
- **Token estimation:** `text === "" ? 0 : Math.ceil([...text].length / 4)`. Must count Unicode
  **code points** (`[...text].length`), not UTF-16 units (`text.length`) — they differ for non-BMP
  characters and the count drives diff-cap inclusion.
- **asdl-plugin mounting:** there is **no TS analog** of Python's `asdl.plugins` entry point. Ship
  standalone-CLI-only (matches every existing TS package). The roadmap's "Parked" plugin item stays
  parked; nothing to port from `cli/plugin.py`.
- **GitHub API mechanism:** `gh` CLI shelled through an injected exec/process-runner, REST endpoints
  via `gh api --paginate` / `--input -`, mirroring the Python real-gateway helpers. Build a fresh
  **5-method roaster-local** gateway; do **not** share or extend asdl-core's PR gateway.
- **Zod version:** `^4.4.3` (uniform across all TS packages; load-bearing for clinkr integration).
</content>
