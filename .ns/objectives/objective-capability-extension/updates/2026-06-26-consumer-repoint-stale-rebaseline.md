# Rebaselined stale consumer-repoint tracking

## Summary

Provenance: objective-refresh basis target=0cfc5534dc644ae6e0732dce090f4de67b02538d from=e1e34b0dada4dcb056081574ec987784714291e6

A refresh against current checkout ground truth found that the Objective record overstated the consumer-repoint slice as complete. The durable row now reflects the actual state: `sdlcc` is fully repointed to `@sdl/objective/api`, while `ccc` is only partially repointed because it still imports the Pi Objective selection-context adapter.

Verification evidence:

```bash
rg "@sdl/pi/objectives" ts/packages
```

Current matches:

- `ts/packages/ccc/src/cmux/sidebar.ts` imports `objectiveSelectionContextFromCommandContext` from `@sdl/pi/objectives/selection`.
- `ts/packages/ccc/src/objective-stack-impl.ts` imports `objectiveSelectionContextFromCommandContext` from `@sdl/pi/objectives/selection`.

Additional boundary checks:

```bash
rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json
rg "@sdl/pi" ts/packages/hosts/sdlcc ts/packages/hosts/sdlcc/package.json
rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json
```

Results: Objective has no `@sdl/pi` import or manifest dependency; `sdlcc` has no `@sdl/pi` import or manifest dependency; Pi still imports/declares `@sdl/ccc`, so the Pi→CCC cycle-break row remains open.

## Objective Impact

- The consumer-repoint roadmap row moves from complete to in-progress (`[~]`) instead of claiming the stale `@sdl/pi/objectives` grep is clean.
- The Objective assumptions now distinguish the verified `sdlcc` direct-consumer path from the remaining `ccc` compatibility edge.
- The Objective remains open; no closure marker was created, and the parked acyclicity guard/context documentation remain parked until the real graph is acyclic.

## Follow-Ups

- Finish the consumer-repoint slice by removing the two `ccc` imports from `@sdl/pi/objectives/selection`, likely by moving or recreating the command-context adapter at a non-Pi-objectives boundary.
- Then rerun `rg "@sdl/pi/objectives" ts/packages` and relevant `@sdl/ccc`/`@sdl/pi`/TypeScript validation before recording completion.
- Keep the Pi→CCC cycle-break as a separate high-risk slice after the consumer-repoint gate is genuinely clean.
