# CCC Pi Adapter Boundary

## Summary

A design grilling session resolved the intended boundary for the remaining `@sdl/ccc` → `@sdl/pi` accepted-debt edge in Phase 2 Step 5.

Decisions:

- Create/extract a planned `@sdl/ccc-pi` adapter package rather than blessing direct `@sdl/ccc` imports from Pi host helper subpaths.
- Declare the adapter as `capability-pi`: it is Pi presentation for the CCC first-party orchestration surface, stacked above the Pi host.
- `@sdl/ccc-pi` imports both `@sdl/ccc` and neutral `@sdl/pi/...` helper subpaths; `@sdl/ccc` should expose a small Pi-free orchestration interface, preferably `@sdl/ccc/api`, for the adapter to call.
- `@sdl/ccc-pi` owns all CCC-specific Pi-facing presentation and registration code: command registration, acknowledgement/progress wiring, Pi prompt/session formatting, machine-envelope parsing, and slash-command formatting.
- The target end state is zero `@sdl/ccc` imports from `@sdl/pi/...`. During migration, current imports may be retired family-by-family as tracked debt.
- The first implementation slice should move command registration/acknowledgement/progress wiring, especially current `@sdl/pi/commands/ack` imports in CCC cmux command modules, into `@sdl/ccc-pi`.

Context vocabulary was updated in `ts/packages/ccc/CONTEXT.md` and `ts/packages/hosts/pi/CONTEXT.md` to record the planned `CCC Pi adapter` term and target dependency direction.

## Objective Impact

This sharpens Phase 2 Step 5 from a vague `ccc` clean-consumer conversion into a concrete package boundary: CCC remains a Pi-free highest-fan-out consumer/orchestration capability, while `ccc-pi` is the host presentation adapter that crosses into Pi. The existing `@sdl/ccc` → `@sdl/pi` edge remains real debt until the adapter extraction removes it; it should not be normalized as an allowed long-term capability-to-host dependency.

No completion status changes yet. Step 5 remains `[~]` until the adapter exists, current Pi imports are moved out of `@sdl/ccc`, and the graph guard/debt policy reflects the new invariant.

## Follow-Ups

- Implement the first `@sdl/ccc-pi` slice by moving CCC command registration/ack/progress wiring out of `@sdl/ccc`.
- Add or curate `@sdl/ccc/api` as the Pi-free orchestration interface consumed by `@sdl/ccc-pi`.
- Update package-tier/guard policy so `@sdl/ccc-pi` may import both `@sdl/ccc` and `@sdl/pi`, while direct `@sdl/ccc` → `@sdl/pi` imports are treated as migration debt and eventually forbidden.
