# Address Final Refresh

## Summary

Refreshed the live Address/PR-feedback narrative after the migration landed:

- The child Objective thesis, scope, completion criteria, assumptions/risks, and roadmap now describe the landed `@sdl/address` package, `@sdl/address/api` Capability API, and `sdl address exec ...` command face.
- Root context, the context map, SDL package context, Pi context relationship wording, Address README, and the PR feedback skill docs now describe Address as the PR-feedback capability boundary instead of teaching the old standalone command/package as the owner.
- The parent `sdl-extension-architecture` Objective now records Address as a completed child migration and updates its capability lists / ADR 0016 summary from the old PR Address package identity to Address.

Current boundary after this refresh:

- Address owns portable PR feedback collection, branch-to-PR mapping, check payload normalization, feedback Markdown assembly, and review-thread reply/resolve mutation semantics behind gateway-injected core seams.
- `@sdl/address/api` is the curated in-process Capability API for PR-feedback consumers.
- `sdl address exec ...` is the command face; the standalone legacy binary/install shim is removed.
- Pi keeps presentation/session residue: editor prefill, prompt injection, stack prompt assembly, live watch state, dirty-tree/idle gating, and notifications.
- Watch/fingerprint extraction remains parked until a concrete non-Pi or Address API consumer appears.

Stale-term evidence:

- Focused live-doc search across the refreshed files:

  ```bash
  rg -n "@sdl/pr-address|ts/packages/pr-address|\bpr-address\b" \
    .sdl/objectives/sdl-extension-architecture/objective.md \
    .sdl/objectives/sdl-extension-architecture/roadmap.md \
    CONTEXT.md CONTEXT-MAP.md \
    ts/packages/sdl/CONTEXT.md ts/packages/hosts/pi/CONTEXT.md \
    .sdl/objectives/pr-address-capability-extension/objective.md \
    .sdl/objectives/pr-address-capability-extension/roadmap.md \
    ts/packages/address/README.md \
    skills/pr-address/SKILL.md \
    skills/pr-address/references/cli-collection.md \
    skills/pr-address/references/cli-reference.md
  ```

  Remaining hits are intentional exceptions: the stable `skills/pr-address` skill slug/header for discoverability, and the historical child update filename `updates/2026-06-28-pr-address-surface-inventory.md` referenced as provenance.

- Wider markdown search excluding ADRs and Objective update files still finds historical / provenance documents (`CHANGELOG.md`, retrospective/audit docs, remote-code-authoring notes) plus the stable skill slug. Those were not rewritten in this final context slice because the requested refresh was live narrative/context rather than immutable or historical provenance cleanup.

Validation:

- `just dprint-check` passed.

## Objective Impact

This completes the final roadmap row for this child Objective: live narrative and context now match the landed Address Capability state, the parked watch/fingerprint follow-up is explicit, and the parent Objective can count Address as a completed child migration.

Completion criteria are now satisfied for this Objective unless the user wants an immediate `objective-close` step.

## Follow-Ups

- If a future non-Pi or command-face consumer needs watch/fingerprint behavior, design a focused `@sdl/address/api` seam instead of importing Pi watch internals or private Address core modules.
- A separate closure decision can run `objective-close` if the user agrees the completion criteria are satisfied.
