# Pi Extension Architecture Deepening

## Thesis

ASDL's project-local Pi extension ecosystem needs an explicit architecture for two different kinds of extension work:

- the `.pi/extensions/*.ts` **vibecoded extension layer**, where repo-local workflow ideas can be written quickly, dogfooded, and kept close to the Pi auto-discovery surface; and
- the `ts/packages/pi-extensions/` **engineered layer**, where durable behavior earns tests, shared modules, and package-level validation.

This Objective exists to explore and implement valuable deepening opportunities across those layers. It is intentionally dynamic: the exact final set of refactors is not known up front, and the work is done when the humans working the Objective say it is done.

## Scope

In scope:

- Authored project-local Pi extensions under `.pi/extensions/`, currently including `objective.ts`, `land-stack.ts`, `just-fix.ts`, and `submit.ts`.
- The TypeScript package under `ts/packages/pi-extensions/`, currently containing engineered `objective` and `land-stack` implementations plus Bun tests.
- Repo-specific Pi documentation under `docs/pi/`, especially `docs/pi/README.md` and `docs/pi/extension-message-linkification.md`.
- The architectural distinction between the vibecoded extension layer and the engineered layer, including promotion criteria.
- Refactors that improve locality, leverage, fake-driven tests, command execution safety, and AI navigability for Pi extension workflows.

Useful discovered context to preserve:

- Pi auto-discovers project-local extensions from `.pi/extensions/*.ts` and `.pi/extensions/*/index.ts`; `/reload` reloads project-local extensions and other resources.
- Checked-in project-local extensions that participate in worktree movement must exist in the target worktree too.
- Pi package docs recommend TypeScript packages declare Pi resources through `package.json` under `pi`, and keep Pi core packages such as `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox` as peer dependencies when imported.
- Repo validation for TypeScript Pi extensions is currently `bun run --cwd ts check` and `bun run --cwd ts test`; both passed at Objective creation time.
- The existing engineered package has strong coverage for `objective` and `land-stack`; the standalone `just-fix.ts` and `submit.ts` are useful but not currently covered by that package's tests.
- `submit.ts` currently imports the older `@mariozechner/pi-coding-agent` type path while current installed docs use `@earendil-works/pi-coding-agent`.

Starting deepening candidates to resolve somehow:

1. Clarify the vibecoded-vs-engineered extension architecture instead of assuming every `.pi/extensions/*.ts` file should become a thin adapter.
2. Extract shared Pi command runtime mechanics where reuse is real: command execution, result normalization, truncation, UI/non-UI presentation, and custom message output.
3. Deepen Objective selection around the Objective domain rule: list candidates, optionally suggest exactly one changed Objective, require explicit user selection, then invoke the chosen Objective workflow.
4. Split `land-stack` into internal deep modules without widening its external `/land-stack` command interface.
5. Decide whether `/submit` should remain vibecoded or be promoted into engineered Graphite/PR command machinery shared with `land-stack`.
6. Extract shared skill-invocation mechanics if multiple extensions continue to expand loaded skills into prompts.

## Non-Goals

- Do not force every project-local extension into the engineered package just because it is checked in.
- Do not remove the vibecoded extension layer; it is valuable for quick repo-specific workflow experiments.
- Do not redesign Pi core, Pi package loading, or the Objective system as part of this Objective.
- Do not turn Objective tracking into hidden state, a registry, a task database, or an implementation state machine.
- Do not automatically submit or land Graphite PRs as a side effect of this architecture work.
- Do not treat the six starting candidates as a rigid implementation contract; they must be resolved, but resolution may mean implementation, rejection, parking, or split-out.

## Completion Criteria

This Objective closes only by explicit human decision. A suitable closure state should include:

- The vibecoded extension layer vs engineered layer distinction is documented, starting in `docs/pi/README.md`.
- Promotion criteria are recorded for when a vibecoded extension should move into the engineered package: stability, risk, reuse, or test need.
- Each of the six starting deepening candidates has been resolved somehow: implemented, rejected with reason, parked with rationale, or split into a newer Objective.
- Accepted refactors that remain in this Objective have been implemented to the point that the relevant TypeScript checks/tests pass.
- The Objective record has been updated as meaningful decisions, discoveries, risks, and implementation outcomes emerge.
- A human explicitly says the Objective is done.

## Assumptions and Risks

Assumptions:

- The vibecoded-vs-engineered distinction is a useful seam for this repository's Pi extension work.
- `docs/pi/README.md` is the right first documentation surface for repo-specific Pi extension layer guidance; `CONTEXT.md` should wait unless the terms become broader ASDL domain vocabulary.
- Promotion should be driven by stability, risk, reuse, or test need, not by the mere fact that an extension is checked in.
- The existing `ts/packages/pi-extensions/` package can remain the home for engineered extension behavior and fake-driven tests.
- Shared modules should be introduced only where the deletion test shows real leverage across callers.

Risks:

- The Objective could sprawl because completion is intentionally dynamic; the six starting candidates and explicit human closure rule are the guardrails.
- Prematurely extracting common helpers could create shallow modules whose interfaces are as complex as their implementations.
- Moving code between `.pi/extensions/` and `ts/packages/pi-extensions/` could break Pi hot reload, project-local discovery, or worktree availability if adapters and paths are mishandled.
- GitHub and Graphite behaviors in `/submit` and `/land-stack` are risky; refactors must preserve safety checks and should consult the relevant GitHub/Graphite guidance before changing semantics.
- Tests for `land-stack` may be too coupled to command order, making refactors look riskier than they are unless the test surface is improved carefully.
- Type/package dependency choices may drift from current Pi docs if old import paths or runtime dependencies are left unreviewed.

## Open Questions

- What exact wording should `docs/pi/README.md` use for the vibecoded extension layer and engineered layer?
- Which standalone extensions, if any, should be promoted first: `just-fix.ts`, `submit.ts`, both, or neither?
- What is the smallest useful shared command runtime interface that provides leverage without becoming a shallow pass-through?
- Should Objective skill expansion become a shared module immediately, or remain duplicated until another extension proves the seam?
- How should `land-stack` tests evolve so they verify landing invariants without freezing every implementation detail?
