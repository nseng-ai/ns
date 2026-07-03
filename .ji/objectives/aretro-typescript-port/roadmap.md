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
  - Added TypeScript git and session-source seams, fake gateways, a real Pi JSONL session source, compact DTO conversion, aggregate metrics, warnings, and deterministic factual evidence aggregation for the existing evidence kinds.
  - Post-parity cleanup replaced the package-local git gateway/fake with shared `@asdl/core/git`; session-source, evidence, and payload seams remain package-local.
  - Scenario/unit tests cover explicit/current/detached/unresolved branch behavior, non-git and git-failure results, session-source warnings, empty sessions, privacy-preserving summaries, and current evidence item kinds.
  - Evidence: compact JSON output remains privacy-preserving and skill-compatible; targeted `@asdl/aretro` check/tests and full TypeScript check/tests passed.

- [x] Port sanitized payload detail mode and targeted detail reads.
  - Policy: completed by the `aretro-ts/payload-detail` branch against Graphite parent `aretro-ts/compact-evidence`.
  - Added package-local payload store/lookup helpers, `--payload-mode payload`, explicit/environment session-id handling, raw Clinkr payload artifact writing, `payload_reference`, `/data` detail locator hints, schema-version-1 detail data, source-ref pointer indexing, long command-subject bounding, and `read-evidence-detail` pointer validation.
  - Tests cover payload artifact creation, no raw tool/command output leakage, invalid non-`/data` pointers, missing/non-success/unsupported-schema payloads, JSON Pointer resolution, and valid targeted reads.
  - Evidence: targeted `@asdl/aretro` formatting/check/tests and full TypeScript check/tests passed.

- [x] Prove real-adapter smoke behavior without leaking raw transcript contents.
  - Policy: completed by the `aretro-ts/compact-evidence` branch using sanitized human output only.
  - The TypeScript CLI resolved this checkout's real git branch and Pi session source with `pnpm --dir ts exec node packages/aretro/src/cli.ts exec collect-evidence --max-sessions 1 --format human`.
  - Durable evidence intentionally records only the command and high-level pass result, not raw payload artifacts or transcript-derived compact JSON.

- [x] Cut over `branch-retro` skill runner and active docs to the TypeScript default.
  - Policy: completed by the `aretro-ts/skill-distribution-cutover` branch against Graphite parent `aretro-ts/payload-detail`.
  - Updated `skills/branch-retro/scripts/aretro-run` to prefer the repo-local TypeScript CLI when `ts/packages/aretro/src/cli.ts` is present, while preserving `ASDL_ARETRO_MODE=local` and `ASDL_ARETRO_MODE=prod` fallbacks.
  - Added opt-in `just install-aretro` source shim without adding it to the broad `install-tools` target because the audit found no active installed-tool consumer requiring that broader install.
  - Updated active docs-site install/tool pages away from Python `uv tool install aretro` and stale `asdl aretro` defaults; the skill's negative `do not use asdl aretro` guidance remains intentional.
  - Evidence: runner `--runtime` reports TypeScript in repo-local mode, Python local override still works, docs formatting passed, and active-reference grep found no required checkout-free/prod consumer outside the preserved runner fallback.

- [x] Retire the Python `packages/aretro` fallback and active workspace wiring.
  - Policy: completed after TypeScript parity, skill/docs cutover, distribution decision, and rollback/reference evidence were in place.
  - Removed `packages/aretro`, root `pyproject.toml` workspace/source/test/build/publish references, `uv.lock` entries, and the stale Python plugin smoke-test reference.
  - Rewrote `skills/branch-retro/scripts/aretro-run` to use the repo-local TypeScript source CLI or a PATH `aretro` command only; Python `uv run` / `uvx` fallbacks and `ASDL_ARETRO_*` knobs are retired.
  - Rollback/reference evidence: in-repo commit `dd1c69ac85f9f836a9c12cd1da219099a2683273`, captured before deleting `packages/aretro` on the retirement branch.
  - Evidence: runner contract checks passed for repo-local TypeScript, PATH fallback, and no-source/no-PATH failure; stale-reference grep shows no live Python `aretro` dependency outside Objective history, with remaining `packages/aretro` matches belonging to the TypeScript package path.

- [x] Record the cutover outcome in the umbrella TypeScript migration Objective and playbook.
  - Policy: completed after the TypeScript default and Python retirement evidence were real.
  - Updated `.asdl/objectives/port-asdl-toolkit-to-typescript/` migration ledger, roadmap, and `porting-playbook.md` with `aretro` status, distribution decision, rollback/reference evidence, session/payload/privacy lessons, and local-seam guidance.
  - Created Semantic Updates in this Objective and the umbrella Objective for the meaningful cutover decision/evidence.
  - Evidence: umbrella Objective no longer treats `aretro` as unstarted; playbook captures reusable `aretro` lessons.

## Suggested Stack Boundaries

A future `objective-stack-impl` invocation can preview and execute the remaining migration as one small Graphite stack using these defaults. It should stop only if the implementation discovers a real unresolved prod/`uvx` consumer, privacy ambiguity, evidence-boundary change, registry publishing requirement, or validation failure that needs product/design input.

Completed branch theses:

- `add-aretro-typescript-port` — Objective creation and contract inventory baseline.
- `aretro-ts/contract-and-shell` — `@asdl/aretro` package shell, root/hidden-exec command shape, runtime/help/version, and initial scenario tests.
- `aretro-ts/compact-evidence` — compact evidence collection, repo/branch resolution, session-source parsing, fake-driven coverage, and real-adapter smoke evidence.
- `aretro-ts/payload-detail` — payload artifact writing, schema-version-1 sanitized detail data, and targeted `/data` detail reads.
- `aretro-ts/skill-distribution-cutover` — TypeScript repo-local runner default, `just install-aretro`, active docs cutover, and prod/`uvx` caller audit.
- `aretro-evidence-parity-payload-cleanup` — evidence/payload implementation cleanup without changing the durable evidence boundary.
- `aretro-typescript-cleanup-source-ref-sha256` — shared SHA-256 digest adoption and payload-store naming cleanup.
- `aretro-ts/stack-feedback-cleanup` — shared `@asdl/core/git` adoption, reusable session limiting, and payload boolean DTO naming cleanup.

Completed final branch thesis:

1. `retire-python-aretro-record-typescript-cutover` — Python package deletion, root config/lock cleanup, stale-reference sweep, rollback evidence, and umbrella Objective update.

No active implementation branch thesis remains. Future work in this area should start from the parked ideas below or a new Objective if product evidence changes the scope.

## Parked

- [ ] New evidence kinds beyond the current factual observation set.
- [ ] Moving semantic diagnoses, findings, recommendations, or retrospective prose generation into the CLI.
- [ ] Browser-compatible session evidence collection.
- [ ] Publishing `@asdl/aretro` to npm or preserving checkout-free execution through a registry package without explicit consumer evidence and human confirmation.
- [ ] Shared TypeScript session-source, payload-store, or evidence-aggregation foundations before a second consumer proves reuse.
- [ ] A TypeScript `asdl aretro` plugin mount unless a separate product decision revives plugin mounting as an active requirement.
