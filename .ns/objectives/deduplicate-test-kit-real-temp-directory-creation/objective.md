# Deduplicate Test-Kit Real Temporary-Directory Creation

## Thesis

Remove one verified duplicated-code smell from `@nseng-ai/foundation/test-kit` by giving canonical temporary-directory creation a single private implementation. Three live callers currently repeat the same `mkdtemp`-then-`realpath` operation; one helper should own that operation without changing tracking, repository setup, cleanup, or public behavior.

This is a bounded autoobjective intended to exercise the portable `objective-autorun` workflow in one parent-judged implementation step.

## Scope

- Re-verify the three live duplicate expressions in `ts/packages/public/infra/foundation/src/test-kit/index.ts`:
  - `createTempDirTracker().makeTempDir`;
  - `createTempDirTracker().makeHomeTempDir`;
  - `withTempGitRepo`.
- Add one private `createRealTempDir(baseDir: string, prefix: string): Promise<string>` helper that preserves the existing `mkdtemp` followed by `realpath` operation order.
- Replace all three duplicate expressions with calls to that helper.
- Preserve each caller's existing ownership of directory tracking, Git-repository setup, callback lifetime, and cleanup.
- Add focused coverage only if parent review determines existing coverage is insufficient for the extraction.

Provenance: this finding was recorded as the `ts/packages/infra/test-kit` duplicated-code finding in `.ns/objectives/code-smell-roaster-remediation/references/infra.md`. That source Objective was abandoned with the finding undisposed; this Objective copies only the re-verified finding and does not reopen or continue the old backlog.

## Non-Goals

- No public API or export changes.
- No broader test-kit cleanup, filesystem abstraction, or temporary-directory redesign.
- No changes to cleanup timing, tracked-directory arrays, Git marker creation, callback behavior, or error propagation.
- No remediation of other findings from `code-smell-roaster-remediation`.
- No Objective Edge to the closed source record.
- No push, submit, pull-request mutation, publication, deployment, or other external write.

## Completion Criteria

- Exactly one private helper owns `mkdtemp(join(baseDir, prefix))` followed by `realpath`.
- The three verified callers use the helper and no equivalent duplicate expression remains in the test-kit implementation.
- Tracking, repository setup, callback, cleanup, and error semantics remain unchanged.
- No public surface changes.
- Focused Foundation tests and relevant repository checks pass.
- The accepted implementation is one parent-verified ordinary local commit produced through explicitly selected portable autorun mode; it is not a Runner Checkpoint.

## Definition of Progress

Progress is keepable when the actual diff is limited to the private helper extraction and, only if necessary, narrowly focused test coverage; all three live duplicate sites are migrated; behavior and ownership boundaries are preserved; and parent-run validation passes.

Do not keep changes that broaden into unrelated test-kit refactoring, alter public exports, change cleanup or error behavior, or require a new architectural decision.

Useful evidence includes a source sweep showing one canonical implementation, `git diff --check`, focused `@nseng-ai/foundation` tests and typecheck, and the repository's relevant format/lint/type validation.

## Runner Policy

This Objective is designed for one explicitly portable, parent-judged autorun implementation step.

- Direct execution is allowed after the normal autorun preview and confirmation for the single roadmap slice.
- Use portable mode even when ns bookends are available.
- The implementation child may edit only the test-kit implementation and narrowly necessary focused tests, must leave changes uncommitted, and must not edit Objective tracking.
- The parent must re-verify branch and HEAD invariants, inspect the complete diff, confirm all three migrations and unchanged ownership semantics, run validation directly, and create at most one ordinary local implementation commit.
- Add focused coverage only when parent judgment finds existing coverage insufficient; do not invent tests solely to increase line count.
- Stop and ask if the live code no longer has exactly the documented shape, if preserving behavior requires broader redesign, or if validation exposes a non-local problem.
- The launch budget is one implementation step. A failed attempt ends this run for judgment rather than beginning another implementation slice.
- Push, submit, PR mutation, publication, merge, land, deployment, and every other write-capable external action are out of scope. Portable runner publication is unavailable/not applicable.

## Assumptions and Risks

Assumptions:

- The three re-verified expressions remain behaviorally identical apart from their supplied base directory and prefix.
- A private same-module helper can preserve operation ordering and errors without changing callers' cleanup ownership.
- Existing Foundation test infrastructure is sufficient to validate this extraction, with a focused test added only if a real coverage gap matters.

Risks:

- Moving tracking-array updates or `withTempGitRepo` cleanup into the helper would silently broaden ownership; keep those operations in their current callers.
- A helper that changes `mkdtemp`/`realpath` ordering or catches errors would alter behavior; preserve the exact sequence and propagation.
- The small slice may tempt opportunistic cleanup nearby; the one-step scope explicitly excludes it.

## Open Questions

None at creation. If re-verification disproves the three-instance shape, stop for parent judgment rather than silently redefining the Objective.
