# Port roaster to TypeScript

## Thesis

`roaster` is a small, already-narrowed CI-only PR-diff findings runner (~3,500 LOC of Python). It discovers markdown reviewers under `reviews/`, runs each against the pull-request diff through Claude Code, and posts findings back as an aggregate summary comment plus best-effort inline comments. This objective ports it to a TS-native package at `ts/packages/roaster` that **replaces the Python implementation outright** — same CI behavior, rebuilt on the repo's TypeScript conventions (clinkr, Zod, fake-driven gateways), with `ts/packages/pr-address` as the reference port.

This is a **clean break**: we target functional parity, not byte-level continuity with the Python implementation. Markers, the CLI JSON envelope, and error-type names are free to be redesigned idiomatically.

## Scope

- New package `ts/packages/roaster` mirroring the `pr-address` layout (package.json, tsconfig, clinkr CLI entry, fake-driven test structure).
- **Pure core port:** unified-diff parsing + token estimation, review-definition markdown frontmatter parsing/validation, path-applicability globs, and `asdl.toml [roaster.diff]` config parsing including the repo-relative-glob → git-pathspec-exclude conversion.
- **Domain + error model:** Zod schemas and idiomatic discriminated-union failure types replacing the Pydantic models and the `RoasterFailure` union; TS-native inline/summary markers and CLI JSON envelope.
- **Gateways:** local-diff gateway (diff vs. resolved base ref) and review-catalog gateway (`reviews/` discovery), each with a real adapter and an in-memory fake, built on asdl-core's TS git/exec helpers.
- **Harness (decided design):** the workflow depends on a semantic `HarnessGateway` (`runReview(request) → ReviewExecutionResponse | Failure`) with an in-memory fake; prompt assembly, the diff-cap/coverage policy, and `structured_output`/JSONL parsing are extracted as **pure exported functions with direct unit tests**; the real adapter takes an **injected process-runner**; per-line progress streaming is dropped (CI-only, `--output-format json`) while the stdin pump for large diffs is retained.
- **roaster-local GitHub PR gateway** covering changed-files-with-patch, review comments, create-review (inline), and discussion summary-comment create/update — owned by roaster and mirroring `pr-address`, **not** shared via or extended from asdl-core's PR gateway.
- **Findings publication** (aggregate comment rendering, marker generation, activity-log merge) and **inline-commentability classification** (patch right-side line mapping) as pure modules.
- **CLI:** `roaster review list` / `roaster review run` plus the hidden `exec` subgroup (`post-inline-findings`, `format-findings-comment`, `post-findings-comment`) wired through clinkr.
- **CI cutover:** flip `.github/workflows/roaster.yml` from `uv run roaster …` to the built TS CLI.
- **Delete the Python `packages/roaster`** once the TS CLI is green in CI (final gated slice).

## Non-Goals

- Reviving any of roaster's intentionally-unsupported surface: local/manual roast orchestration, prose review mode, non-diff targets, additive local context, changed-path local selection, or public harness commands. "Port roaster" must not silently re-expand beyond the current CI slice.
- Byte-level continuity of PR comment markers or the CLI JSON envelope with the Python implementation; Python-era inline comments on already-open PRs may be orphaned at cutover and that is acceptable.
- Implementing roaster features the Python slice itself defers: automatic generated-file detection and semantic sharding across multiple model calls.
- Sharing or extending asdl-core's PR gateway; roaster owns its own gateway.
- Per-line progress streaming from the Claude Code harness.

## Completion Criteria

- `ts/packages/roaster` builds and its check/test suite passes under the repo's TS tooling (pnpm/Vitest).
- `roaster review list` and `roaster review run` reach functional parity with the Python CI slice: reviewer discovery, model resolution, base-ref resolution, diff capping with coverage facts, and structured findings output.
- The hidden `exec` commands produce the inline-posting and summary-comment behavior the workflow relies on, against the roaster-local GitHub gateway.
- `.github/workflows/roaster.yml` runs the built TS CLI end-to-end on a real PR (discovery → per-review run → inline + summary comments) and is green.
- The Python `packages/roaster` is deleted with no remaining references in build config, CI, or docs.
- Evidence: targeted package tests and relevant repo checks pass; one CI run on a real PR demonstrates the end-to-end flow.

## Assumptions and Risks

**Assumptions**

- The current Python roaster surface is the intended minimal CI slice (the README's narrowing holds) and no hidden consumer depends on Python-specific internals.
- clinkr (TS) supports the hidden `exec` subgroup pattern and the JSON-envelope output the exec helpers need (confirmed: `ts/packages/clinkr/src/group.ts` carries hidden-subcommand support).
- asdl-core's TS git module plus its `exec` helper are sufficient for the local-diff gateway (diff vs. base ref, changed-path enumeration).
- The CI runner can build and run a Node TS CLI; the completed bun→node migration objectives indicate the Node tooling is in place.

**Risks**

- **Harness fidelity (highest):** the Claude Code invocation contract (`--json-schema`, `--bare`, `structured_output` extraction, stdin pump to dodge arg limits, terminal `result` event) is the riskiest surface; wire-format drift could silently break findings. Mitigation: pure parse functions with direct tests, plus one integration test gated on `claude` availability.
- **GitHub gateway surface:** roaster's review-comment + changed-files-with-patch + discussion-comment needs differ in shape from pr-address's review-thread gateway; under-covering an API (e.g. missing patch metadata) would degrade inline commentability. Mitigation: model the gateway off the `asdl_core.gh.types` surface roaster actually consumes. Current evidence partially de-risks the create-review path: batched review creation now cleans up its temporary JSON input and has a targeted fake-backed test for that behavior; broader API coverage remains open until the CI flow exercises all comment paths.
- **Diff-cap/coverage math:** off-by-one or budget-accounting bugs in the per-file/total token caps would change which files reach the model. Mitigation: extract as pure functions with direct unit tests (an improvement over the Python structure, where this logic sits behind the harness fake).
- **CI cutover ordering:** deleting Python before the TS CLI is proven green would break the only PR-review CI. Mitigation: deletion is the final gated slice, after a green TS CI run.
- **Config/format parity:** `asdl.toml [roaster.diff]` exclude globs must convert to git pathspec excludes identically, or excluded paths could leak into model input. Mitigation: port and directly test the pathspec conversion. Current evidence shows the TS config/review-definition parsers have been hardened to reuse shared primitive guards and error formatting; pathspec parity still needs end-to-end cutover evidence.
- **Unified-diff path parity:** prefixed rename/copy metadata and quoted UTF-8 paths are now covered by direct TS parser tests, de-risking that sub-surface; broader pure-core parity remains open until the remaining parser/config/catalog work is ported and tested. Current evidence further de-risks parser raw-text accounting by parsing each raw diff segment independently instead of assuming `@pierre/diffs` metadata and raw segment arrays stay index-aligned.

## Open Questions

Resolved during prework (evidence + detail in `prework/01-architecture-and-module-map.md §Decisions`):

- **YAML parser:** `yaml` (eemeli) v2.x — already transitive in the TS lockfile; `js-yaml` is absent. Parse, then validate the mapping with Zod. **TOML:** `smol-toml` confirmed (direct dep of `areg`, locked 1.6.1). **Token heuristic:** `Math.ceil([...text].length / 4)` — must count Unicode code points (not UTF-16 units) to match Python's `estimate_tokens`.
- **Plugin mounting:** there is no TS analog of `asdl.plugins`; every TS package ships standalone-CLI-only. The TS roaster ships standalone-only (the plugin item stays parked); `cli/plugin.py` has nothing to port.
- **GitHub API mechanism:** `gh` CLI shelled through an injected exec runner, REST endpoints via `gh api --paginate` / `--input -`, mirroring the Python real-gateway helpers. A fresh 5-method roaster-local gateway (see `prework/04`); not shared with asdl-core.

## Prework

`prework/` contains verified, code-referenced specs for downstream execution: an architecture +
Python→TS module map and slice plan (`01`), and per-surface contracts for the pure core (`02`), the
Claude Code harness (`03`), the GitHub gateway + publication + exec commands (`04`), and the TS
scaffold + CI cutover (`05`). Start at `prework/README.md`.
