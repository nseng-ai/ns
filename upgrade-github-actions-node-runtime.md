# Plan: Upgrade GitHub Actions off the deprecated Node 20 runtime

## Goal and user-visible outcome

Remove GitHub Actions annotations stating that Node.js 20 is deprecated and that `actions/checkout@v4` or `actions/setup-node@v4` is being forced onto Node.js 24. Upgrade every affected first-party workflow reference consistently, while preserving the repository’s application/toolchain Node version (`26.3.0`) and existing workflow behavior.

Done means:

- `.github` contains no references to `actions/checkout@v4` or `actions/setup-node@v4`.
- Checkout steps use `actions/checkout@v5`; direct setup steps use `actions/setup-node@v6`.
- Workflow inputs, permissions, triggers, concurrency, job structure, and application Node versions are unchanged.
- Local formatting/structural checks pass.
- After publication, the affected GitHub Actions workflows pass and their annotations no longer report these actions as targeting Node 20.

## Provenance and drift anchor

Plan prepared on 2026-08-04 UTC from branch `master` at commit `50831c025706e5d60054a4a4dc83335f656e3555`. This SHA is forensic context, not an implementation precondition; branch-context attachment determines the implementation branch. Repository policy forbids committing on `master`, so implementation must occur on an attached feature branch rather than committing directly on trunk.

Before editing, compare live files with these short current-state excerpts/counts:

```yaml
# .github/workflows/ci.yml (seven occurrences)
- uses: actions/checkout@v4

# .github/workflows/dprint-ci.yml (one occurrence)
- uses: actions/checkout@v4

# .github/workflows/reviews.yml (two occurrences of each)
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: "26.3.0"
```

The composite action `.github/actions/setup-typescript/action.yml` already contains:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: 26.3.0
```

Expected pre-edit inventory: 10 `checkout@v4` references and two `setup-node@v4` references. The existing `setup-node@v6` in the composite action is intentional and does not constitute a mixed migration.

## Non-negotiable decisions and constraints

1. **Upgrade action runtimes, not the configured project runtime.** `node-version: "26.3.0"` controls the Node installation used by repository commands; it is independent of the JavaScript runtime bundled into a GitHub Action. Do not change it to address this warning.
2. **Use `actions/checkout@v5` and `actions/setup-node@v6`.** These are conservative runtime-only major upgrades whose action manifests declare Node 24. Do not opportunistically jump to newer majors without identifying a concrete need and reviewing their migration notes.
3. **Keep the patch mechanical.** Do not alter action inputs, add permissions, change event triggers, update pnpm/dprint actions, or refactor workflow duplication.
4. **Do not modify generated artifacts or dependency lockfiles.** This change only edits workflow YAML.
5. **Do not pin action SHAs in this patch.** SHA pinning is a separate supply-chain policy decision and would broaden the work beyond eliminating the runtime warning.

## External findings and rationale

GitHub API queries against the upstream action repositories on 2026-08-04 established:

- `actions/checkout` tag `v5`, `action.yml` lines 116–117: `using: node24`, `main: dist/index.js`.
- `actions/setup-node` tag `v6`, `action.yml` lines 40–41: `using: 'node24'`, `main: 'dist/setup/index.js'`.

The commands used were equivalent to:

```bash
gh api 'repos/actions/checkout/contents/action.yml?ref=v5' \
  -H 'Accept: application/vnd.github.raw+json'
gh api 'repos/actions/setup-node/contents/action.yml?ref=v6' \
  -H 'Accept: application/vnd.github.raw+json'
```

This matters because the warning is emitted from each action’s own `runs.using` runtime, not from workflow `node-version`. These remote tags are volatile external facts; revalidate their manifests if implementation is substantially delayed or if Dependabot/current repository state has already selected different majors.

Rejected alternatives:

- Changing the workflow’s configured Node version would not fix an action’s internal Node 20 runtime.
- Suppressing or ignoring the annotation leaves the deprecated dependency in place.
- Updating only the `reviews` workflow would fix the observed `discover` annotation but leave the same warning latent in CI and dprint workflows.
- Adopting the remotely latest major solely because it is latest creates unnecessary migration scope; the selected versions already use Node 24 and align `setup-node` with the repository’s existing composite action.

## Scope boundary

### In scope

- `.github/workflows/ci.yml`: replace seven checkout references.
- `.github/workflows/dprint-ci.yml`: replace one checkout reference.
- `.github/workflows/reviews.yml`: replace two checkout and two setup-node references.

### Explicitly out of scope

- `.github/actions/setup-typescript/action.yml`: inspect as an alignment anchor only; it already uses `setup-node@v6`.
- Application/package source, tests, lockfiles, and Node configuration: no behavioral or dependency change is needed.
- Other third-party actions such as `pnpm/action-setup@v6` and `dprint/check@v2.2`: they were not named by the annotation and require separate compatibility analysis.
- GitHub permissions, runner images, workflow triggers, and CI topology: unrelated to the deprecated action runtime.

## Implementation slice

This is a same-shape edit across three semantic YAML files. Following the repository’s refactor execution guidance, use precise literal replacements after reading the affected sections; a codemod or refactor swarm would be disproportionate for three files. A deterministic editor-wide replacement scoped to these exact action names is acceptable, but inspect the resulting diff rather than trusting replacement counts.

1. Re-run the inventory and confirm the drift anchor:

   ```bash
   rg -n 'actions/(checkout|setup-node)@v4' .github
   ```

   Expected before editing: exactly 12 lines—10 checkout and two setup-node—all in the three in-scope workflow files.

2. In the in-scope files only:
   - Replace every `actions/checkout@v4` with `actions/checkout@v5`.
   - Replace every `actions/setup-node@v4` with `actions/setup-node@v6`.
   - Preserve indentation, `with` blocks, and all configured versions.

3. Run the stale-reference check across all of `.github`, not merely the edited files:

   ```bash
   rg -n 'actions/(checkout|setup-node)@v4' .github
   ```

   Expected: exit status 1 with no output because ripgrep found no stale references. Other actions whose own versions happen to be `@v4` are allowed.

4. Inspect the diff:

   ```bash
   git diff --check
   git diff -- .github/workflows/ci.yml .github/workflows/dprint-ci.yml .github/workflows/reviews.yml
   ```

   Expected: whitespace check succeeds; diff contains only 12 version substitutions with no input or structural changes.

There is no intermediate checkpoint: this is one tiny, coherent patch, so one final commit is preferable to `ns flow cp` checkpointing.

## Validation gates

Run:

```bash
just dprint-check
git diff --check
rg -n 'actions/(checkout|setup-node)@v4' .github
```

Expected results:

- `just dprint-check` succeeds without rewriting files. If it reports formatting drift caused by this patch, use the repository-prescribed `just dprint-fix`, then confirm the formatter did not touch unrelated files.
- `git diff --check` succeeds.
- The final `rg` has no output and returns 1 specifically because there are zero matches. In a shell script, handle that expected no-match status explicitly rather than treating it as a failure.

If `actionlint` is already installed, additionally run `actionlint .github/workflows/*.yml` and require success. Do not add a new repository dependency merely to obtain this optional check. The repository’s credible one-command baseline is `just`; running the full baseline is proportionate if local policy or the final diff indicates broader validation, but this YAML-only version substitution does not require TypeScript-specific suites by design.

After the branch is published through the repository’s normal flow, inspect the resulting `ci`, `dprint`, and `reviews` workflow runs. Acceptance requires applicable jobs to pass and annotations to contain no Node 20 deprecation warning attributed to `actions/checkout` or `actions/setup-node`. If a workflow is legitimately skipped by its existing event/draft conditions, do not alter those conditions merely to force a run; document which run supplied evidence.

## STOP conditions

Stop and reconcile rather than applying blind replacements if:

1. The pre-edit inventory differs materially from 10 checkout and two setup-node v4 references, especially if another change has already upgraded some references or introduced reusable workflows; re-scope against the live state.
2. Upstream `v5` checkout or `v6` setup-node manifests no longer resolve to a Node 24-compatible runtime, or migration notes reveal a repository-relevant breaking input change.
3. Formatting or validation modifies lockfiles, generated files, source code, or workflow structure beyond the 12 expected substitutions; revert incidental output and diagnose before proceeding.
4. Post-publication annotations persist and identify a different action as the Node 20 source; do not upgrade unrelated actions without separately inventorying and assessing them.

## Inherited evidence and revalidation

### Stable inherited evidence

- The warning names `actions/checkout@v4` and `actions/setup-node@v4` as Node 20 actions.
- Action runtime and configured `node-version` are separate concerns.
- The repository already successfully expresses its intended alignment as `setup-node@v6` plus Node `26.3.0` in the TypeScript composite action.

### Revalidate during implementation

- Exact action-reference inventory and affected files via the pre-edit `rg` command.
- Upstream action manifests if time has elapsed or action tags have moved.
- Post-publication annotations and workflow conclusions through current GitHub Actions runs.

### Explicitly unresolved

- Which specific future PR/run IDs will provide remote validation; those do not exist until implementation is published.
- Whether `actionlint` is available in the executor’s environment; it is optional because no repository-owned actionlint baseline was found.

## Subagent orchestration opportunities

Subagent orchestration opportunities: none. The implementation is a bounded 12-line mechanical edit in three files; delegation would cost more context and integration work than direct execution.

## Closeout review

No TypeScript-family files change, so no `typescript-style` review subagent applies. After focused validation passes, perform one trust-nothing closeout: confirm changed files are exactly the three in-scope workflows, read all 12 substitutions in the diff, rerun the stale-reference grep and formatting gate, and record any skipped remote workflow evidence or deviation. Do not infer success solely from green jobs—also inspect annotations for disappearance of the original Node 20 warning.