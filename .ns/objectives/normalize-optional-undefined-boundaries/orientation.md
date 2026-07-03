**Direction: internal TypeScript models normalize absence at boundaries instead of accepting explicit `undefined` everywhere.**

Getting to: option/input/override/deps/config and external payload shapes may keep `?: T | undefined`; internal domain/result/state/presentation records should use omission, defaults, `null`, or explicit domain variants after boundary normalization.

What you see now — do not copy blindly: many internal models still expose `?: T | undefined` because loose parser, CLI, process, or builder values leaked through entire callstacks.

Avoid: mechanical count-reduction rewrites; adding `| undefined` to placate typecheck; changing public compatibility surfaces without a normalized internal type; erasing meaningful `null` semantics.

Active slice: see this objective's roadmap.md.
