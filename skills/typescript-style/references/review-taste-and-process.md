# Review Taste and Process

Use this as a concise rubric for TypeScript review. The goal is not to enforce personal taste; it is to
catch code that will be hard to maintain because the types, layers, or lifecycle are incoherent.

## Start with the decision

Good review comments are direct:

- "This should be a discriminated union; the current booleans allow impossible states."
- "This belongs in the adapter, not the core loop."
- "Return a `Result` here; callers should not catch expected validation failures."
- "This helper is used once and hides the local state it needs. Inline it."

Avoid vague comments like "feels off" unless you immediately name the violated invariant.

## Common findings

### Incoherent types

Symptoms:

- a function accepts `unknown` but immediately passes the value to a sink that requires `number`;
- a cast bypasses the runtime check that would justify it;
- a union permits states the runtime cannot handle;
- a config field is optional long after defaults should have been applied.

Fix: make the types line up end to end. Narrow at the boundary, resolve defaults once, and represent
state as a union that matches runtime behavior.

### Too much machinery

Symptoms:

- a new file exists for one trivial helper;
- a wrapper method only forwards to another wrapper;
- a new lifecycle duplicates an existing lifecycle with slightly different names;
- a generic framework appears before there are multiple real use cases.

Fix: remove the parallel mechanism. Keep the simplest design that preserves the invariant.

### Boundary leak

Symptoms:

- UI code knows backend serialization details;
- a backend adapter imports app-specific UI/runtime types;
- core workflow code branches on concrete plugin/backend names;
- domain logic shells out or reads globals directly.

Fix: move translation to the boundary, inject collaborators, and make the core speak neutral types.

### Hidden expected failure

Symptoms:

- callers must catch exceptions for validation, missing files, user cancellation, or backend rejection;
- async streams reject instead of producing a terminal failure event;
- errors carry only strings when callers need stable reasons.

Fix: return `Result<T,E>` or a terminal error event with a stable reason/code/message.

### Unowned complexity

Symptoms:

- the author cannot explain why a branch exists;
- generated or copied code is accepted without understanding;
- abstractions are named after implementation mechanics rather than domain concepts;
- tests only assert mocks were called, not the boundary contract.

Fix: simplify until the author can explain the lifecycle and invariants, then test the contract.

## Review wording patterns

- "Agree with the direction, but the boundary is wrong: move this into the adapter."
- "Disagree with this abstraction. There is one call site and the helper hides required local context."
- "This should be a returned error. Missing input is expected, not a programmer invariant."
- "The cast is too far from the check. Put the assertion and cast in one wrapper."
- "This creates two models for the same lifecycle. Reuse the existing phase and add a field if needed."

## Process defaults

- Review the smallest meaningful diff; avoid unrelated cleanup.
- Ask for tests at the boundary where the behavior is promised.
- Do not demand style churn that the project formatter/linter does not require.
- Respect local commit, changelog, and issue conventions.
- Prefer deleting code over adding framework when both solve the problem.
- If a change breaks public API, make the product decision explicit.

## Self-review before sending

1. Can I explain every line and why it belongs in this layer?
2. Are invalid states impossible or rejected at the boundary?
3. Are expected failures values and broken invariants throws?
4. Is optional behavior outside the core loop?
5. Is the abstraction smaller than the complexity it removes?
6. Do tests prove the public contract rather than implementation trivia?
