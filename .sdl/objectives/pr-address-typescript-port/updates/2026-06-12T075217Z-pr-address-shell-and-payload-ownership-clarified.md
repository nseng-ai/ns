# pr-address shell and payload ownership clarified

## Summary

Ownership for remaining pr-address-specific work was clarified against `ts-cli-foundation` and `pr-address-session-store`.

`pr-address-typescript-port` now explicitly owns the `pr-address` consumer migration onto `@asdl/clinkr`: building the command shell through clinkr, preserving legacy-Python fallback dispatch until the retirement rows, and handling all package-specific compatibility fallout. `ts-cli-foundation` remains the provider of reusable framework/core APIs; only reusable gaps proven by this migration should route back there.

`loadOperationPayload` and payload/reference policy are package-local in this Objective for now. The payload spec should remain clinkr-compatible (`snake_case` keys and `--<key>-reference` derivation), but first-class clinkr payload/reference support should wait for a second consumer outside pr-address.

`pr-address-session-store` remains a successor workflow redesign and should not start until this Objective closes the TS-only cutover.

## Objective Impact

The Objective thesis, scope, non-goals, completion criteria, risks, open questions, roadmap row, endgame branch sequence, and parked notes now all assign pr-address clinkr-shell migration and payload ownership here rather than to `ts-cli-foundation`.

The endgame branch sequence now includes a `clinkr-shell` branch before schema routes, bundle distribution, plugin retirement, Python deletion, and playbook feedback.

## Follow-Ups

- Implement group-2 payload/reference consolidation package-locally before the clinkr-shell branch.
- During the clinkr-shell branch, route only reusable framework gaps to `ts-cli-foundation`; keep package-specific compatibility work here.
- Keep `pr-address-session-store` blocked until this Objective has closed the TS-only compatibility-preserving cutover.
