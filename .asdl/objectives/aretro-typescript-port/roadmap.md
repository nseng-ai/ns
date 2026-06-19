# Roadmap

## Work

- [ ] Inventory and lock the current `aretro` contract.
  - Policy: direct execution after preview; this is the first slice and should record contract decisions before broad TypeScript implementation.
  - Read Python source/tests under `packages/aretro`, `docs/aretro.md`, docs-site pages for `aretro` and `branch-retro`, `skills/branch-retro/SKILL.md`, `skills/branch-retro/scripts/aretro-run`, root workspace/build config, and plugin smoke tests.
  - Classify durable contracts versus incidental Python/Click details: standalone CLI, hidden `exec`, options, JSON envelope fields, error codes, payload artifact schema, pointer validation, privacy boundaries, evidence kinds, human output, skill runner behavior, and distribution assumptions.
  - Resolve whether docs-site's `asdl aretro --help` example is stale or a live requirement; current skill guidance says standalone `aretro`, not `asdl aretro`.
  - Evidence: contract inventory or first implementation branch records the durable/incidental split and identifies any distribution or plugin blockers before deletion work begins.

- [ ] Create `@asdl/aretro` with CLI shell and contract tests.
  - Policy: direct execution after preview.
  - Add `ts/packages/aretro` package wiring, `aretro` bin, `src/cli.ts`, context injection, command models/schemas, root help/version/runtime behavior, hidden `exec` group, and operation shells for `collect-evidence` and `read-evidence-detail`.
  - Scenario tests should verify top-level help hides `exec`, `exec` help is invocable, command help lists expected options, `--runtime` reports TypeScript, and JSON envelopes have the intended Clinkr shape.
  - Evidence: targeted `@asdl/aretro` tests/checks pass; package is wired into the TS workspace without using `as unknown as`, non-erasable TypeScript, or deep imports into another package's `src/` tree.

- [ ] Port compact evidence collection over fake-driven git and session-source seams.
  - Policy: direct execution after preview; stop before changing evidence kinds or exposing raw session contents.
  - Implement repo/common-dir/root resolution, explicit/current/detached/unresolved branch handling, session query flow, compact DTO conversion, aggregate metrics, warnings, and factual evidence item output.
  - Use constructor-state fakes for git and session source; cover success, non-git repo, git command failure, detached HEAD without explicit branch, explicit branch, session warnings, empty sessions, and current evidence item kinds.
  - Evidence: compact JSON output remains privacy-preserving and skill-compatible; targeted unit/scenario tests pass.

- [ ] Port sanitized payload detail mode and targeted detail reads.
  - Policy: direct execution after preview; preserve schema-version-1 compatibility unless a recorded compatibility decision changes it.
  - Implement `--payload-mode payload`, `--payload-session-id`, payload artifact writing, `payload_reference`, `detail_locator_hints`, schema-version-1 detail data, source-ref pointer indexing, long command-subject bounding, and `read-evidence-detail` pointer validation.
  - Tests should cover payload artifact creation, no raw tool/command output leakage, invalid non-`/data` pointers, malformed/missing payload files, non-success raw envelopes, unsupported schema versions, and valid targeted reads.
  - Evidence: payload-mode scenario tests and pointer/unit tests pass; detail artifacts remain sanitized.

- [ ] Prove real-adapter smoke behavior without leaking raw transcript contents.
  - Policy: steer first if this requires reading unusual session roots or persisting sensitive output; otherwise direct execution after preview with sanitized reporting only.
  - Run a focused real-adapter smoke against this checkout or a fixture session root to prove the TypeScript CLI can resolve repo/branch/session source and produce compact evidence.
  - Do not paste raw payload artifacts or transcript-derived contents into Objective files; record command names and pass/fail evidence only.
  - Evidence: smoke command and high-level result recorded in a Semantic Update or closure context.

- [ ] Cut over `branch-retro` skill runner and active docs to the TypeScript default.
  - Policy: direct execution after preview; ask before preserving checkout-free execution through a new external package or adding `aretro` to `install-tools` without caller evidence.
  - Update `skills/branch-retro/scripts/aretro-run` to prefer the repo-local TypeScript CLI once `ts/packages/aretro` exists.
  - Update `skills/branch-retro/SKILL.md` only as needed to keep public skill instructions accurate and implementation-path-agnostic.
  - Add `just install-aretro` if a PATH shim is the accepted repo-local model; decide whether `install-tools` includes it from active caller evidence.
  - Audit `ASDL_ARETRO_MODE=prod`, `uvx --from aretro==0.1.0`, active install docs, and checkout-free skill use before Python deletion. Preserve, replace, or explicitly retire that behavior based on evidence.
  - Update docs/docs-site examples away from Python `uv tool install aretro`, `uv run aretro`, and stale `asdl aretro` claims when TypeScript becomes default.
  - Evidence: skill runner invokes TypeScript for repo-local use; distribution decision is recorded; docs/skill references align with the selected model.

- [ ] Retire the Python `packages/aretro` fallback and active workspace wiring.
  - Policy: direct execution only after TypeScript parity, skill/docs cutover, distribution decision, and rollback/reference evidence are complete; stop if active callers still require Python or PyPI `uvx` behavior.
  - Remove `packages/aretro`, root `pyproject.toml` workspace/source/test/build/publish references, `uv.lock` entries, plugin smoke-test references if applicable, and stale Python package docs.
  - Record an in-repo pre-deletion commit as rollback/reference evidence or document another deliberate rollback route before deletion.
  - Run broader validation appropriate to deleting a Python workspace package and editing root config.
  - Evidence: active-reference grep shows no live `packages/aretro`, `aretro.main`, `uv run aretro`, `uvx --from aretro`, or `asdl aretro` dependency outside historical/rollback Objective records; validation passes.

- [ ] Record the cutover outcome in the umbrella TypeScript migration Objective and playbook.
  - Policy: direct execution after the TypeScript default and Python retirement evidence are complete.
  - Update `.asdl/objectives/port-asdl-toolkit-to-typescript/` migration ledger, roadmap, and `porting-playbook.md` with `aretro` status, distribution decision, rollback/reference evidence, session/payload/privacy lessons, and any shared-foundation recommendations.
  - Create a Semantic Update in this Objective and the umbrella Objective for the meaningful cutover decision/evidence.
  - Evidence: umbrella Objective no longer treats `aretro` as unstarted; playbook captures reusable `aretro` lessons.

## Suggested Stack Boundaries

A future autonomous implementation can preview this as a small Graphite stack. Default branch theses:

1. `aretro-ts-contract-and-shell` — contract inventory plus `@asdl/aretro` package shell, root/hidden-exec command shape, runtime/help/version, and initial scenario tests.
2. `aretro-ts-compact-evidence` — git/session-source fakes, compact evidence DTOs, aggregate metrics, warnings, factual evidence items, and privacy-preserving JSON output.
3. `aretro-ts-payload-detail` — payload-mode artifacts, schema-version-1 detail data, command subject bounding, and `read-evidence-detail`.
4. `aretro-ts-skill-distribution-cutover` — `branch-retro` runner, source shim/install decision, docs cleanup, and external/prod runner audit.
5. `aretro-ts-retire-python` — Python package deletion, root config/lock cleanup, stale-reference sweep, rollback evidence, and umbrella Objective update.

Split further by thesis if a branch becomes too broad. Stop before branch 5 if parity, privacy, or distribution evidence is unresolved.

## Parked

- [ ] New evidence kinds beyond the current factual observation set.
- [ ] Moving semantic diagnoses, findings, recommendations, or retrospective prose generation into the CLI.
- [ ] Browser-compatible session evidence collection.
- [ ] Publishing `@asdl/aretro` to npm or preserving checkout-free execution through a registry package without explicit consumer evidence and human confirmation.
- [ ] Shared TypeScript session-source, payload-store, or evidence-aggregation foundations before a second consumer proves reuse.
- [ ] A TypeScript `asdl aretro` plugin mount unless a separate product decision revives plugin mounting as an active requirement.
