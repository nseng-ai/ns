# Objective Metric Tooling

Temporary Objective-owned tooling for measuring the `eliminate-redundant-optional-undefined` scorecard.

## Command

```sh
node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs [scope ...]
```

Scopes default to `ts`. Pass one or more files/directories to measure a PR slice, for example:

```sh
node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs ts/packages/branch-context
node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs --json ts/packages/branch-context
```

## Metrics

The tool reports the two Objective metrics:

1. **Typed optional-undefined property count**: TypeScript AST property signatures/declarations with a `?` token whose type includes an explicit `undefined` union, such as `foo?: string | undefined`.
2. **Undefined-normalization/check count**: TypeScript AST binary expressions comparing a value with `undefined` using `===` or `!==`, including conditional omission builders and temporary normalization code.

## Intended workflow

For a cleanup slice:

1. Run the tool on the intended scope before editing and save the Markdown table/counts.
2. Make the semantic cleanup.
3. Run the same command again after editing.
4. Put both before/after counts and the exact scope in the PR description.
5. Add caveats for preserved/deferred candidates or temporary normalization checks that make the second metric rise.

## Caveats

This is raw Objective scorecard input, not a semantic classifier. Review notes still need to explain which candidates were removed, preserved, or deferred and why. SDL is private/unreleased, so gateway/context/API-shaped declarations are not automatically preserved as public API; treat them as candidates unless they mirror external inputs, compatibility surfaces, dependency bags, environment/process maps, signals, or other explicitly loose boundaries.

The implementation intentionally stays local to the Objective. If multiple Objectives need similar measurement hooks, consider graduating the useful parts into tested SDL CLI support.
