# Objective Stack Prompt Smoke Test

## Thesis

The `/objective-stack-impl [objective-slug]` prompt needs a small, disposable Objective that proves it can plan and execute more than one PR without risking meaningful product code.

This Objective is that fixture. It should drive a two-PR, docs-only Graphite stack whose changes are intentionally obvious and isolated under `docs/objective-stack-prompt-smoke-test/`. The stack should be easy for a human to review, easy for an agent to understand, and easy to revert by dropping the test branches or deleting the fixture directory.

## Scope

This Objective covers a smoke test of `.pi/prompts/objective-stack-impl.md` once that prompt exists and is invocable as `/objective-stack-impl objective-stack-prompt-smoke-test`.

The implementation work should be split into at least two small PRs:

- PR 1 creates the fixture directory and a short `README.md` explaining that the directory exists only to test Objective-stack prompt orchestration.
- PR 2 adds one additional Markdown file in the same directory, such as `walkthrough.md`, and optionally updates the README to link to it.

All implementation changes should remain docs-only and confined to `docs/objective-stack-prompt-smoke-test/` except for normal Objective updates under `.asdl/objectives/objective-stack-prompt-smoke-test/`.

## Non-Goals

This Objective does not include:

- Changing production Python, TypeScript, shell scripts, package metadata, CI, or generated files.
- Adding a real product feature or permanent user-facing documentation.
- Testing every edge case of `/objective-stack-impl`.
- Submitting PRs automatically if the prompt implementation normally stops before submission.
- Using Branch Memory, custom ledgers, or hidden state to track the smoke test.
- Reusing this Objective as long-lived documentation after the smoke test is complete.

## Completion Criteria

The Objective is ready for closure when:

- `.pi/prompts/objective-stack-impl.md` has been invoked against `objective-stack-prompt-smoke-test` from a normal parent session.
- The prompt produces a plan with more than one implementation slice or PR.
- The resulting Graphite stack has at least two branches or PR-ready commits, each with a simple docs-only purpose.
- All non-Objective implementation changes are confined to `docs/objective-stack-prompt-smoke-test/`.
- The parent session uses one child session per slice, inspects the child return text, and validates the changed files before continuing.
- The Objective receives at least one meaningful update recording whether the prompt workflow succeeded, failed, or needed manual intervention.
- The final state is easy to revert: deleting `docs/objective-stack-prompt-smoke-test/` and dropping the smoke-test branches removes the test fixture.

## Assumptions and Risks

Assumptions:

- A docs-only fixture is enough to exercise the important prompt behavior: Objective selection, stack planning, child-session invocation, parent validation, branch sequencing, and Objective updates.
- Two small PRs are sufficient to prove the workflow handles a stack rather than a single branch.
- Keeping all implementation files under one new directory makes the result easy to understand and revert.
- The prompt implementation can run even when the Objective itself is intentionally low-risk and does not require deep domain knowledge.

Risks:

- The smoke test may be too simple to expose issues that only appear in real code changes. That is acceptable for a first end-to-end prompt test, but follow-up tests may need richer fixtures.
- If `.pi/prompts/objective-stack-impl.md` is not present or not wired into Pi prompt discovery, this Objective will block before implementation work starts.
- If the prompt creates branches or commits outside the isolated docs fixture, the test loses its easy-revert property and should be stopped or corrected.
- The first smoke-test run de-risked vague child returns for this fixture: both child sessions returned actionable `final-text`, and the parent verified the work with file inspection and targeted `dprint` checks before advancing. Future richer tests may still need manual session-file inspection if a child return is ambiguous.

## Open Questions

- Should the smoke-test branches be submitted as draft PRs, or is a local Graphite stack sufficient evidence for this first prompt test?
- After the workflow is verified, should the fixture directory be removed in a cleanup PR, or should the branches simply be abandoned without merging?
