# Roadmap

## Work

- [ ] Establish the initial migration ledger for active first-party capabilities.
  - Classify each considered capability as unstarted, in progress, TS-default, retired, parked, or out of scope.
  - Require evidence of active use, dependency need, or strategic value before porting unclear capabilities.
- [ ] Create the `pr-address` capability subobjective as the first production vertical slice.
  - The umbrella Objective should name `pr-address` only as the proving slice; detailed operation design belongs in the subobjective.
- [ ] Define the minimal TS migration scaffold.
  - Capture package/layout conventions, command-runtime conventions, gateway interface conventions, golden-test conventions, and an initial porting checklist.
  - Standardize on the current TS workspace defaults: pnpm, Node ESM, strict TypeScript, and Vitest unless evidence forces a change.
- [ ] Begin the internal JS/TS clinkr foundation incrementally.
  - Start with the smallest command runtime needed by the first vertical slice.
  - Grow toward a shared framework only when repeated capability ports prove stable API needs.
- [ ] Complete the `pr-address` TypeScript cutover and Python retirement through its subobjective.
  - Evidence should include golden/contract parity, public CLI/skill scenarios, fake-driven gateway/core tests, limited real-adapter smoke coverage where safe, wrapper/doc updates, and removal or retirement of active Python paths.
- [ ] Refine a reusable porting playbook from the first full cutover.
  - Promote lessons from `pr-address` into durable guidance for later capability subobjectives.
- [ ] Select the next capability by integration leverage.
  - Prioritize frequent Pi/skill usage, reusable shared seams, strong existing golden/scenario coverage, and strategic value.
- [ ] Repeat the capability subobjective pattern until all active first-party user-facing capabilities are TS-default.
  - Preserve stable CLI/skill contracts during takeover.
  - Add cleaner TS-native APIs behind or alongside those contracts where useful.
  - Keep Python only for a short explicit retirement phase after TS default, then delete or archive it when callers, docs, and tests no longer depend on it.
- [ ] Complete final migration cleanup.
  - Ensure public skills, wrappers, docs, package distribution, and migration ledger agree on the TS-default toolkit state.
  - Mark any remaining Python as deleted, archived, retired, or explicitly out of scope.

## Parked

- Detailed `pr-address` operation inventory, module design, and cutover mechanics.
- Exact public API shape and package identity for JS/TS clinkr.
- Direct browser-compatible execution for capabilities whose domains depend on local git, shell, filesystem, or authenticated system state.
- Porting inactive, vendored, experimental, or unclear-value Python code before evidence justifies it.
- Broad TypeScript rewrites of Python `asdl-core` concepts that have not yet appeared as repeated seams in vertical slices.
