# Roadmap

## Work

- [ ] Scaffold `ts/packages/roaster` mirroring `pr-address` (package.json, tsconfig, clinkr CLI entry) and port the pure core: unified-diff parsing + token estimation, review-definition frontmatter parsing/validation, path-applicability globs, and `asdl.toml [roaster.diff]` config parsing with glob → git-pathspec conversion
- [ ] Define the TS domain + error model: Zod schemas and discriminated-union failure types replacing the Pydantic models and `RoasterFailure` union, with TS-native markers and CLI JSON envelope
- [ ] Build the local-diff and review-catalog gateways (real + in-memory fake) on asdl-core's git/exec helpers
- [ ] Port the Claude Code harness with the decided two-layer seam: semantic `HarnessGateway` + fake for the workflow; pure prompt-assembly, diff-cap/coverage, and `structured_output`/JSONL parsing functions with direct tests; real adapter with injected process-runner; stdin pump retained, progress streaming dropped
- [ ] Build the roaster-local GitHub PR gateway (changed-files+patch, review comments, create review, discussion summary comment) with real + fake, surfaced against the operations roaster actually uses
- [ ] Port findings publication (aggregate comment rendering, marker generation, activity-log merge) and inline-commentability classification (patch right-side line mapping) as pure modules with tests
- [ ] Wire the clinkr CLI to functional parity with the Python CI slice: `roaster review list`/`run` plus the hidden `exec` subgroup (`post-inline-findings`, `format-findings-comment`, `post-findings-comment`)
- [ ] Flip `.github/workflows/roaster.yml` to the built TS CLI and prove one green end-to-end run on a real PR (discovery → run → inline + summary comments)
  - Evidence: a green CI run exercising discovery, per-review run, and both comment paths.
- [ ] Delete the Python `packages/roaster` and purge references in build config, CI, and docs (gated on the green TS CI run)

## Parked

- [ ] Decide and implement asdl-plugin subgroup mounting for the TS roaster (deferred until standalone-CLI parity and CI cutover land; Python exposed `asdl.plugins`, TS analog TBD)
