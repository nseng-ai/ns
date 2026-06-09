# Roadmap

## Work

- [ ] Inventory the current public `pr-address` contract.
  - Evidence should include the public skill, README and development docs, `pyproject.toml` console script and plugin entry point, scenario/golden tests, and observed `exec` operation families.
  - Distinguish durable public contract from incidental Python behavior before designing the TypeScript implementation.
- [ ] Define the TypeScript migration boundary and package shape for `pr-address`.
  - Decide package name, CLI entry path, ASDL plugin compatibility approach, wrapper dispatch strategy, and what remains private/internal.
- [ ] Identify the minimal command-runtime and schema seams needed by this slice.
  - Keep the design incremental; do not design a broad clinkr replacement before the slice proves repeated needs.
- [ ] Port contract-critical core behavior behind adapter-neutral gateways.
  - Use capability-shaped gateways and in-memory fakes for git, GitHub, filesystem, process, and package/distribution behavior.
- [ ] Recreate the public CLI and JSON operation surface in TypeScript.
  - Preserve `--format json` envelope semantics, validation-first behavior, payload artifact defaults, and helper-owned GitHub mutation payload formatting.
- [ ] Prove parity and safety with tests and limited smoke evidence.
  - Evidence should include fake-driven unit/scenario coverage, golden/contract parity, wrapper local/prod checks where practical, and safe real-adapter smoke tests for read-only or non-mutating paths.
- [ ] Cut over public skill and distribution paths to TypeScript default.
  - Update wrappers and docs to TypeScript/npm paths while preserving installed-skill and local-checkout behavior.
- [ ] Retire active Python fallback paths after the explicit compatibility window.
  - Delete, archive, or remove Python from active invocation paths once callers, docs, and tests no longer depend on it.
- [ ] Feed lessons into the umbrella porting playbook.
  - Record reusable migration guidance for later `brmem`, `handoff`, `objective`, and other capability ports.

## Parked

- Full public API shape for a shared JS/TS clinkr-style framework until repeated seams prove it.
- Direct browser execution for workflows that depend on local git, shell, filesystem, or authenticated GitHub state.
- Broad TypeScript rewrites of Python `asdl-core` concepts not needed by this vertical slice.
- User-facing workflow redesigns beyond explicit compatibility decisions.
