**Direction: repeated CLI/core concepts are consolidated into the right shared layers; god-files are split after ownership is reclassified.**

Getting to: neutral duplicated mechanics live once in `@ji/core`/`@ji/capability-kit`/`@ji/brmem`, while capability-domain policy stays in its capability package/API. Completed history includes `defineCli` (`@ji/core/cli-runtime`), branch-context BrmemGateway migration, `runBrmem`, GitHub PR-feedback leaf-helper sharing, the core root-export deletion, and the areg/kernel/packagechk/vibechk/jicc neutral cleanups.

What you see now — do not copy: this Objective's `references/` and pre-rename updates use retired `@sdl/*`/`sdlcc` names — re-map before use. Every neutral structural-cleanup row is complete; all remaining open roadmap rows are capability-owned or design-sensitive (Flow submit/topology, aretro, ccc cmux dispatch, objective validator, plan-attachment) and route to their owning capability context, not to neutral infra work here.

Avoid: copying CLI boilerplate into a new command instead of `defineCli`; promoting SDK/core surface for convenience alone; moving capability-domain logic below the SDK just to dedup (ADR 0009 layering guardrail).

Active slice: see this objective's roadmap.md.
