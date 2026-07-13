# Pi ownership genericization completed

## Summary

Completed the repo-specificity audit's Pi ownership finding by moving the rare
`code-workflows` picker, direct `gh-ci-debug` route, and smart-restack wrapper into the
private tested `@internal/pi-tools/code-workflows` subpackage. Flow no longer exports or
contains repository skill names, references, or the former mixed-owner code aggregate;
it retains generic `/ns:flow:*` mirrors and `gt:squash-stack`, while project discovery
composes internal smart restack with Flow stack squash in `.pi/extensions/code.ts`.

The three internal commands and Flow-owned `gt:squash-stack` preserve their command names,
descriptions, argument behavior, workflow semantics, and package-local parity accounting,
while now requesting explicit transcript acknowledgement. Smart restack consumes one typed
preflight function. Its provisional real adapter keeps the `git status` readability probe,
resolves the canonical repository root, fails closed on unresolved Git-directory metadata,
and uses Foundation operation facts for rebase detection. The adapter names Objective
`slot-gt-restack-preflight` and `ns slot gt exec restack-preflight --format json` as its
replacement path rather than establishing a competing durable contract.

## Objective Impact

The Pi ownership child row and the audit genericization parent row are complete. All four
repo-specificity audit resolve clusters are now resolved without adding a Flow point,
general failure protocol, Internal-to-Flow dependency, or compatibility shim. The
Objective remains open because canonical README reconciliation and promotion are still
required by its completion criteria.

Evidence gathered before this update:

- focused Internal code-workflow and Flow Pi tests pass;
- the complete `@internal/pi-tools` and `@nseng-ai/flow` package suites pass;
- TypeScript formatting, lint, typecheck, and the TypeScript style guard pass;
- project-local Pi runtime adapter imports and workspace package-resolution probes pass,
  including refusal of the removed Flow export paths;
- hermetic duplicate-aware Pi RPC inventory reports exactly the four stable command names
  and descriptions with extension provenance;
- full repository `just` passes.

## Follow-Ups

- Reconcile and promote the canonical Flow README, repoint this Objective's canonical
  reference, and then apply the Objective Closure Gate.
- When `slot-gt-restack-preflight` lands its structured command, replace the provisional
  local smart-restack adapter with that command rather than widening the local seam.
