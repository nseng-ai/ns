# Architecture & Module Map

Source: `packages/roaster/` (~3,476 LOC Python). Target: `ts/packages/roaster/`, mirroring
`ts/packages/pr-address/`. Reference everything against those two trees.

## The roaster pipeline (what it does)

CI-only PR-diff findings runner. One CI run, per review key:

```
review run <key>                      # discover review def → applicability → resolve model →
  → JSON envelope (findings)            resolve base ref → git diff → cap diff → Claude Code → findings
  ├─ exec post-inline-findings        # envelope on stdin → map findings to commentable diff lines →
  │    → inline-result JSON             create ONE batched PR review (inline comments), dedup by marker
  └─ exec format-findings-comment     # envelope on stdin + inline-result file →
       → markdown body                  render aggregate summary comment (markdown)
     | exec post-findings-comment     # markdown body on stdin → find-by-marker → create/update PR
          → (posts comment)             discussion (issue) comment, merge a capped activity log
```

The full CI driver is `.github/workflows/roaster.yml` (two jobs: `discover` fans out a matrix of
review keys; `review` runs the per-key pipeline above). See `05-…§CI`.

## Python → TS module map

`P` = Python module under `packages/roaster/src/roaster/`. `T` = proposed TS file under
`ts/packages/roaster/src/`. Spec = which prework doc details it.

| P (Python) | T (TypeScript) | Nature | Spec | Slice |
|---|---|---|---|---|
| `diff_parsing.py` | `diff-parsing.ts` | pure | 02 | 1 |
| `review_definition.py` | `review-definition.ts` | pure (+ `yaml`) | 02 | 1 |
| `review_applicability.py` | `review-applicability.ts` | pure | 02 | 1 |
| `asdl_core.project_config` `[roaster.diff]` parsing | `project-config.ts` (or reuse via asdl-core TS if ported) | pure (+ `smol-toml`) | 02 | 1 |
| `models.py` (Pydantic) | `models.ts` (Zod schemas + discriminated unions) | domain | 02/03/04 | 2 |
| `models.py` `RoasterFailure` union | `failures.ts` (discriminated-union error values) | domain | all | 2 |
| `gateways/local_diff/{gateway,real,fake}.py` | `gateways/local-diff.ts` (iface + real + fake) | gateway | 02/05 | 3 |
| `gateways/review_catalog/{gateway,real,fake}.py` | `gateways/review-catalog.ts` | gateway | 05 | 3 |
| `git_toplevel.py` | (use asdl-core `GitGateway` / local-diff gateway) | I/O glue | 05 | 3 |
| `harness/invocation.py` | `harness/invocation.ts` (real adapter, injected runner) + pure parse/prompt/cap fns | gateway + pure | 03 | 4 |
| `harness/fake.py` | `harness/fake.ts` | gateway fake | 03 | 4 |
| `prompts/review_prompt.md`, `prompts/review_system_findings.md` | copy verbatim into `src/prompts/` | asset | 03 | 4 |
| `asdl_core.gh` PR ops (5 used) | `gateways/github.ts` (roaster-local, 5 methods, iface + real + fake) | gateway | 04 | 5 |
| `inline_commentability.py` | `inline-commentability.ts` | pure | 04 | 6 |
| `findings_publication.py` | `findings-publication.ts` | pure | 04 | 6 |
| `cli/main.py`, `cli/roaster/group.py`, `cli/roaster/context.py` | `cli.ts`, `context.ts` | CLI/DI | 05 | 7 |
| `cli/plugin.py` (`asdl.plugins`) | — (no TS analog; standalone only) | — | 05 | — (parked) |
| `cli/roaster/review/{group,list_reviews,run}.py` | `review-list.ts`, `review-run.ts` (+ clinkr group) | CLI ops | 05 | 7 |
| `workflow.py` (`run_review_by_key`) | `workflow.ts` (pure orchestration over gateways) | orchestration | 05 | 7 |
| `cli/roaster/exec/{group,post_inline_findings,format_findings_comment,post_findings_comment}.py` | `exec-*.ts` under hidden `exec` group | CLI ops | 04/05 | 7 |

## Proposed target file tree

Mirrors pr-address. Omit pr-address's payload-store / `stdout-mode` subsystem — roaster returns
results inline and has no payload store.

```
ts/packages/roaster/
├── package.json                 # @asdl/roaster; deps: @asdl/clinkr, @asdl/core, zod, yaml, smol-toml
├── tsconfig.json                # 4-line extends ../../tsconfig.json
├── src/
│   ├── cli.ts                   # buildCli()/runCli(); root group + hidden `exec` subgroup
│   ├── index.ts                 # export { runCli, type CliDeps }
│   ├── context.ts               # RoasterContext + createRealRoasterContext()
│   ├── models.ts                # Zod domain schemas (LocalDiff, DiffFile, ReviewDefinition, ReviewFinding, FindingsReview, ReviewUsage, ReviewInputCoverage, requests/results)
│   ├── failures.ts              # discriminated-union failure values (replaces RoasterFailure)
│   ├── diff-parsing.ts          # pure (Slice 1)
│   ├── review-definition.ts     # pure + yaml (Slice 1)
│   ├── review-applicability.ts  # pure (Slice 1)
│   ├── project-config.ts        # asdl.toml [roaster.diff] + glob→pathspec (Slice 1/3)
│   ├── inline-commentability.ts # pure (Slice 6)
│   ├── findings-publication.ts  # pure (Slice 6)
│   ├── workflow.ts              # run_review_by_key orchestration (Slice 7)
│   ├── gateways/
│   │   ├── local-diff.ts        # iface + RealLocalDiffGateway + fake (Slice 3)
│   │   ├── review-catalog.ts    # iface + real + fake (Slice 3)
│   │   ├── harness.ts           # HarnessGateway iface + fake (Slice 4)
│   │   └── github.ts            # roaster-local 5-method PR gateway + fake (Slice 5)
│   ├── harness/
│   │   ├── invocation.ts        # real adapter (injected CommandExecApi) + pure parse/prompt/cap fns (Slice 4)
│   │   └── prompt-assembly.ts   # pure prompt build + diff-cap/coverage (Slice 4)
│   ├── prompts/                 # review_prompt.md, review_system_findings.md (copied)
│   ├── exec-operation.ts        # defineExecOperation + RoasterExecContext (cf. pr-address)
│   ├── review-list.ts           # `review list` (Slice 7)
│   ├── review-run.ts            # `review run` (Slice 7)
│   ├── exec-post-inline-findings.ts
│   ├── exec-format-findings-comment.ts
│   ├── exec-post-findings-comment.ts
│   └── operation-schemas/       # Zod --json-schema docs (index.ts + per-domain)
└── test/
    ├── scenario/                # CLI via runCli/buildCli (review list/run, exec, help/version/runtime)
    ├── unit/                    # pure-fn ports of all Python unit tests
    ├── gateways/                # Real* gateway adapters
    └── support/                 # run-scenario harness, in-memory fakes
```

Also add a `justfile` recipe mirroring `install-pr-address`:
`install-roaster: (_install-ts-shim "roaster" "ts/packages/roaster/src/cli.ts" "just install-roaster")`.

## Slice ordering & dependencies

The roadmap order is correct and dependency-sound. Dependency notes:

1. **Scaffold + pure core** (`diff-parsing`, `review-definition`, `review-applicability`,
   `project-config`). No gateway deps. Highest test density; fully unit-testable. **Start here.**
2. **Domain + error model** (`models.ts`, `failures.ts`). Depends on nothing but is depended on by
   everything; can be built incrementally alongside Slice 1 (define schemas as each consumer needs
   them). The diff-cap math (Slice 4) needs `LocalDiff`/`DiffFile`/`ReviewInputCoverage` shapes.
3. **local-diff + review-catalog gateways.** Depend on asdl-core `CommandExecApi` (exec) and the
   pure config/diff-parsing from Slice 1. local-diff produces `LocalDiff`; review-catalog produces
   review sources for `parse_review_definition`.
4. **Harness.** Depends on Slice 2 (request/response models) and the prompt assets. Riskiest;
   isolate the pure parse/prompt/cap functions and test them directly before the real adapter.
5. **GitHub gateway.** Independent of 3/4; depends only on Slice 2 shapes (`PRChangedFile`,
   `PRReviewComment`, `PRInlineCommentInput`, `PRDiscussionComment`).
6. **Publication + inline-commentability.** Pure; depend on Slice 2 (`ReviewFinding`,
   `PRChangedFile`). Independent of gateways.
7. **CLI wiring.** Depends on 1–6: `review list/run` wire the catalog/diff/harness gateways through
   `workflow.ts`; the three `exec` commands wire the GitHub gateway + publication/inline modules.
8. **CI cutover.** Flip `roaster.yml` from `uv run roaster …` to the TS bin. Must preserve every
   command path, arg order, stdin/stdout piping, and the `--format json` `.data` shape (see `05-§CI`).
9. **Delete Python `packages/roaster`** — gated on a green TS CI run on a real PR.

Slices 3/4/5/6 are mutually independent after Slices 1–2 land — parallelizable across agents.

## Conventions to follow (repo-mandated)

- Load `typescript-style` + `typescript-fake-driven-testing` skills before implementing.
- `erasableSyntaxOnly` + `verbatimModuleSyntax`: use `import type`, `.ts` import extensions.
- **Errors-as-values**: gateways and parsers return discriminated unions; handlers convert to clinkr
  `ok`/`negative`/`failure`. Nothing throws on expected paths. This replaces the `RoasterFailure`
  Pydantic union — redesign the error-type names idiomatically (clean break allowed).
- **Zod boundary schemas**: `z.object` (closed, `additionalProperties:false`, ≈ Pydantic
  `extra="forbid"`) vs `z.looseObject` (open) for external JSON (gh/git). `--json-schema` via
  `z.toJSONSchema`.
- **Gateway pattern**: interface + `Real*` class (injected `CommandExecApi`) + in-memory fake.
  Tests select real-vs-fake purely by which `RoasterContext` is passed to `runCli`.
- Hidden `exec` subgroup: `new ClinkrGroup({ name: "exec", isHidden: true })` then
  `root.group(execGroup)`.
- Package `index.ts` re-exports only `runCli`/`CliDeps`. No barrel re-exports elsewhere (repo rule:
  import from canonical module).

## Decisions (resolved Open Questions) — evidence

- **`yaml` (eemeli) v2.x** for frontmatter: `yaml@2.9.0` already transitive in `ts/pnpm-lock.yaml`;
  `js-yaml` absent. Parse → validate mapping with Zod (mirrors Python's `yaml.safe_load` + manual
  validation in `review_definition.py`).
- **`smol-toml`** for TOML: direct dep `ts/packages/areg/package.json:21`, imported
  `areg/src/operations/project-agents.ts:2`, locked 1.6.1.
- **Token estimate** `Math.ceil([...text].length / 4)`: Python `len()` counts code points
  (`diff_parsing.py:44-48`); TS `.length` counts UTF-16 units. Use spread to match.
- **No TS asdl-plugin mechanism**: no `asdl` umbrella package or `asdl.plugins` analog in `ts/`;
  every TS package ships a standalone `bin` only. `cli/plugin.py` has nothing to port to.
- **GitHub via `gh` CLI + REST** through injected exec runner; roaster-local 5-method gateway (not
  asdl-core's 17-method `PRGateway`). Endpoints in `04-github-and-publication-spec.md`.
- **Zod `^4.4.3`** uniform across `ts/`; clinkr relies on Zod-4 APIs.
</content>
