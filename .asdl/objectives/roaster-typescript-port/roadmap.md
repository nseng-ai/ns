# Roadmap

## Work

- [~] Scaffold `ts/packages/roaster` mirroring `pr-address` (package.json, tsconfig, clinkr CLI entry) and port the pure core: unified-diff parsing + token estimation, review-definition frontmatter parsing/validation, path-applicability globs, and `asdl.toml [roaster.diff]` config parsing with glob → git-pathspec conversion
  - Progress: the TS unified-diff parser now preserves prefixed rename/copy metadata paths, decodes quoted UTF-8 paths, and returns readonly parsed structures; targeted roaster tests and typecheck passed. Remaining pure-core work includes the other listed parser/config/catalog surfaces and any scaffold parity not already landed downstack.
  - Progress: stack feedback hardening reused shared `@asdl/core/primitives` helpers in project-config and review-definition parsing, renamed a boolean option to predicate style, and made unified-diff raw-segment pairing parse each segment independently instead of zipping parser metadata by index. Evidence: local branch diff against `voided-stack-feedback-thread-bucket`; `just ts-check`, `just ts-test`, and `just dprint-check` passed.
- [ ] Define the TS domain + error model: Zod schemas and discriminated-union failure types replacing the Pydantic models and `RoasterFailure` union, with TS-native markers and CLI JSON envelope
- [~] Build the local-diff and review-catalog gateways (real + in-memory fake) on asdl-core's git/exec helpers
  - Progress: current TS roaster sources include `local-diff.ts` and `review-catalog.ts` with gateway tests; stack feedback hardening changed the fake review-catalog setup to copy input maps rather than mutating a caller-owned map parameter. Evidence: local branch diff against `voided-stack-feedback-thread-bucket`; `just ts-check`, `just ts-test`, and `just dprint-check` passed.
- [ ] Port the Claude Code harness with the decided two-layer seam: semantic `HarnessGateway` + fake for the workflow; pure prompt-assembly, diff-cap/coverage, and `structured_output`/JSONL parsing functions with direct tests; real adapter with injected process-runner; stdin pump retained, progress streaming dropped
- [~] Build the roaster-local GitHub PR gateway (changed-files+patch, review comments, create review, discussion summary comment) with real + fake, surfaced against the operations roaster actually uses
  - Progress: current TS roaster sources include the GitHub gateway and gateway tests; stack feedback hardening made batched review creation clean up its temporary JSON input with `try/finally` and added test coverage for the cleanup behavior. Evidence: local branch diff against `voided-stack-feedback-thread-bucket`; `just ts-check`, `just ts-test`, and `just dprint-check` passed.
- [ ] Port findings publication (aggregate comment rendering, marker generation, activity-log merge) and inline-commentability classification (patch right-side line mapping) as pure modules with tests
- [ ] Wire the clinkr CLI to functional parity with the Python CI slice: `roaster review list`/`run` plus the hidden `exec` subgroup (`post-inline-findings`, `format-findings-comment`, `post-findings-comment`)
- [ ] Flip `.github/workflows/roaster.yml` to the built TS CLI and prove one green end-to-end run on a real PR (discovery → run → inline + summary comments)
  - Evidence: a green CI run exercising discovery, per-review run, and both comment paths.
- [ ] Delete the Python `packages/roaster` and purge references in build config, CI, and docs (gated on the green TS CI run)

## Parked

- [ ] Decide and implement asdl-plugin subgroup mounting for the TS roaster (deferred until standalone-CLI parity and CI cutover land; Python exposed `asdl.plugins`, TS analog TBD)
