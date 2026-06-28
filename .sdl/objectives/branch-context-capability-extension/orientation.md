**Direction: Branch Context is becoming a clean above-SDK Capability with no `@sdl/pi` dependency.**

Getting to: `@sdl/branch-context/api` owns branch-context domain/API behavior; Pi/CCC presentation code owns concrete slash-command surfaces such as `/sdl:branch-context:impl-attached-plan` and launch-command formatting.

What you see now — mid-cleanup, do not copy: `@sdl/branch-context` still declares `@sdl/pi` and re-exports Pi's implementation command name/formatter only to build a slash command.

Avoid: new `@sdl/branch-context` imports from `@sdl/pi/*`; duplicating Pi command names inside Branch Context; re-opening saved-plan or Branch Memory compatibility decisions.

Active slice: see this objective's roadmap.md.
