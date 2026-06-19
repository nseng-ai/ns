# Aretro TypeScript Port

## Thesis

Port `aretro` from its current Python package to a standalone TypeScript package so Branch retrospective evidence collection becomes TS-default in the broader asdl toolkit migration while preserving the tool's deterministic, privacy-conscious boundary.

`aretro` is the deterministic evidence layer for the public `branch-retro` skill. The CLI collects compact factual observations from local agent session logs and branch context; the language-model skill interprets those observations into findings and recommendations. This port should keep that boundary intact: TypeScript may improve small CLI/help/docs ergonomics when discovered and justified, but it should not move semantic diagnosis, recommendations, or branch-retro prose generation into the `aretro` CLI.

The migration should follow the umbrella TypeScript porting playbook: inventory durable contracts before implementation, port through fake-driven seams and scenario tests, make the `branch-retro` skill runner consume the TypeScript default, audit the existing checkout-free `uvx`/prod runner behavior before Python deletion, then retire the Python package only after parity and caller cleanup are proven.

## Scope

- Create a standalone TypeScript package named `@asdl/aretro` under `ts/packages/aretro` with an `aretro` binary.
- Preserve the current public command boundary used by the `branch-retro` skill:
  - root `aretro` help/version/runtime behavior, with `--runtime` updated to report TypeScript after cutover;
  - hidden `exec` subgroup that remains hidden from top-level help but invocable;
  - `aretro exec collect-evidence`;
  - `aretro exec read-evidence-detail`;
  - `--format json` Clinkr envelope behavior used by the skill;
  - human output for ad hoc CLI use where it is documented or tested.
- Preserve `collect-evidence` request semantics:
  - `--repo` defaults to current working directory;
  - `--branch` defaults to the current git branch and reports detached/unresolved states clearly;
  - `--session-root` optionally overrides the session source root;
  - `--max-sessions` defaults to 20;
  - `--payload-mode inline|payload` defaults to `inline`;
  - `--payload-session-id` controls payload artifact placement when payload mode is used.
- Preserve compact evidence output concepts and JSON fields unless a deliberate, recorded compatibility decision changes them:
  - `success`, `error`, `repo`, `query`, `source`, `aggregate_metrics`, `sessions`, `warnings`, and `evidence_items`;
  - branch source values `explicit`, `git_current_branch`, `detached`, and `unresolved`;
  - factual evidence kinds currently produced by shared session aggregation: `tool_usage_count`, `failed_tool_result`, `repeated_file_read`, `repeated_shell_command`, `token_usage_observed`, and `large_output_observed`;
  - no raw transcript text, prompts, assistant prose, tool output, command output, or unbounded user-entered text in compact output.
- Preserve payload mode as a sanitized local detail-expansion mechanism:
  - raw Clinkr payload artifact descriptor `aretro-collect-evidence`;
  - payload data `schema_version: 1`;
  - `payload_reference` in compact output;
  - `detail_locator_hints` with `/data` roots;
  - `read-evidence-detail` restricted to JSON Pointers under `/data`;
  - successful raw payload envelope validation before reading detail values;
  - bounded command subjects with truncation metadata and SHA-256 prefix for long commands.
- Port the session-source and git boundaries through TypeScript gateways/fakes:
  - use existing shared TypeScript git infrastructure when sufficient, and port only the minimal session adapter/evidence seams needed by `aretro`;
  - keep session parsing and evidence aggregation factual and harness-neutral;
  - keep session, evidence, and payload seams package-local until a second consumer proves shared extraction.
- Update the `branch-retro` skill and `skills/branch-retro/scripts/aretro-run` so repo-local use resolves to the TypeScript CLI.
- Add `just install-aretro` as the expected repo-local TypeScript source shim if PATH execution remains useful.
- Audit the existing `ASDL_ARETRO_MODE=prod` / `uvx --from aretro==0.1.0` path before Python deletion. Preserve, replace, or deliberately retire checkout-free execution based on caller evidence; stop before deleting Python if a real required consumer still depends on the PyPI package behavior.
- Retire active Python workspace/build/test/docs references to `packages/aretro` only after TypeScript parity, skill runner cutover, and distribution/caller cleanup are complete.
- Record rollback/reference evidence for the deleted Python implementation before removing it from active paths.
- Feed the final cutover outcome and reusable lessons back into `.asdl/objectives/port-asdl-toolkit-to-typescript/`.

## Non-Goals

- Moving semantic diagnosis, recommendations, prioritization, or retrospective prose generation into the deterministic CLI. That remains the `branch-retro` skill's responsibility.
- Adding new evidence kinds, richer reports, dashboards, scoring, quality judgments, or direct branch-improvement recommendations during the port unless a small compatibility/UX fix is explicitly justified and recorded.
- Creating or reviving an `asdl aretro` plugin surface unless caller inventory proves it is a live requirement. Current skill guidance says to use standalone `aretro`, not `asdl aretro`.
- Publishing to npm, pushing packages, publishing PyPI replacements, or changing external package registries without explicit human confirmation.
- Broadly porting all Python `asdl-core` session infrastructure as a module map. Port only the seams `aretro` needs, and promote shared TypeScript foundations only when repeated consumers prove the need.
- Browser-compatible execution. `aretro` depends on local git, filesystem/session logs, and local payload artifacts.
- Changing Objective or Branch Memory tracking as part of the CLI. The tool emits evidence; durable workflow interpretation remains in Objectives/skills.
- Byte-for-byte Click help/usage parity. Command names, options, JSON contracts, safety/privacy guarantees, and skill-facing behavior are durable; incidental parser wording may adopt repo TypeScript CLI conventions.

## Completion Criteria

- `ts/packages/aretro` exists with package identity `@asdl/aretro`, an `aretro` bin, strict TypeScript package wiring, Vitest scripts, and repo-standard relative `.ts` imports.
- The TypeScript CLI exposes root help/version/runtime, hidden `exec`, `exec collect-evidence`, and `exec read-evidence-detail` through `@asdl/clinkr` or an explicitly justified TS command boundary.
- TypeScript tests cover the current durable CLI contract: top-level help hides `exec`, `exec` remains invocable, command help lists expected options, `--runtime` reports TypeScript, and JSON envelopes preserve the skill-facing fields.
- `collect-evidence` resolves repo/branch state correctly for explicit branch, current branch, detached HEAD, non-git repo, git command failure, and session-source warnings.
- `collect-evidence` emits compact factual evidence without raw prompt/transcript/tool/command output, preserving the current evidence item kinds and aggregate/session summary fields unless a recorded compatibility decision changes them.
- Payload mode writes a schema-version-1 sanitized detail artifact, returns `payload_reference` and `detail_locator_hints`, bounds long command subjects, and supports targeted `read-evidence-detail` reads under `/data` while rejecting invalid pointers or malformed payloads.
- TypeScript fakes and scenario tests cover git state, session source state, payload store behavior, warning propagation, and non-ideal states without reading real operator session logs in ordinary tests.
- A focused real-adapter smoke test or manual evidence proves the TypeScript CLI can collect evidence from this checkout's real session source without exposing raw transcript contents in durable Objective files.
- `skills/branch-retro/SKILL.md` and `skills/branch-retro/scripts/aretro-run` invoke the TypeScript-backed path for repo-local use, and their instructions remain public-skill-safe.
- Distribution is resolved from caller evidence: `just install-aretro` exists if PATH shim execution is the accepted local model; `install-tools` inclusion is either justified by active installed-tool consumers or deliberately skipped; checkout-free `prod`/`uvx` behavior is preserved, replaced, or explicitly retired before Python deletion.
- Active docs and docs-site pages no longer instruct users to install or invoke the Python package as the default after cutover; any historical/rollback references are clearly marked as such.
- Python `packages/aretro` and root workspace/build/test/publish wiring are removed only after TypeScript parity and caller/docs cleanup are complete.
- Rollback/reference evidence for the deleted Python implementation is recorded before deletion.
- Relevant validation passes for the touched slices. For TypeScript code, default to `pnpm --dir ts run check`, `pnpm --dir ts run test`, `just ts-guard`, and package-focused `@asdl/aretro` checks/tests while debugging. For root Python package deletion or workspace config edits, run the affected Python/lock/docs checks and broader repo validation appropriate to the diff.
- The umbrella TypeScript migration Objective records `aretro` as TS-default/completed or records a deliberate stop/retirement decision if the port uncovers a blocking consumer/distribution constraint.

## Definition of Progress

Progress is keepable when:

- the slice advances `aretro` toward replacing the Python evidence CLI without moving semantic retrospective judgment into the deterministic layer;
- the repo remains in a coherent state with either a proven dual-implementation transition or a completed TypeScript default;
- compact and payload evidence remain privacy-conscious and bounded;
- expected external failures are modeled as data or Clinkr failures rather than uncaught adapter exceptions;
- session-source, git, filesystem, process, and payload boundaries are injectable and fake-testable;
- accepted divergences from Python are documented as TypeScript cutover decisions, not accidental drift;
- each branch can be reviewed by one clear thesis: contract/shell, evidence/payload parity, skill/distribution cutover, or Python retirement.

Do not keep changes that:

- expose raw transcript text, prompts, assistant prose, tool output, or command output in compact evidence;
- add semantic diagnosis or recommendations to the CLI;
- delete Python before the TypeScript CLI, skill runner, docs, distribution decision, and rollback/reference evidence are ready;
- require live operator session logs, live external services, or real registry publishing for ordinary test confidence;
- make ordinary `aretro` behavior depend on Graphite or GitHub;
- introduce shared framework abstractions solely from one `aretro` use case;
- use `as unknown as`, non-erasable TypeScript constructs, module mocks for domain behavior, or deep imports into another package's `src/` tree.

Useful evidence includes:

- a contract inventory that classifies durable CLI/JSON/payload/skill behavior versus incidental Python/Click details;
- package scenario tests over in-memory fakes for success and non-ideal states;
- unit tests for evidence DTO conversion, payload document construction, pointer validation, and command-subject bounding;
- focused real-adapter smoke evidence that does not persist raw transcript contents;
- grep evidence for active `uv run aretro`, `uvx ... aretro`, `packages/aretro`, `asdl aretro`, and `aretro.plugin` references before and after cutover;
- TypeScript check/test results and docs/lock validation appropriate to the touched files;
- Semantic Updates in this Objective and the umbrella Objective when decisions, risk changes, cutover gates, or deletion evidence land.

## Runner Policy

This Objective is designed for autonomous stack execution after a human preview of the proposed stack shape.

- Direct execution is allowed for a previewed stack of coherent migration slices that stays within this Objective's scope and follows the repo TypeScript, fake-driven testing, and Objective-update conventions.
- A runner may execute multiple adjacent roadmap rows in one stack when they form a dependency chain, such as package shell → compact evidence parity → payload detail parity, or skill runner cutover → Python deletion closeout.
- The runner should stop and ask before changing the evidence/diagnosis boundary, adding new evidence kinds, requiring registry publication, preserving checkout-free distribution through a new external package, adding `aretro` to `install-tools` without caller evidence, or deleting Python while active `uvx`/prod consumers remain unresolved.
- The runner must not publish packages, push branches, create or edit GitHub PRs/issues, mutate external services, or submit Graphite PRs unless the user explicitly requests that action after a preview.
- Work may create, edit, or delete files under `ts/packages/aretro`, `packages/aretro`, `skills/branch-retro`, docs/docs-site pages, root workspace/build/test config, `justfile`, `uv.lock`, and Objective records when those changes are part of the previewed slice.
- Work may leave a temporary dual-implementation state before the retirement slice. After retirement, active docs and skill runner behavior should point at the TypeScript default, and any Python references should be historical/rollback-only.
- Validation before keeping work should include targeted package checks/tests for the slice. TypeScript implementation slices should normally run package-focused checks plus `pnpm --dir ts run check` and `pnpm --dir ts run test`; deletion/root-config slices should run affected Python lock/build/test/docs checks and enough repo validation to prove stale Python references are gone.
- After meaningful progress, run `objective-update` for `aretro-typescript-port` before starting a materially new stack or claiming the Objective is ready for closure. When the cutover completes, also update `port-asdl-toolkit-to-typescript` with the outcome and playbook lessons.

## Single Invocation Stack Defaults

The contract-and-shell slice now has landed-state evidence in this Objective. A future `objective-stack-impl` invocation can preview and execute the remaining port as a small Graphite stack without asking further design questions, unless implementation evidence contradicts these defaults.

Completed prerequisites:

- `aretro-ts-contract-and-shell` — created `@asdl/aretro`, codified the locked CLI/JSON/payload contract, and exposed root/hidden-`exec` command shells with scenario tests over fakes.
- `aretro-ts-compact-evidence` — ported repo/branch resolution, TypeScript git and session-source seams, the real Pi JSONL session source, compact DTO conversion, deterministic evidence aggregation, warnings, privacy-preserving compact output, and a sanitized real-adapter smoke.
- `aretro-ts-payload-detail` — ported schema-version-1 sanitized payload artifacts, package-local payload store/lookup helpers, long command-subject bounding, supporting pointers, and `read-evidence-detail` JSON Pointer validation.
- `aretro-ts-skill-distribution-cutover` — made the `branch-retro` runner prefer the TypeScript CLI for repo-local use, added the opt-in `just install-aretro` source shim, audited checkout-free/prod references, and updated active docs away from Python/default `asdl aretro` examples.
- `aretro-ts/stack-feedback-cleanup` — addressed post-parity TypeScript feedback by replacing the package-local git gateway/fake with shared `@asdl/core/git`, moving reusable session limiting into the session-source seam, and normalizing payload detail boolean field names without changing the evidence boundary.

Default remaining stack shape:

1. `aretro-ts-retire-python` — only after prior parity and cutover gates pass, remove Python package/workspace/build/test/publish wiring, preserve rollback/reference evidence, grep for stale active references, and update the umbrella TypeScript migration Objective/playbook.

Default decisions for the implementation runner:

- Treat `asdl aretro` as stale unless caller evidence proves a live plugin requirement. The current skill and plugin smoke test evidence point to standalone `aretro`, not a parent `asdl aretro` plugin.
- Keep TypeScript session-source, evidence-aggregation, and payload-store seams package-local in `ts/packages/aretro` for this port. Promote them to `@asdl/core` only if a second consumer or already-existing exported TypeScript seam proves reuse during implementation.
- Use `@asdl/clinkr` for command construction and `@asdl/core/cli-entry` for direct invocation detection; do not deep-import another package's `src/` tree.
- Add `just install-aretro` as an opt-in source shim if PATH execution remains useful. Do not add it to `install-tools` unless the cutover audit finds active installed-tool consumers that need the bundled install target.
- Prefer repo-local TypeScript source execution for in-checkout skill use. Retire `ASDL_ARETRO_MODE=prod` / `uvx --from aretro==0.1.0` only after the cutover audit finds no required checkout-free consumer; if a real consumer exists, stop before Python deletion and ask how to preserve or replace that distribution path.
- Preserve the privacy boundary as a hard gate: compact and payload outputs must not expose raw transcript text, prompts, assistant prose, tool output, command output, or raw failed-tool error text.

Stop and ask only when a previewed stack would change the evidence/diagnosis boundary, add evidence kinds, publish or require an external registry package, preserve checkout-free execution through a new package, add `aretro` to `install-tools` without caller evidence, delete Python while active prod/`uvx` consumers remain unresolved, or keep changes after validation/privacy evidence is ambiguous.

## Implementation Notes

### Locked contract inventory

A post-Objective inventory associated with PR #1820 inspected the current Python source/tests, `docs/aretro.md`, docs-site `aretro` and `branch-retro` pages, `skills/branch-retro/SKILL.md`, `skills/branch-retro/scripts/aretro-run`, root workspace/build config, plugin smoke tests, `asdl-core.sessions`, `asdl-core.payloads`, and current TypeScript CLI conventions.

Treat these findings as the locked compatibility baseline for the TypeScript port unless implementation-time tests prove a correction is needed:

- The durable public boundary is standalone `aretro`, especially `aretro exec collect-evidence --format json` and `aretro exec read-evidence-detail --format json`; `exec` is hidden from root help but invocable.
- `--runtime` should deliberately change from Python diagnostics to TypeScript diagnostics after cutover; incidental Click help wrapping does not need byte-for-byte parity.
- `collect-evidence` must preserve request options, default values, branch-source values, success/error data shape, compact DTO field names, and negative-result data for non-git, git-root, current-branch, and detached-HEAD failures.
- Missing session roots and missing repo session dirs are successful results with warnings, not command failures.
- Deterministic evidence kinds and thresholds come from the current session aggregation layer: tool usage, failed tool results, repeated file reads, repeated shell commands, token usage observed, and large output observed.
- Payload mode must preserve descriptor `aretro-collect-evidence`, raw Clinkr payload artifacts, schema version 1 detail data, `/data`-scoped locator hints, sanitized detail records, and `read-evidence-detail` validation of raw successful envelopes before pointer reads.
- The current docs-site `asdl aretro --help` example is stale by default: the branch-retro skill says not to use `asdl aretro`, and the plugin smoke test asserts stale `aretro.plugin:build_aretro_plugin` is not mounted.
- Current active Python references to remove during retirement include root `pyproject.toml` workspace/source/dev/Ruff/ty/pytest entries, `just publish --package aretro`, `uv.lock`, `packages/aretro/**`, Python install docs, and `uv run`/`uvx` runner paths. `packages/packagechk` fixture references to `@asdl-io/aretro` are unrelated package-name examples and are not an `aretro` CLI runtime dependency.

### Current Python contract seed

These observed facts seeded the locked inventory and remain useful source pointers for implementation:

- Python package: `packages/aretro`, console script `aretro = "aretro.main:main"`, depends on `asdl-core` and Click.
- CLI root: `build_aretro_group()` creates `ClinkrGroup(name="aretro", help="Branch session retrospective evidence operations.")` and mounts hidden `exec`.
- Hidden exec group: `ClinkrGroup(name="exec", help="Commands for use by branch retrospective skills.", hidden=True)` with operations `collect-evidence` and `read-evidence-detail`.
- `branch-retro` skill treats standalone `aretro exec collect-evidence` as the command boundary and explicitly says not to use `asdl aretro`.
- `skills/branch-retro/scripts/aretro-run` currently dispatches to `uv run aretro` inside an asdl checkout with `packages/aretro/pyproject.toml`, or `uvx --from aretro==0.1.0 aretro` for `ASDL_ARETRO_MODE=prod` / outside checkout.
- `collect-evidence` human output says how many sessions were collected, source harness/adapter, branch, warning count, and to use `--format json` for the skill-facing envelope.
- `collect-evidence` error paths return negative Clinkr exits with `success: false` data for non-git repo, git root failures, current branch failures, and detached HEAD without explicit branch.
- Compact session summaries include session id, timestamps, source refs, association, message counts, model/tool/result/command/usage/warning counts, aggregate metrics, warnings, and evidence items.
- Payload detail artifacts intentionally sanitize detail records: tool results record lengths/truncation/error presence but not raw error text; command executions record bounded command subject and output metadata but not command output.
- `read-evidence-detail` only accepts JSON Pointers under `/data`, validates the raw payload is a successful Clinkr envelope with schema version 1, and returns the selected value.

### Suggested TypeScript package layout

Use repo-local TypeScript conventions and keep product seams package-local unless another consumer proves reuse:

```text
ts/packages/aretro/
  package.json
  src/
    cli.ts
    context.ts
    contracts.ts
    collect-evidence.ts
    read-evidence-detail.ts
    evidence-payload.ts
    session-source.ts
    pi-jsonl-session-source.ts      # only if not already reusable from @asdl/core
    session-evidence.ts             # only if not already reusable from @asdl/core
    git-gateway.ts
    real-git-gateway.ts
    payload-store.ts                # or consume a shared @asdl/core payload seam if it exists
    index.ts
  test/
    unit/
    scenario/
    gateways/
    support/
```

Prefer `@asdl/clinkr` for command construction and `@asdl/core/cli-entry` for direct invocation detection. Use Zod for external JSON boundaries such as payload artifact parsing and session-log parsing. Keep source imports relative with `.ts` suffixes inside the package and use curated workspace exports for cross-package dependencies.

### Gateway and fake guidance

- Define domain-shaped gateways rather than raw subprocess-shaped interfaces:
  - `GitGateway` for repo root/common dir/current branch facts;
  - `SessionSource` for querying parsed sessions by repo/session root/max count;
  - `PayloadStore` for writing and reading local payload artifacts;
  - clock/id/path helpers only where deterministic tests need them.
- Fakes should be constructor-state fakes that model sessions, git state, payload writes, and non-ideal outcomes without I/O.
- Scenario tests should act through the public CLI and inspect stdout/stderr/JSON payloads plus fake-visible durable state.
- Real adapters own filesystem, git subprocess, environment, and JSONL parsing details. Application logic should not parse raw command stdout except inside adapters.
- Do not use module mocks for session sources or payload stores when explicit context injection can cover the behavior.

### Suggested stack shape

A future autonomous stack implementation can continue with this remaining shape and split by thesis if evidence shows a branch is too broad:

1. `aretro-ts-retire-python`
   - Thesis: after parity and distribution evidence are complete, remove `packages/aretro` and active Python workspace/build/test/publish wiring, record rollback/reference evidence, and update the umbrella Objective/playbook.
   - Expected files: deletion of `packages/aretro`, root `pyproject.toml`, `uv.lock`, `justfile`, plugin smoke tests/docs cleanup if applicable, Objective Semantic Updates.

Stop before the retirement slice if TypeScript parity is incomplete, privacy boundaries are uncertain, or checkout-free/prod skill runner use is still a real requirement without a TypeScript replacement.

## Assumptions and Risks

Assumptions:

- The active user-facing value is the `branch-retro` skill plus standalone `aretro exec` evidence commands, not a parent `asdl aretro` plugin. The completed inventory found the docs-site `asdl aretro --help` example stale by default.
- The deterministic evidence/semantic-interpretation split remains correct: `aretro` emits observations; the model-backed skill writes recommendations.
- Repo-local TypeScript source execution plus an opt-in source shim is the default for current in-checkout consumers, matching recent toolkit cutovers. The current `uvx` prod runner must be audited before Python deletion, but it does not block TypeScript parity work.
- Existing Python scenario/unit tests, `docs/aretro.md`, docs-site pages, and `branch-retro` skill instructions are sufficient to seed and test the compatibility contract.
- Shared TypeScript foundations cover command runtime behavior via `@asdl/clinkr` and ordinary repo/branch facts via `@asdl/core/git`; session, evidence, and payload seams should remain package-local until repeated consumers prove shared extraction.

Risks:

- The current `uvx`/PyPI runner may support installed skill use outside this checkout. If real consumers depend on that behavior, deleting Python without an equivalent would break the public skill.
- Session-log formats and adapter behavior may be more coupled to Python `asdl-core` than expected. Port only the needed seam first and avoid a broad `asdl-core` module-map rewrite.
- Privacy regressions would be severe: compact and payload outputs must not leak raw transcript text, prompts, assistant prose, tool output, or command output.
- Evidence item exact wording may be consumed by downstream prompts or tests. Treat field names/kinds and privacy guarantees as more durable than incidental summary prose, but record any wording divergence.
- Payload artifact interoperability may matter for detail reads produced during transition; preserve schema version 1 or record why old artifacts are intentionally not readable.
- Small CLI/help/docs UX improvements are allowed, but they could mask contract drift if not tied to tests and Semantic Updates.
- Deleting Python affects root workspace config, lockfile, build recipes, package publication references, and docs-site install text; retirement needs broader validation than a package-only TS change.

## Open Questions

- Does implementation-time caller inventory find any real required `ASDL_ARETRO_MODE=prod` or checkout-free `uvx --from aretro==0.1.0` consumer? If yes, preserve or replace that path before Python deletion; if no, retire or narrow it explicitly.
- Does the distribution cutover audit find active installed-tool consumers that need `just install-aretro` included in `install-tools`? Default is opt-in only.
