# Philosophy

This guide is less about preferences than about reducing places where TypeScript code can lie: types
should describe reality, failures should travel through explicit channels, optional behavior should not
bloat the core, and abstractions should be smaller than the problem they solve.

## 1. Minimal core; optional behavior at the edge

A small core is easier to reason about, test, embed, and extend. If a feature is optional, backend
specific, UI specific, or policy specific, prefer an adapter, plugin, registry entry, or hook over a
new branch in the central loop.

Good signs:

- built-in features use the same registration path as third-party features;
- optional dependencies load lazily or behind adapters;
- the central workflow speaks in neutral events and capabilities;
- removing a plugin removes its policy without touching core code.

Bad signs:

- a core module imports concrete UI/backend packages;
- several features add parallel flags to the same central type;
- optional behavior is hidden behind `if (featureName === "x")` checks in hot paths.

## 2. Correct layer owns the concept

Most complexity comes from one layer knowing too much about another. Keep translation at boundaries:

- UI/input code owns keybindings, display width, focus, and render invalidation.
- Backend adapters own serialization, request options, retries required by their protocol, and native
  error normalization.
- Domain logic owns business rules and should not know filesystem, shell, HTTP, or terminal details
  unless those are the domain.
- Workflow loops own lifecycle and sequencing, not every concrete behavior.

A useful review question: "If we swap this backend/UI/runtime, which files should change?" If the
answer is "files all over the core," the boundary is leaking.

## 3. Declarative capabilities beat runtime sniffing

Scattered checks like `if (backend.includes("legacy"))` are local and easy, but they make behavior hard
to audit. Prefer one resolver that produces a concrete capability object:

```ts
interface Capabilities {
  supportsStreaming: boolean;
  maxBatchSize: number;
  authMode: "none" | "token" | "signed";
}
```

Every downstream call site reads capabilities, not backend names. Adding a backend becomes a metadata
change plus adapter tests, not a hunt through the codebase.

## 4. Types should encode legality

Do not use TypeScript as decorative documentation. If a state is illegal, make it unrepresentable when
reasonable:

- use discriminated unions for variants;
- use tagged generics so backend-specific config appears only on the matching backend;
- use `satisfies` so object literals are checked without losing literal precision;
- use `unknown` at boundaries and prove shape before use;
- avoid broad casts that make the checker stop helping.

When a cast is necessary, it should be rare, local, and justified by a runtime assertion.

## 5. Errors are part of the API

Expected failures are not surprises. Network failures, user cancellation, validation failure, missing
files, backend rejection, and permission denial should be visible in the function's return type at the
boundary where callers need to handle them.

Use throws for:

- impossible states;
- programmer mistakes;
- corrupted internal invariants;
- integration failures where continuing would hide a bug.

Use values for:

- expected external failures;
- user cancellation;
- validation problems;
- retryable backend or runtime errors;
- plugin/listener failures that the host can isolate.

## 6. Low machinery

Every abstraction has carrying cost: name, file, import path, test surface, lifecycle, and explanation.
Do not create a module, class, event type, or lifecycle phase unless it removes more complexity than it
adds.

Smells:

- a file that holds one trivial helper used once;
- a wrapper whose only job is to call another wrapper;
- parallel lifecycle events that mean almost the same thing;
- option objects copied through many layers unchanged;
- abstractions the author cannot explain without hand-waving.

Prefer direct code first. Extract only when the name captures a real concept, the helper has multiple
call sites, or extraction makes tests and invariants clearer.

## 7. Functions for logic, classes for coordination

Functions are easiest to test and compose. Use them for transformations, estimates, normalization,
selection, and parsing. Use classes when you need identity over time: subscriptions, mutable buffers,
resource ownership, render scheduling, caches, or a long-running session.

Even stateful classes should push real computation into functions where practical. That keeps the class
focused on lifecycle and makes the logic testable without constructing a full runtime.

## 8. Review stance

A good review is direct and specific:

- say what is wrong or what should change;
- identify the violated boundary, type invariant, or ownership rule;
- suggest the smaller coherent shape;
- avoid performative politeness and vague taste claims.

Use motivating language like "incoherent types," "too much machinery," or "boundary leak" because it
points to a fix. Avoid personalizing the critique.

## Quick decision checklist

1. Is this concept in the smallest layer that can own it?
2. Are invalid states impossible or at least hard to represent?
3. Are expected failures values and broken invariants throws?
4. Is optional behavior behind an adapter/plugin/capability rather than in the core loop?
5. Is the abstraction smaller than the complexity it removes?
6. Can the author explain every line and every lifecycle transition?
