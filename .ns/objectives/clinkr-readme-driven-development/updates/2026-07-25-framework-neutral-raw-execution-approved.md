# Framework-Neutral Raw Execution Approved

## Summary

The user approved narrowing Clinkr's raw escape hatch to demonstrated ns needs rather than designing an opaque Commander subtree API. A selected raw command may receive its raw argv tail and own output bytes and exit status, while Clinkr continues to own application routing and command metadata.

Current evidence supports SDK passthrough commands and genuinely byte-owning operations such as `vibechk run`. It does not show an ns caller that needs to mount and compose an existing Commander `Command` tree.

## Objective Impact

The provisional contract, decision record, audit disposition, Objective narrative, and roadmap now reject Commander-specific mounting as current scope. Reconciliation should preserve a narrow framework-neutral raw seam, migrate ordinary structured operations to `ClinkrCommand`, and avoid adding filesystem or builder composition APIs for opaque Commander trees.

The raw-execution discussion gate is resolved. `ClinkrFailure` removal remains the only open refactoring discussion before the broad discussion roadmap row can complete.

## Follow-Ups

- During reconciliation, preserve SDK raw-argv passthrough and verify whether `vibechk run` still requires byte/exit ownership.
- Keep Clinkr ownership of application routing and command metadata explicit; do not recreate the current split `isRawExit` / `shouldPassThrough` model without a clear seam.
- Add a framework-specific subtree adapter only after a concrete application demonstrates that need.
- Settle `ClinkrFailure` removal before beginning implementation on that surface.
