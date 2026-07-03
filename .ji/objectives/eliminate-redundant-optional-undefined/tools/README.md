# Objective Metric Tooling

Temporary Objective-owned tooling for measuring the `eliminate-redundant-optional-undefined` scorecard.

## Command

```sh
node .ji/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs [scope ...]
```

Scopes default to `ts`. Pass one or more files/directories to measure a PR slice, for example:

```sh
node .ji/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs ts/packages/capabilities/branch-context
node .ji/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs --json ts/packages/capabilities/branch-context
```

## Metrics

The tool reports these Objective metrics:

1. **Raw optional-undefined property count**: TypeScript AST property signatures/declarations with a `?` token whose type includes an explicit `undefined` union, such as `foo?: string | undefined`. This is net remaining debt; typed explicit-undefined contracts are excluded.
2. **Typed explicit-undefined contract count**: optional properties typed with `ExplicitUndefined<Reason, T>`.
3. **Legacy preserve marker count**: retired marker comments still present in TypeScript sources. These are stale migration artifacts, not exclusions.
4. **Undefined-normalization/check count**: TypeScript AST binary expressions comparing a value with `undefined` using `===` or `!==`, including conditional omission builders and temporary normalization code.

## Explicit undefined contracts

Permanent support for explicit present-key `undefined` is encoded in the type system with `ExplicitUndefined<Reason, T>` from `@ji/core/primitives`:

```ts
import type { ExplicitUndefined } from "@ji/core/primitives";

readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
readonly env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
readonly stderr?: ExplicitUndefined<"null-tolerant-input", string | null>;
commands?: ExplicitUndefined<"overload-selector", never>;
```

Allowed reasons are:

- `"abort-signal"` — cancellation signal seams where present `undefined` is a loose pass-through boundary.
- `"di-seam"` — dependency-injection seams where explicit `undefined` intentionally selects the default collaborator.
- `"env-map"` — `process.env`/environment maps whose values naturally include `undefined`.
- `"external-mirror"` — schema or wire-data mirrors whose optionality comes from data outside SDL.
- `"key-event"` — terminal key-event payload fields mirroring upstream event shapes.
- `"null-tolerant-input"` — tolerant input fields that accept `null` and `undefined` interchangeably.
- `"overload-selector"` — overload/input selectors where explicit `undefined` is part of the authoring contract.
- `"public-api-compatibility"` — public SDK/kernel API fields where explicit-`undefined` assignability is a compatibility contract.

The old marker-comment convention is retired. Do not add new marker comments; migrate any remaining legacy marker to a typed `ExplicitUndefined<Reason, T>` contract. If a specific field needs extra rationale, add an ordinary domain comment without the retired marker string.

## Intended workflow

For a cleanup slice:

1. Run the tool repo-wide (`ts`) and on the intended local scope before editing, then save the Markdown table/counts.
2. Make the semantic cleanup.
3. Run both repo-wide and scoped commands again after editing.
4. Put both repo-wide and scoped before/after counts, with exact scopes, in the Objective update and PR description. Repo-wide counts are mandatory for every kept cleanup update, even when the diff is intentionally narrow.
5. Add caveats for preserved/deferred candidates or temporary normalization checks that make the second metric rise.

## Caveats

This is raw Objective scorecard input, not a semantic classifier. Review notes still need to explain which candidates were removed, preserved, or deferred and why. SDL is private/unreleased, so gateway/context/API-shaped declarations are not automatically preserved as public API; treat them as candidates unless they mirror external inputs, compatibility surfaces, dependency bags, environment/process maps, signals, or other explicitly loose boundaries.

The implementation intentionally stays local to the Objective. If multiple Objectives need similar measurement hooks, consider graduating the useful parts into tested SDL CLI support.
