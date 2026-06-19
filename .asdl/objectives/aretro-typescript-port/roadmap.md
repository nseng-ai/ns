# Roadmap

## Work

- [x] Inventory and lock the current `aretro` contract.
  - Policy: completed by read-only inventory after PR #1820 was submitted; future implementation should use the locked compatibility baseline in `objective.md` unless tests prove a correction is needed.
  - Evidence: inspected Python source/tests under `packages/aretro`, `docs/aretro.md`, docs-site pages for `aretro` and `branch-retro`, `skills/branch-retro/SKILL.md`, `skills/branch-retro/scripts/aretro-run`, root workspace/build config, plugin smoke tests, `asdl-core.sessions`, `asdl-core.payloads`, and current TypeScript CLI conventions.
  - Durable decisions: standalone `aretro exec` is the command boundary; docs-site `asdl aretro --help` is stale by default; TypeScript session/evidence/payload seams should start package-local; `just install-aretro` is opt-in by default; checkout-free `uvx`/prod use is an audit gate before Python deletion, not a blocker for TypeScript parity.
  - Evidence to preserve: Semantic Update `20260619-0247-contract-inventory-locked.md` records the durable/incidental split, stop conditions, and single-invocation defaults.

- [x] Create `@asdl/aretro` with CLI shell and contract tests.
  - Policy: completed by the `aretro-ts/contract-and-shell` branch against Graphite parent `add-aretro-typescript-port`.
  - Added `ts/packages/aretro` package wiring, `aretro` bin, `src/cli.ts`, context injection, command models/schemas, root help/version/runtime behavior, hidden `exec` group, and operation shells for `collect-evidence` and `read-evidence-detail`.
  - Scenario tests verify top-level help hides `exec`, `exec` help is invocable, command help lists expected options, `--runtime` reports TypeScript, and JSON envelopes have the intended Clinkr shape.
  - Evidence: local branch diff against `add-aretro-typescript-port`; targeted `@asdl/aretro` check and test commands passed; PR evidence was not required because local committed branch evidence was sufficient.

- [x] Port compact evidence collection over fake-driven git and session-source seams.
  - Policy: completed by the `aretro-ts/compact-evidence` branch against Graphite parent `aretro-ts/contract-and-shell`.
  - Added package-local TypeScript git and session-source seams, fake gateways, a real Pi JSONL session source, compact DTO conversion, aggregate metrics, warnings, and deterministic factual evidence aggregation for the existing evidence kinds.
  - Scenario/unit tests cover explicit/current/detached/unresolved branch behavior, non-git and git-failure results, session-source warnings, empty sessions, privacy-preserving summaries, and current evidence item kinds.
  - Evidence: compact JSON output remains privacy-preserving and skill-compatible; targeted `@asdl/aretro` check/tests and full TypeScript check/tests passed.

- [ ] Port sanitized payload detail mode and targeted detail reads.
  - Policy: direct execution after preview; preserve schema-version-1 compatibility unless a recorded compatibility decision changes it.
  - Implement `--payload-mode payload`, `--payload-session-id`, payload artifact writing, `payload_reference`, `detail_locator_hints`, schema-version-1 detail data, source-ref pointer indexing, long command-subject bounding, and `read-evidence-detail` pointer validation.
  - Tests should cover payload artifact creation, no raw tool/command output leakage, invalid non-`/data` pointers, malformed/missing payload files, non-success raw envelopes, unsupported schema versions, and valid targeted reads.
  - Evidence: payload-mode scenario tests and pointer/unit tests pass; detail artifacts remain sanitized.

- [x] Prove real-adapter smoke behavior without leaking raw transcript contents.
  - Policy: completed by the `aretro-ts/compact-evidence` branch using sanitized human output only.
  - The TypeScript CLI resolved this checkout's real git branch and Pi session source with `pnpm --dir ts exec node packages/aretro/src/cli.ts exec collect-evidence --max-sessions 1 --format human`.
  - Durable evidence intentionally records only the command and high-level pass result, not raw payload artifacts or transcript-derived compact JSON.

- [ ] Cut over `branch-retro` skill runner and active docs to the TypeScript default.
  - Policy: direct execution after preview; ask before preserving checkout-free execution through a new external package or adding `aretro` to `install-tools` without caller evidence.
  - Update `skills/branch-retro/scripts/aretro-run` to prefer the repo-local TypeScript CLI once `ts/packages/aretro` exists.
  - Update `skills/branch-retro/SKILL.md` only as needed to keep public skill instructions accurate and implementation-path-agnostic.
  - Add `just install-aretro` as the default opt-in PATH shim if source-shim execution is useful; include it in `install-tools` only if active installed-tool consumer evidence justifies that broader target.
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

A future `objective-stack-impl` invocation can preview and execute the remaining migration as one small Graphite stack using these defaults. It should stop only if the implementation discovers a real unresolved prod/`uvx` consumer, privacy ambiguity, evidence-boundary change, registry publishing requirement, or validation failure that needs product/design input.

Completed branch thesis:

- `aretro-ts-contract-and-shell` — contract inventory plus `@asdl/aretro` package shell, root/hidden-exec command shape, runtime/help/version, and initial scenario tests.

Remaining default branch theses:

1. `aretro-ts-payload-detail` — payload-mode artifacts, schema-version-1 detail data, command subject bounding, and `read-evidence-detail`.
2. `aretro-ts-skill-distribution-cutover` — `branch-retro` runner, source shim/install decision, docs cleanup, and external/prod runner audit.
3. `aretro-ts-retire-python` — Python package deletion, root config/lock cleanup, stale-reference sweep, rollback evidence, and umbrella Objective update.

Split further by thesis if a branch becomes too broad. Stop before branch 5 if parity, privacy, or distribution evidence is unresolved.

## Parked

- [ ] New evidence kinds beyond the current factual observation set.
- [ ] Moving semantic diagnoses, findings, recommendations, or retrospective prose generation into the CLI.
- [ ] Browser-compatible session evidence collection.
- [ ] Publishing `@asdl/aretro` to npm or preserving checkout-free execution through a registry package without explicit consumer evidence and human confirmation.
- [ ] Shared TypeScript session-source, payload-store, or evidence-aggregation foundations before a second consumer proves reuse.
- [ ] A TypeScript `asdl aretro` plugin mount unless a separate product decision revives plugin mounting as an active requirement.
