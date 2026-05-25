# Pi Host Seam Decision

## Summary

Candidate 1 has been decided after inspecting the upstream Pi codebase's own extension testing patterns.

- Upstream Pi uses real `ExtensionRunner` / `AgentSession` harnesses for runtime and extension lifecycle behavior.
- Upstream Pi uses tiny local stubs for isolated extension-example tests.
- No maintained generic `FakePi` host pattern was found.
- `createExtensionAPI()` currently binds `pi.exec` to real command execution, so the upstream harness is not directly the right tool for deterministic shell-heavy `/submit` tests.

Decision: do not introduce a broad project-local Pi host seam or maintained generic `FakePi` host now.

## Objective Impact

Candidate 1 is complete as a parked/rejected seam decision rather than an implementation slice. The Objective should not pay the maintenance cost of a universal host abstraction before a concrete repeated Interface exists.

Candidate 12's standalone fake-consolidation disposition is also recorded: do not build a universal fake-host DSL. For `/submit` promotion, start with minimal local extension-host stubs plus domain-specific Graphite/GitHub process fakes. Extract shared test support only if multiple concrete tests prove the exact same host shape.

This keeps the deletion test sharp: repeated shell/process semantics may justify a `/submit` or Graphite/GitHub command seam, but repeated test boilerplate alone does not yet justify a broad Pi host Module.

## Follow-Ups

- Continue with `/submit` promotion or the ranked Candidate 11 Objective integration check.
- During `/submit` promotion, fake the Graphite/GitHub process boundary directly before considering broader command-runtime or host abstractions.
- If future tests independently recreate the exact same extension-host stub, reconsider a tiny test helper then, not preemptively.
