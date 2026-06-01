# Runner and Grill Boundaries Hardened

## Summary

The current branch completes the deferred runner/grill runtime portion of the unknown-boundary hardening row in `ts/packages/pi-extensions`.

- `runner-subagent/json-events.ts`: parsed JSONL events now narrow through `isJsonEvent(value: unknown)` before dispatch. The previous `event as JsonRecord & { type: string }` cast is gone, while malformed successful-JSON values still stop through the existing parser error path.
- `runner-subagent/subagent-runtime.ts`: `cloneJsonSerializable` now parses the JSON round-trip as `unknown` and requires the cloned terminal tool `parameters` schema to serialize to a JSON object before returning it. The previous `JSON.parse(raw) as TypeBoxLikeSchema` cast is gone.
- `grill-ui/inline-ui.ts`: dynamic imports from `@earendil-works/pi-tui` and `@earendil-works/pi-coding-agent`, plus the custom UI callback theme, now enter as `unknown` and pass through local normalizers/guards before use. Required TUI exports remain required; malformed optional exports are ignored so fallback rendering remains available.

Focused scan evidence found no matches for the targeted broad-cast patterns in the three source files: `event as JsonRecord`, `as TypeBoxLikeSchema`, `theme as GrillAskRenderTheme`, dynamic import casts, `JSON.parse(...) as`, `as Partial<`, or `as BrmemEntry[]`.

## Objective Impact

This completes the roadmap row "Harden untyped JSON, tool, and runtime boundaries with `unknown` plus guards or decoders." The prior CLI/process slice had already handled `land.ts`, `land-stack/pr-facts.ts`, and `worktree-status.ts`; this slice removes the remaining deferred runner/grill broad runtime casts named in that update.

Behavior for valid Pi extension inputs is preserved. The accepted malformed-boundary changes are narrower and intentional: parsed JSON values without a string event type are treated as malformed runner subagent JSONL output, terminal tool schemas whose `toJSON()` serializes to a non-object are rejected before spawn, and malformed optional grill runtime exports are omitted rather than trusted.

Validation passed with focused Bun tests for the three touched test files, `bun run --cwd ts/packages/pi-extensions check`, `bun run --cwd ts/packages/pi-extensions test`, `just ts-check`, `just ts-test`, and `just dprint-check`.

## Follow-Ups

- Continue with the remaining TypeScript style audit rows: expected failure APIs, dependency-injection/adapter ownership, and final exception capture.
- Keep the parked decision against a heavyweight schema dependency unless future boundary work shows local guards are insufficient.
