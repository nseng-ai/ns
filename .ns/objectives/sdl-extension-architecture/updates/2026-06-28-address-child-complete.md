# Address Child Migration Complete

## Summary

Recorded the completed Address child migration from `pr-address-capability-extension` in the parent architecture Objective.

The live parent tracking now says:

- The Phase 2 capability set uses `address` as the current capability/package identity.
- ADR 0016's PR-feedback seam is surfaced through `@sdl/address/api`, with lower real GitHub mechanics still in `@sdl/core/github-pr-feedback` and dependency direction Address → core.
- Address has completed its child Objective: `@sdl/address/api` is the curated Capability API, `sdl address exec ...` is the command face, the standalone legacy binary/install shim is removed, Address owns gateway-injected PR-feedback domain seams, and Pi keeps only presentation/session residue.

## Objective Impact

This materially advances parent Phase 2 row 4 (per-capability child migrations). Address should no longer be listed among unspawned or incomplete child migrations. The remaining Phase 2 children after the already-recorded completions are Roaster and Aretro, plus broader `ccc` clean-consumer conversion and eventual transitional-package deletion.

## Follow-Ups

- Keep the Address watch/fingerprint extraction question parked until a concrete non-Pi or Address API consumer appears.
- Continue parent Phase 2 by selecting the next unmigrated child capability or by rebaselining `ccc` clean-consumer work after current completed children are accounted for.
