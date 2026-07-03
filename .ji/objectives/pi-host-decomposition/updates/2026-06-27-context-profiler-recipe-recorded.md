# Context Profiler Recipe Recorded

## Summary

The `context-profiler` reference extraction recipe is now recorded in repo context language. The provisional `ts/packages/pi-tools/context-profiler/` placement validated as the first Pi-tool package convention, with `@sdl/pi-context-profiler` owning its implementation, focused tests, and tool-specific parity metadata while depending on neutral `@sdl/pi/...` helper/runtime subpaths.

`ts/packages/hosts/pi/CONTEXT.md` now names the Pi-tool package boundary, the host-to-tool dependency ban, the direct discovery-adapter registration shape, and the neutral helper subpaths extracted tools may consume. `CONTEXT-MAP.md` now records the current package inventory count, the `@sdl/pi-context-profiler` planned context target, and the relationship between extracted Pi-tool packages and `@sdl/pi` neutral helpers.

## Objective Impact

This completes the third planned branch of the `context-profiler` reference extraction stack and marks the reference slice complete:

- Pi-native standalone tools may live under `ts/packages/pi-tools/<tool>/` when they are not capability mirrors and can depend on curated `@sdl/pi/...` helpers without inverting the package graph.
- The project-local `.pi/extensions/<tool>.ts` discovery adapter is the acyclic registration seam for extracted Pi-tool packages; it imports the tool package's source entrypoint directly, and `@sdl/pi` must not import the extracted package.
- Tool packages own their source, focused tests, and tool-specific parity metadata; `@sdl/pi` keeps only neutral helper/runtime surfaces such as command acknowledgement, model/LM-JSON helpers, parity helpers, terminal layout/presentation helpers, and runtime types.
- The next roadmap work is no longer to prove the `context-profiler` convention, but to apply or revise that proven recipe for `grill` and `thermo-council`.

## Follow-Ups

- Apply the recorded recipe to `grill` first unless a fresh inventory shows `thermo-council` is a safer follow-on.
- Keep capability mirror thinning separate from Pi-tool package extraction; Handoff, Branch Context, PR feedback, Objective, and Plans-adjacent surfaces still need capability/API disposition rather than Pi-tool treatment.
- When extracting later Pi-native tools, keep parity registration acyclic and preserve user-visible command/tool behavior with focused tests before recording additional recipe changes.
