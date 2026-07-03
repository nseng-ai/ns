# pr-address consumer ownership transferred

## Summary

The Objective boundary was clarified after reviewing overlap among `ts-cli-foundation`, `pr-address-typescript-port`, and `pr-address-session-store`.

`ts-cli-foundation` now owns the reusable provider layer only: `@asdl/clinkr`, `@asdl/core`, shared git/testing primitives, and non-pr-address foundation cleanup. The `pr-address` consumer migration onto clinkr is no longer work owned by this record. It is owned by `pr-address-typescript-port`, alongside package-specific compatibility fallout, payload/reference policy, schema routes, distribution cutover, plugin retirement, and Python deletion.

The payload/JSON-input home was also resolved: `loadOperationPayload` and pr-address payload/reference policy stay package-local in `pr-address-typescript-port` for now. `@asdl/clinkr` should not grow first-class payload/reference support until a second consumer proves the seam.

## Objective Impact

The roadmap now records the pr-address ownership transfer as complete, marks the shared git gateway row complete for this provider Objective, and narrows test-scaffolding consolidation to reusable non-pr-address helpers. Completion criteria now depend on explicit provider outcomes and recorded dependency boundaries rather than this Objective directly migrating all four CLIs.

This reduces overlap with `pr-address-typescript-port` while preserving `ts-cli-foundation` as the source of reusable clinkr/core APIs.

## Follow-Ups

- Continue `ts-cli-foundation` with provider-owned rows: Zod boundary validation, `asdl-dev` public surface, and reusable test helpers.
- Route package-specific pr-address work, including clinkr-shell migration and payload/reference policy, through `pr-address-typescript-port`.
- Consider clinkr-level payload/reference support only after another consumer outside pr-address proves the same seam.
