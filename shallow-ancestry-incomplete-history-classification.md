# Plan: Make Gitplane ancestry classification safe in shallow repositories

## Goal and outcome

Repair `RealArtifactGateway` so a shallow repository cannot turn an unprovable ancestry relationship into a definitive non-forward result.

The completed behavior should be:

- `isAncestor` still returns `{ type: "found", value: true }` when Git proves ancestry.
- A negative ancestry result in a complete repository still returns `{ type: "found", value: false }`.
- A negative ancestry result in a shallow repository conservatively returns `{ type: "unavailable", reason: "incomplete-history" }`, even when the relationship might genuinely be divergent. This deliberately favors safe rejection over a false non-forward classification.
- `GitUnavailableReason = "missing-object" | "incomplete-history"` remains the first-class gateway contract.
- Shared commit-dependent failure classification carries the actual unavailable reason through all real-adapter callers instead of hard-coding `"missing-object"` after classification.
- An unresolved target commitish passed to `resolveCommit` remains `"missing-object"`; merely running in a shallow repository must not turn an arbitrary unknown revision into incomplete history.
- Genuine operational Git failures remain operational errors, including in shallow repositories.

This is a focused correction within the current Gitplane source-facts slice. It does not implement the separately recorded mode-specific Gather, topology-preservation, or request-keyed-fake completion guards.

## Context and discovered facts

- Current branch: `direct-marker-provenance-cursor-contracts`, one local checkpoint ahead of its remote at planning time (`50f3553a4 [cp] Align reconciliation source facts`). Revalidate branch and worktree status before implementation.
- The active Objective is `.ns/objectives/gitplane-reconciliation-stack-rebuild/` and its source-facts roadmap row owns comparable, unavailable, and non-forward history facts.
- The normative reconciliation contract is `.ns/objectives/gitplane/references/SPEC-draft.md`. Normal reconciliation requires a target to descend from the cursor; full repair is intentionally ancestry-neutral.
- `ts/packages/incubating/infra/gitplane/src/core/gateways.ts` already defines:
  - `GitUnavailableReason = "missing-object" | "incomplete-history"`;
  - `GitObservation<T>` with a reason-bearing unavailable variant.
- Fake-driven Gather tests already preserve `incomplete-history`, but production currently cannot produce it.
- `RealArtifactGateway.isAncestor` in `src/cli/real-artifact-gateway.ts` currently treats Git exit status `1` as definitive `false` before consulting any repository-history-completeness fact.
- The adapter’s `GitFailureClassification` currently has an unavailable variant with no reason. Both `isAncestor` and the shared `gitObservation` helper subsequently hard-code `reason: "missing-object"`.
- `classifyGitFailure` currently probes required commits with `git rev-parse --verify --quiet <commit>^{commit}` after an exit-128 failure. It distinguishes absent commit objects from operational errors without parsing localized diagnostics.
- Git provides a stable plumbing fact for this change: `git rev-parse --is-shallow-repository`, returning `true` or `false`. Use this rather than parsing stderr or directly interpreting `.git/shallow`.
- Existing real-Git integration coverage lives in `test/integration/real-artifact-gateway.test.ts`; its local `git()` helper and temporary repository fixture are suitable starting points. A local shallow clone must use a `file://` source URL because ordinary local-path clones ignore `--depth`.
- Existing command-protocol/sanity coverage lives in `test/sanity/real-artifact-gateway.test.ts` and uses `ScriptedGit`/`gatewayFor` to assert exact Git argv and result classification.
- Project rules: Node 24+, pnpm/Vitest, native TypeScript, explicit `.ts` relative imports, default fake-driven tests, real Git only in the integration lane, and `just` as the default validation entrypoint.

## Requirements resolved by grilling

- Preserve `incomplete-history` as a first-class result.
- Use a conservative shallow-repository rule: a negative ancestry result is unavailable/incomplete rather than definitively false.
- Centralize reason-bearing unavailable classification across commit-dependent real-adapter operations; do not introduce an ancestry-only special-case contract that leaves other callers hard-coded to `missing-object`.
- Provide focused real shallow-repository proof for the ancestry risk. Broader shallow integration coverage for every Git operation is not required in this change; command-protocol tests should prove shared reason propagation where real integration adds little value.

## Files, symbols, tests, and docs

### Production code

- `ts/packages/incubating/infra/gitplane/src/cli/real-artifact-gateway.ts`
  - `GitFailureClassification`
  - `RealArtifactGateway.isAncestor`
  - `RealArtifactGateway.gitObservation`
  - `RealArtifactGateway.classifyGitFailure`
  - Add a narrow private helper for `git rev-parse --is-shallow-repository` (name by the fact it reads, such as `readRepositoryHistoryCompleteness` or `isShallowRepository`).

### Contract and Objective documentation

- `.ns/objectives/gitplane/references/SPEC-draft.md`
  - Near normal reconciliation’s ancestry requirement/failure split, state that inability to prove ancestry because source history is shallow is an unavailable source fact, not non-forward history.
- `.ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md`
  - Add a source-facts completion guard/proof statement for shallow negative ancestry and reason-bearing real-adapter classification.
- Consider `.ns/objectives/gitplane-reconciliation-stack-rebuild/objective.md` only if the roadmap guard does not make the completion criterion durable and unambiguous; avoid duplicating the same prose in both files without need.

### Tests

- `ts/packages/incubating/infra/gitplane/test/integration/real-artifact-gateway.test.ts`
  - Add a real shallow-clone ancestry scenario.
- `ts/packages/incubating/infra/gitplane/test/sanity/real-artifact-gateway.test.ts`
  - Update exact command scripts affected by the shallow-state probe.
  - Add/adjust focused tests for complete negative ancestry, shallow negative ancestry, positive ancestry, missing-object classification in a complete repository, reason propagation through shared failure classification, malformed/unavailable shallow-state probing, and preservation of operational failures.
- Existing `test/gather-source-facts.test.ts` should need no semantic redesign; rerun it to prove `incomplete-history` still reaches `HistoryRelationship.unavailable` unchanged.

## Implementation steps

1. **Revalidate current state and contracts.**
   - Check `git status`, current branch, and recent commits because a checkpoint command ran immediately before this plan was created.
   - Re-read the current `RealArtifactGateway` classification code and nearby tests; do not assume line numbers remain stable.
   - Confirm the Objective/spec still retain `incomplete-history` and normal fast-forward semantics.

2. **Make unavailable classification reason-bearing.**
   - Change `GitFailureClassification` from an unqualified unavailable variant to one carrying `reason: GitUnavailableReason` (import the project-owned type at the top level).
   - In `gitObservation` and every other caller, return `classification.reason` directly. Remove hard-coded `"missing-object"` values that overwrite the shared classification result.
   - Keep `resolveCommit`’s direct exit-1 behavior as `missing-object`; it resolves caller-supplied commitish input and is not evidence by itself that retained history is incomplete.

3. **Add one canonical repository shallow-state probe.**
   - Implement a small private helper using `git rev-parse --is-shallow-repository`.
   - Parse only exact trimmed `true`/`false`; malformed output or command failure is operational rather than guessed.
   - Do not parse localized Git diagnostics and do not read `.git/shallow` directly.
   - Invoke the probe only on failure/negative-classification paths where completeness changes semantics, avoiding extra Git work on ordinary successful reads and proven-positive ancestry.
   - Do not cache the fact unless the implementation can justify stale behavior after an in-process fetch/unshallow; the safer default is a failure-path probe each time.

4. **Repair `isAncestor` semantics.**
   - On merge-base success, return `found: true` unchanged.
   - On numeric exit status `1`, read repository shallow state:
     - complete repository: return `found: false`;
     - shallow repository: return unavailable `incomplete-history`;
     - shallow-state probe failure/malformed output: return an operational `GatewayError` rather than `false`.
   - Continue to route other merge-base failures through shared commit/failure classification.
   - Be careful with string exit code `"1"`: the existing behavior treats only the intended Git numeric ancestry status as semantic. Preserve or deliberately tighten that behavior based on the executor’s actual `execFile` error shape; do not accidentally turn arbitrary object/string failures into semantic non-ancestry.

5. **Centralize missing-object versus incomplete-history for failed commit-dependent operations.**
   - Retain commit probes as the authoritative way to determine whether a required commit object resolves.
   - When a required explicit commit cannot be resolved during a commit-dependent operation:
     - in a complete repository, classify `missing-object`;
     - in a shallow repository, classify `incomplete-history` conservatively because the required history may have been truncated.
   - If all required commit probes succeed, preserve the primary failure as operational; being in a shallow repository must not relabel an unrelated repository-access, parser, or command failure as incomplete history.
   - If a commit probe or shallow-state probe fails in an unexpected way, preserve an operational failure with the primary operation as the controlling failure; do not hide it behind a fabricated unavailable reason.
   - Ensure this shared path is used by commit facts, commit-tree inventory/candidate reads, diffs, and non-exit-1 ancestry failures through `gitObservation`/`classifyGitFailure`.

6. **Add command-protocol tests before or alongside the implementation.**
   - Extend `ScriptedGit` expectations to include `rev-parse --is-shallow-repository` only where classification requires it.
   - Prove the decision table:
     - complete + ancestry exit 1 → `found: false`;
     - shallow + ancestry exit 1 → unavailable `incomplete-history`;
     - ancestry success → `found: true` without a shallow probe;
     - absent required commit + complete → `missing-object`;
     - absent required commit + shallow → `incomplete-history` for commit-dependent operations;
     - all required commits resolve + fatal primary command → operational failure, even if shallow state would otherwise be relevant;
     - shallow-state probe failure or malformed output does not become false/non-forward.
   - Update existing missing-commit scripts rather than weakening exact command assertions.

7. **Add a real shallow-repository integration proof.**
   - Create a source repository with enough linear commits to clone at limited depth while retaining at least two commits (for example three source commits and `--depth=2`).
   - Clone with `git clone --depth=2 file://<source> <destination>` so depth is honored locally.
   - Assert `git rev-parse --is-shallow-repository` is `true` in the clone as a fixture precondition.
   - Through `RealArtifactGateway` prove:
     - retained parent → retained tip is positively recognized as ancestor;
     - retained tip → retained parent (Git’s negative result) is conservatively returned as unavailable `incomplete-history`, not `false`.
   - Keep complete-repository integration coverage proving a genuine negative remains `found: false`.
   - Clean up both source and clone directories in `finally` blocks.

8. **Synchronize the normative contract and Objective guard.**
   - Add concise semantics to `SPEC-draft.md`: normal reconciliation must not classify an ancestry relation as non-forward when a shallow source prevents a complete proof; it reports unavailable/incomplete history instead. Full repair remains ancestry-neutral as already documented.
   - Add a source-facts roadmap completion guard requiring the real adapter and integration proof to distinguish complete non-forward history from shallow unavailability.
   - Run a bounded grep for `incomplete-history`, `non-forward`, and shallow-history wording to ensure no active Objective/spec text contradicts the new rule. Do not rewrite the historical design report unless it contains a current-contract claim rather than preserved history.

9. **Review for code-judo simplicity.**
   - Confirm there is exactly one shallow-state probe and one reason-bearing failure classifier.
   - Reject implementations that parse stderr, scatter `if (shallow)` checks across gateway methods, or add optional reason fields.
   - Confirm the distinction is encoded in discriminated results and that no caller converts `incomplete-history` back to `missing-object` or `false`.

## Execution strategy

This plan spans production TypeScript, two test layers, and semantic Objective/spec prose (five or more likely files). Per the enriched-plan refactor execution guidance, use **`refactor-swarm` for the mixed code/tests/docs execution**, with narrowly assigned file ownership and a final parent reconciliation pass. The change is semantic rather than a same-shape syntactic rename, so do not use an opaque search/replace script or codemod. If the downstream session elects to work directly because the final diff narrows below five files, it should still make precise section-level edits and retain the final stale-contract grep.

Suggested workstream boundaries:

- adapter classification and sanity protocol tests;
- real shallow integration fixture/proof;
- spec and Objective completion guard;
- final parent review ensuring all workstreams implement one coherent decision table.

## Validation guidance

Run focused checks first, then repository gates appropriate to the touched TypeScript architecture:

```bash
pnpm --dir ts exec vitest run \
  packages/incubating/infra/gitplane/test/sanity/real-artifact-gateway.test.ts \
  packages/incubating/infra/gitplane/test/integration/real-artifact-gateway.test.ts \
  packages/incubating/infra/gitplane/test/gather-source-facts.test.ts

just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-sanity
just ts-test-typescript-style-guard
just dprint-check
just
```

Notes:

- The real shallow-clone proof belongs in the integration lane; do not move real Git into shared-cache default tests.
- The sanity file may mock only low-level runtime/vendor modules while exercising the real adapter subject, consistent with `ts/AGENTS.md`.
- If formatting fails, use `just ts-format-fix`; if dprint fails, use `just dprint-fix`, then rerun checks.
- Run `git diff --check` and a bounded final grep for stale hard-coded unavailable reasons in `real-artifact-gateway.ts`.

## Risks, assumptions, and open questions

### Risks

- **Conservative false uncertainty:** a genuinely divergent relation in a shallow repository will be reported as incomplete history. This is intentional and user-approved; operators can fetch/unshallow or use the explicitly ancestry-neutral full-repair path.
- **Overclassification:** simply treating every failure in a shallow repository as incomplete history would hide real operational faults. The implementation must require a missing required commit or the specific negative ancestry result; successful commit probes plus a fatal operation remain operational.
- **Unknown commitish ambiguity:** `resolveCommit` must remain `missing-object` for unknown input rather than converting all misses in shallow repositories to incomplete history.
- **Fixture portability:** local shallow clones ignore depth unless the source uses `file://`. Assert the shallow precondition so the test cannot silently become a complete-clone test.
- **Probe failure precedence:** a failed shallow-state probe must not yield a false ancestry answer. Preserve an actionable operational error without replacing the primary failure with speculative classification.

### Assumptions

- Git 2.x in supported environments implements `rev-parse --is-shallow-repository`; the local tool confirms the option exists.
- The existing `GitUnavailableReason` contract is intentionally retained; no compatibility migration is required because Gitplane is unreleased.
- Full reconciliation remains allowed when prior history is unavailable, as already specified; this change only prevents normal reconciliation from asserting non-forward history without complete evidence.

### Open questions

No material product decisions remain. Exact private helper names and whether the shared classifier accepts an explicit classification context are implementation details. Prefer the smallest shape that keeps the above decision table explicit and testable.

## Review and remediation checklist

- [ ] The original review finding is closed by real evidence: shallow negative ancestry is never returned as `found: false`.
- [ ] Complete-repository negative ancestry remains `found: false`.
- [ ] Positive ancestry does not pay for or depend on a shallow-state probe.
- [ ] `GitFailureClassification` carries an explicit unavailable reason.
- [ ] No shared caller overwrites that reason with hard-coded `missing-object`.
- [ ] Unknown target commitish remains `missing-object`.
- [ ] Missing required history in a shallow repository can reach `incomplete-history` through commit-dependent operations.
- [ ] Fatal failures with resolvable commits remain operational.
- [ ] No stderr parsing or direct `.git/shallow` inspection was introduced.
- [ ] The integration test proves its clone is actually shallow.
- [ ] The spec and source-facts roadmap guard state the same conservative semantics.
- [ ] The final grep finds no active contract text or adapter branch that contradicts the reason-bearing classification.
