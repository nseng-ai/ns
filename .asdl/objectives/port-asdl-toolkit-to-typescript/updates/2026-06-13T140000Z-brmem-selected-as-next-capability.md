# brmem selected as the next capability

## Summary

Selected `brmem` (Branch Memory) as the second production vertical slice of the toolkit TypeScript migration, holding the persisted capability order, and created the `brmem-typescript-port` subobjective to track the detailed port.

Integration-leverage evidence confirmed the persisted default rather than changing it:

- Existing TypeScript code already depends on `brmem`: `@asdl/core/brmem-cli.ts` is a shell-out launcher and `branch-context/brmem-gateway.ts` is a consumer. A native TypeScript implementation therefore has immediate downstream reuse value.
- The capability itself is still fully Python-backed (~3,400 lines: `put`/`get`/`list`/`delete`/`check`/`copy`/`export`/`exec resolve-prompt`, plus `ref_layout`, `gateway`, `validation`, `content_limits`).

The subobjective records the design decisions that distinguish `brmem` from `pr-address`:

- Home: standalone `ts/packages/brmem` exporting both a reusable library and the CLI (matching the Python package's deliberate self-containment and importability by sibling consumers).
- Central correctness concern: cross-language git-ref storage parity (`refs/brmem/base|ns/...`, branch `/`→`---`, `<snapshot-ref>:<key>` Entry Locator) so Python- and TypeScript-written entries interoperate during transition.
- Distribution: run-from-source shim, mirroring the accepted `pr-address` model.
- No `asdl` plugin to retire — `brmem` ships only as a standalone console script, so the endgame is simpler than `pr-address`.
- Scope is capability-only: rewiring the existing TS consumers is deliberate follow-up, not part of this subobjective.

## Objective Impact

- Roadmap: the "Select the next capability" row is now `[x]`, with evidence pointing at the `brmem-typescript-port` subobjective and the integration-leverage rationale. The remaining order after `brmem` is unchanged: `handoff`, `objective`, `asdl-dispatcher`, roaster, `slot`, `vibechk`, then `aretro` last.
- Migration ledger: the `brmem` row moves from `Unstarted` to `In progress; subobjective active`.
- Open Questions: "Which capability should follow `pr-address`…" is resolved in favor of `brmem`.
- This is a selection/tracking update only; no `brmem` implementation has landed yet.

## Follow-Ups

- Execute the `brmem-typescript-port` subobjective, starting with its contract-inventory row.
- A reusable git ref/blob/tree plumbing seam may emerge from the `brmem` port; record whether it stays package-local or should be recommended to `ts-cli-foundation` once a second consumer proves it.
- Consumer migration (`@asdl/core` launcher, `branch-context` gateway) onto native `brmem` remains deferred follow-up outside the `brmem-typescript-port` subobjective.
