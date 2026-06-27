**Direction: repeated CLI/core concepts are consolidated into shared layers; god-files are split.**

Getting to: duplicated concepts (branch resolution/validation, GitHub leaf helpers, Graphite
topology reads) live once in `@sdl/core`/`@sdl/graphite`; oversized files (`areg/real-gateways.ts`,
`ccc/land-stack/landing-operations.ts`) are decomposed. The shared `defineCli` helper already landed.

What you see now — do not copy: duplicated branch resolvers/validators and divergent GitHub helper
copies; god-files in `areg` and `ccc/land-stack`. Note: this cleanup is paused behind the
`sdl-extension-architecture` endgame — rebaseline rows before starting new ones.

Avoid: copying CLI boilerplate into a new command; promoting SDK surface for convenience alone;
moving capability-domain logic below the SDK just to dedup (ADR 0009 layering guardrail).

Active slice: see this objective's roadmap.md.
