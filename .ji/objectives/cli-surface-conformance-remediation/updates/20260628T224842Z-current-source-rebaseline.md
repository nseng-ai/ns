# Current source rebaseline after CLI package drift

## Summary

Rebaselined this Objective against current `master` source after confirming that the Objective directory itself had not changed since `ba589946bc8ff1dee01b9ecfdbcc86010691e745`, while the CLI implementation surface changed substantially through package topology, extension-command, and CLI house-style work.

Provenance: objective-refresh basis target=e54c0e7513c50387b13be6163aa632388a3008e2 from=ba589946bc8ff1dee01b9ecfdbcc86010691e745

Decisive verification:

- `docs/adr/0015-cli-surface-conformance-decisions.md` still exists and is `Accepted`; its six decision sections still cover raw-exit policy, hidden `exec` write intent, `ccc land`, query/action miss semantics, empty-success/presence-query `ok`, and dotfile/user-environment writes.
- `docs/cli-surface-conformance-audit.md` still exists and still has no active `ADR-needed` remediation classification; it also still records historical file:line evidence.
- Current tracked package locations differ from several historical audit-era paths: verified examples include `@sdl/areg` at `ts/packages/tools/areg`, `@sdl/brmem` at `ts/packages/infra/brmem`, `@sdl/packagechk` at `ts/packages/tools/packagechk`, `@sdl/slot` at `ts/packages/capabilities/slot`, `@sdl/kernel` at `ts/packages/kernel`, `@sdl/address` replacing the former PR Address package, and `sdlcc` at `ts/packages/hosts/sdlcc`.
- Representative open rows still reproduce in current source: `brmem delete` has no confirm flag, `sdl shell install` writes the marker block without a confirm option, `packagechk claim-*` still uses `skipConfirmation`, `slot free --all` still keys confirmation on `ctx.shouldWriteCdDirective` with `confirmation_required`, `branch-context` still has `branch_context_error`, AREG skillx still emits `missing-tool`, and `brmem resolve-prompt` still emits `prompt-not-found`.
- Aretro's old area (b) row cannot be carried forward blindly: current Aretro code has an SDL extension command face plus `maxSessions`, compact result fields, payload-mode storage, and detail locator hints, so the output-bound classification needs fresh assessment before implementation.

## Objective Impact

The durable Objective now treats `docs/cli-surface-conformance-audit.md` as a historical seed matrix and checklist rather than fresh current-path proof. A new in-progress roadmap row requires current-source reconciliation before each remediation area lands. The area (a), (c), and (b) rows were narrowed to the current verified examples and to avoid silently applying stale file locators after package moves.

No closure is implied. The Objective remains active because representative danger-tier, exit-semantic, `errorType`, and output-bound rows still need implementation, reclassification, or explicit parking.

## Follow-Ups

- Start remediation by completing the current-source reconciliation for the exact slice being edited, then land area (a) human-facing confirmation fixes first.
- Do not add confirmation to hidden `exec` destructive/external writes unless ADR 0015 is superseded.
- Reassess Aretro area (b) from current schemas before deciding whether to land more bounding metadata or park the row.
