**Direction: Branch Context is becoming a clean above-SDK Capability with no `@sdl/pi` dependency.**

Getting to: `@sdl/branch-context/api` owns branch-context domain/API behavior; Pi/CCC presentation code owns concrete slash-command surfaces such as `/sdl:branch-context:impl-attached-plan` and launch-command formatting.

What you see now: the command-surface, package-edge, guard, and documentation slices have landed; this Objective is closure-ready for parent review but is not closed yet.

Avoid: new `@sdl/branch-context` imports from `@sdl/pi/*`; duplicating Pi command names inside Branch Context; re-opening saved-plan or Branch Memory compatibility decisions.

Active slice: parent should decide Objective closure separately.
