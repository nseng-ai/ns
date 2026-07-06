# Objective Metric Tooling

Temporary Objective-owned tooling for measuring the `eliminate-redundant-optional-undefined` scorecard.

## Command

```sh
node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs [scope ...]
```

Scopes default to `ts`. Pass one or more files/directories to measure a PR slice, for example:

```sh
node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs ts/packages/capabilities/branch-context
node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs --json ts/packages/capabilities/branch-context
```

## Metrics

The tool reports these Objective metrics:

1. **Raw optional-undefined property count**: TypeScript AST property signatures/declarations with a `?` token whose type includes an explicit `undefined` union, such as `foo?: string | undefined`. This raw AST match count is kept unchanged for historical comparability.
2. **Classified preserve count**: raw optional-undefined matches covered by explicit Objective metadata in `classified-preserves.json`.
3. **Actionable raw optional-undefined debt**: the raw optional-undefined property count minus metadata-matched classified preserves. This is the primary next-work signal when current preserves are intentional discriminants.
4. **Typed explicit-undefined contract count**: optional properties typed with `ExplicitUndefined<Reason, T>`.
5. **Legacy preserve marker count**: retired marker comments still present in TypeScript sources. These are stale migration artifacts, not exclusions.
6. **Undefined-normalization/check count**: TypeScript AST binary expressions comparing a value with `undefined` using `===` or `!==`, including conditional omission builders and temporary normalization code.

## Classified preserve metadata

Current intentional raw optional-undefined preserves are recorded in:

```text
.ns/objectives/eliminate-redundant-optional-undefined/tools/classified-preserves.json
```

Each entry names the source path, property, preserve kind, declaration text to match, and rationale. The measurement tool matches preserve metadata against actual raw AST matches by path, property, and declaration text. Metadata that no longer matches appears in the report as stale preserve metadata so a future runner can reclassify the source.

This metadata is a reporting aid, not a hard enforcement allowlist. It does not authorize broad CI enforcement, and it does not make new optional-undefined source declarations acceptable without review.

## Explicit undefined contracts

Permanent support for explicit present-key `undefined` is encoded in the type system with `ExplicitUndefined<Reason, T>` from `@nseng-ai/foundation/primitives`:

```ts
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
readonly env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
readonly stderr?: ExplicitUndefined<"null-tolerant-input", string | null>;
commands?: ExplicitUndefined<"overload-selector", never>;
```

Allowed reasons are:

- `"abort-signal"` — cancellation signal seams where present `undefined` is a loose pass-through boundary.
- `"di-seam"` — dependency-injection seams where explicit `undefined` intentionally selects the default collaborator.
- `"env-map"` — `process.env`/environment maps whose values naturally include `undefined`.
- `"external-mirror"` — schema or wire-data mirrors whose optionality comes from data outside ns.
- `"key-event"` — terminal key-event payload fields mirroring upstream event shapes.
- `"null-tolerant-input"` — tolerant input fields that accept `null` and `undefined` interchangeably.
- `"overload-selector"` — overload/input selectors where explicit `undefined` is part of the authoring contract.
- `"public-api-compatibility"` — public SDK/kernel API fields where explicit-`undefined` assignability is a compatibility contract.

The old marker-comment convention is retired. Do not add new marker comments; migrate any remaining legacy marker to a typed `ExplicitUndefined<Reason, T>` contract. If a specific field needs extra rationale, add an ordinary domain comment without the retired marker string.

## Intended workflow

For a cleanup slice:

1. Run the tool repo-wide (`ts`) and on the intended local scope before editing, then save the Markdown table/counts.
2. Make the semantic cleanup or reporting change.
3. Run both repo-wide and scoped commands again after editing.
4. Put both repo-wide and scoped before/after counts, with exact scopes, in the Objective update and PR description. Repo-wide counts are mandatory for every kept cleanup update, even when the diff is intentionally narrow.
5. Add caveats for preserved/deferred candidates, stale preserve metadata, or temporary normalization checks that affect interpretation.

## Caveats

This is Objective scorecard input with additive metadata-backed classification. Review notes still need to explain which candidates were removed, preserved, or deferred and why. ns is private/unreleased, so gateway/context/API-shaped declarations are not automatically preserved as public API; treat them as candidates unless they mirror external inputs, compatibility surfaces, dependency bags, environment/process maps, signals, or other explicitly loose boundaries.

The implementation intentionally stays local to the Objective. If multiple Objectives need similar measurement hooks, consider graduating the useful parts into tested ns CLI support.
