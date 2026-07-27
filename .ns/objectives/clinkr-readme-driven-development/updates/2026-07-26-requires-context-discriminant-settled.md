# `requiresContext` Discriminant Settled

## Summary

The explicit runtime and TypeScript representation for contextful Clinkr apps and structured command definitions is settled as the boolean discriminant `requiresContext: true`. Omitting the property means context-free. Context-free definitions retain `handler(request)` and contextful definitions use `handler(context, request)`; context remains required per invocation rather than captured by app construction.

The discriminant is present on both a contextful app and each contextful structured command definition. Clinkr validates that the selected definition agrees with its app instead of inspecting function arity. A uniform `{ context, request }` invocation carrying a synthetic null context was considered and rejected because it would give context-free commands a dependency with no application meaning. A direct leading context generic was also rejected as the sole command signal because generics disappear at runtime and TypeScript cannot preserve inference of omitted trailing request and outcome schema generics once that leading generic is supplied explicitly.

## Objective Impact

The final human-steered API question in the active README-blessing row is resolved. `references/README-draft.md` now shows `requiresContext: true`, explains the rationale and tradeoff near the context declaration, and demonstrates contextful app construction. The decision, implementation notes, steelthread records, Objective narrative, and roadmap use the same concrete contract.

The README blessing row remains active because its compile fixtures and primary executable fixture are still outstanding; no fixture planning or implementation occurred in this decision update.

## Follow-Ups

- Compile every README TypeScript example and execute the primary one-command path unchanged through the public interface.
- Implement honest context-free and contextful overloads selected by `requiresContext`, including selected app/definition mismatch rejection and runtime argument-order tests.
- Keep context invocation-owned and preserve one homogeneous context type across a contextful tree.
