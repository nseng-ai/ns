# TypeScript Style Audit Fixes

## Thesis

The TypeScript code in this repository is strict and well-tested, but it does not yet fully follow the new `typescript-style` skill. This Objective tracks turning the audit findings into full compliance across the existing TypeScript surface, including source, tests, and the docs-site TypeScript config, while preserving behavior and public extension contracts. The work should stay simple by keeping the thesis and decisions human-legible; a large mechanical diff is acceptable when it implements a small number of clear decisions.

## Scope

This Objective covers remediation of the TypeScript audit findings from the repository-wide review:

- Remove non-erasable TypeScript syntax from existing code, especially constructor parameter properties in `grill-ui/inline-ui.ts`, `land-stack/command-stream.ts`, `runner-subagent/subagent-process.ts`, and test fakes.
- Eliminate the remaining explicit `any` in test support code and avoid laundering unknown values through broad casts.
- Convert object-shape and contract aliases to `interface` across existing TypeScript where the style guide calls for interfaces, while preserving `type` for unions, function types, mapped types, conditional types, and simple aliases.
- Harden untrusted CLI/runtime JSON boundaries so parsed data starts as `unknown` and is narrowed by guards or decoders before use.
- Rework expected async/system failures toward returned discriminated data or structured result objects rather than throws where callers reasonably need to branch on failure.
- Deepen dependency-injection seams around process, filesystem, spawn, clocks, and runtime imports where code is domain logic rather than an explicit Node/Pi adapter.
- Add or update lightweight guardrails so future TypeScript changes keep following `typescript-style`, including erasable syntax and boundary-narrowing expectations.

Concrete audit evidence includes strict TypeScript checks and tests passing before remediation, no `enum`/`import =`/`export =`, parameter properties in the files listed above, one test-only `any`, several eager JSON/runtime casts, broad use of object-literal `type` aliases, and inconsistent failure-as-data APIs.

## Non-Goals

- Do not change Python packages, Objective tooling semantics, or non-TypeScript architecture except where TypeScript integration boundaries require it.
- Do not rewrite product behavior of Pi extensions, Graphite workflows, Branch Memory, planned branches, or runner subagents beyond what is necessary to preserve behavior under stricter types.
- Do not hand-edit generated output; change generators or source definitions if generated TypeScript appears in scope later.
- Do not introduce a task database or hidden metadata for tracking style work; Objective Markdown remains the durable tracking surface.
- Do not create routine validation-only roadmap rows; tests, type checks, and repo checks are completion evidence for semantic remediation work.

## Completion Criteria

- Existing TypeScript source and tests avoid non-erasable constructs called out by `typescript-style`: no `enum`, TS `namespace`/`module`, parameter properties, `import =`, or `export =`, unless an intentional exception is documented with local justification.
- No explicit `any` remains outside a documented, isolated library interop wrapper.
- Object shapes and contracts use `interface`; unions, function types, mapped/conditional types, and simple aliases use `type`.
- CLI JSON, tool params, runtime message details, dynamic module surfaces, and other untyped inputs enter as `unknown` and are narrowed before property use.
- Expected system, validation, parse, cancellation, and command failures at async boundaries are returned as typed data where callers branch on them; remaining throws are reserved for programmer errors, invariants, or deliberately terminal command-boundary presentation.
- Direct globals and Node APIs are either injected behind explicit interfaces/options or contained in modules that are clearly acting as adapters.
- Any unavoidable deviations from the style guide are documented near the relevant code or in a TypeScript contributor note.
- Relevant TypeScript checks, tests, and any added style guardrails pass as evidence for the changed areas.

## Assumptions and Risks

Assumptions:

- The user's selected scope is full compliance across existing TypeScript, not only minimal hard-violation cleanup.
- Simplicity is measured by the number of human-legible decisions, not by diff size or file count. A rename or type-shape conversion that touches many files can still be simple if it expresses one clear decision.
- Broad conversion from object-literal `type` aliases to `interface` is acceptable despite churn, provided behavior and public exports remain compatible. Re-confirmed on a second package (`ts/packages/asdl-dev`, branch `asdl-dev-stack-omnibus-roaster-fixes`): behavior and public exports preserved with gates green.
- Most JSON/runtime casts can be replaced with small local guards without needing a large schema library. Confirmed for the CLI/process and runner/grill boundary slices: `land`, `land-stack/pr-facts`, `worktree-status`, `runner-subagent/json-events`, `runner-subagent/subagent-runtime`, and `grill-ui/inline-ui` were hardened with small local guards and normalizers, with no schema dependency added.
- Some modules, such as process runners or filesystem watchers, may legitimately remain Node adapters; the compliance bar is explicit ownership and containment, not removing all Node API usage. The 2026-06-09 DI/adapter ownership slice de-risked the known narrow domain-ish seams by injecting `pathExists`, `normalizePath`, and `readTextFile` collaborators while accepting larger command-flow/controller-runtime modules as adapter-owned surfaces.

Risks:

- The main complexity risk is accidentally mixing multiple unrelated design decisions into one remediation slice. Large mechanical edits are acceptable when they remain traceable to one simple decision.
- Reworking throw-based APIs into returned data can cascade through tests and command handlers; careless conversion could weaken user-facing error messages. De-risked across the completed failure-as-data slices: the brmem/planned-branch conversion (`runFirstAvailableBrmemCommand` → `FirstAvailableBrmemCommandRun`, discriminated `BrmemRun` through `attached-plan`/`plan-persistence`/`planned-branch-creation`), the `asdl-dev` submit-gateway conversion (presentation strings → typed `SubmitSemanticFailureCause` / `CurrentPrVerificationFailureCause` causes), the `land-stack` conversion (`LandStackFailure` / `LandStackResult<T>` through preflight, PR facts, worktrees, planning, mutation, merge-loop, presentation, and command streaming), runner runtime config/result parsing, and the handoff/objective parser conversion all preserved user-facing messages by moving expected failures into discriminated returned data and updating tests to assert on returned `type`/failure fields rather than caught throws, with gates green.
- Tightening unknown-boundary validation may reveal malformed external command output or runtime shapes that existing code tolerated implicitly. Partially materialized and accepted: malformed `gh pr view` output that prior casts laundered is now rejected deliberately — a present non-string/non-null `body` is rejected instead of coerced to `""`, and a non-boolean `isDraft` is rejected instead of passing through `Boolean(...)`. Malformed `brmem list` entries are skipped individually so a single bad element no longer forces the whole footer to `unavailable`. Malformed runner JSONL event records still use the parser error path, terminal tool schemas whose JSON round-trip is not an object are rejected before spawn, and malformed optional grill runtime exports are ignored so valid inline UI behavior falls back safely.
- Adding automated guardrails for the style guide could require choosing between TypeScript compiler options, lint rules, or custom scripts; this is partly de-risked by starting with a markdown Roaster reviewer for low-context Tier A diff checks and by adding repo-root agent guidance that requires loading the `typescript-style` skill before TypeScript work, rather than a broad compiler/lint gate.
- Some existing public exported type aliases may need compatibility-preserving migration rather than direct replacement.
- Dependency-injection over-abstraction is now an accepted closeout risk rather than an open design blocker: `asdl-dev/src/checkpoint-flow.ts`, `pi-extensions/src/pr-feedback-watch.ts`, and explicit CLI/command-runner/gateway modules own their direct runtime interactions unless the final audit-loop scan finds a narrower domain seam.

## Open Questions

- Should `erasableSyntaxOnly` or another compiler/lint guard supplement the Roaster reviewer later if review-only coverage proves insufficient?
- Which exported object-shape aliases, if any, must remain as compatibility aliases over new interfaces for downstream consumers?
- For the final closeout scan, are there any direct Node/Pi globals outside the accepted adapter-owned sites (`asdl-dev/src/checkpoint-flow.ts`, `pi-extensions/src/pr-feedback-watch.ts`, and explicit CLI/command-runner/gateway modules), or can those accepted boundaries be documented as the compliance line?
- Should machine-envelope and CLI JSON parsing converge on shared decoder helpers, or stay as local guards to avoid over-abstracting?
