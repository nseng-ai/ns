# Roaster Surface Inventory

## Summary

The initial Roaster capability inventory is complete. Current Roaster is a standalone TypeScript package at `ts/packages/roaster` with package root export `.` mapped to `src/index.ts`, secondary export `./skill-reviews`, and a public `roaster` binary mapped to `src/cli.ts`. There is not yet an `./api` export and repo-local source search found no in-process consumers importing `@sdl/roaster` outside the package, apart from workspace/package metadata and a TypeScript style guard allowlist.

Current standalone command surfaces in `src/cli.ts` are:

- `roaster review list` / `roaster review ls`: list catalog entries from `.sdl/reviews`, with `--applicable`, `--ci`, `--base-ref`, and human/JSON rendering.
- `roaster review run <key>`: load one review definition, resolve project config/model profile, load local diff, run the review runner, emit a review-run result, and write a Branch Memory review log.
- `roaster review log [key]`: list Branch Memory review-log entries for the current branch, optionally filtered by review key.
- `roaster roast list`: list generated review-skill entries such as `skill:roast-thermonuclear-review`, backed by the review catalog.
- Hidden `roaster exec record-findings`: record same-session structured findings into the review-run envelope/log flow.
- Hidden raw `roaster exec publish-findings`: publish inline and summary findings for a PR from a run envelope on stdin; this is the explicit GitHub write boundary and remains raw-command-shaped.

The review catalog is repo-local Markdown under `.sdl/reviews/<key>.md`; current keys are `dignified-python-tripwire`, `dry-but-not-too-dry`, `duplicative-abstractions-tripwire`, `improve-codebase-architecture`, `sdl-typescript-style-tripwire`, and `thermonuclear-review`. The definition format uses YAML frontmatter (`description`, `model_profile`, optional `local_only`, `applies_to`) plus review instructions. This format and catalog location are compatibility-sensitive and should not change in this Objective.

Roaster's domain/runtime seams are already gateway-oriented: `RoasterRuntime` carries run scope, Git/local diff, review catalog, review log, GitHub publication, review runner, stdin, and stderr. Real adapters live under `src/gateways/`; in-memory/fake coverage exists in tests. `operations/review-run.ts` owns the core review execution flow; `operations/cli-operations.ts` owns command request/result schemas and rendering; `findings-publication.ts`, `inline-publication.ts`, `findings-comment.ts`, and `inline-commentability.ts` own publication/comment logic. The current package root export leaks a broad mix of CLI, real context, prompt assembly, fake/real review runner gateway types, domain models, review-run operation, failure type, and skill-review helpers.

Repo-local public call sites still teach or depend on the standalone binary:

- `.github/workflows/roaster.yml` invokes `pnpm --dir ts exec roaster review list`, `roaster review run`, and `roaster exec publish-findings`.
- `just install-roaster` installs a local PATH shim for `roaster`.
- Public Roaster skills (`skills/dignified-python-tripwire`, `skills/duplicative-abstractions-tripwire`, `skills/roast-dry-but-not-too-dry`, `skills/roast-improve-codebase-architecture`, `skills/roast-thermonuclear-review`, and `skills/sdl-typescript-style-tripwire`) instruct users to run `roaster review run ...`, then optionally `roaster exec record-findings` / `publish-findings`; most also name the Pi isolated runner surface `roaster:run:<key>`.
- `docs/retros/cli-surface-conformance-audit.md` and ADR 0015 classify `roaster exec publish-findings` as a raw-command conformance exception; `docs/roaster-pierre-diffs.md` and ADR 0007 document the `@pierre/diffs` parser boundary; `CONTEXT-MAP.md` and `ts/packages/roaster/CONTEXT.md` document Roaster vocabulary and current package identity.

Storage compatibility constraints are explicit in code and tests: review logs use Branch Memory namespace `roaster` and keys under `reviews/<review-key>/...`; summary comments use markers like `<!-- roaster:<review-key> -->`; inline comments use `<!-- roaster-inline:<review-key>:... -->`; existing PR-preview and PR-address code filters or recognizes these markers. Publication is guarded by the Roaster GitHub gateway and tested with fake-backed scenario/unit coverage; no live GitHub publication was performed for this inventory.

## Objective Impact

The first roadmap row is complete and materially narrows the next implementation choices:

- A broad `@sdl/roaster` root is already exposed, but no repo-local in-process consumer currently requires it. The initial `@sdl/roaster/api` should therefore be narrow and additive, driven by preserving future capability boundaries rather than migrating existing consumers.
- The strongest compatibility pressure for retaining the standalone `roaster` binary is repo-local workflow/skill/shim usage, not TypeScript imports. Hard cutover should wait until SDL command-face parity covers CI and public skill workflows.
- Existing SDL extension mechanics should be sufficient for the first command-face proof: other packages already use `sdl-sdk` / `@sdl/capability-kit`, while Roaster can adapt its existing `RoasterRuntime` gateways from SDL context without expanding the public SDK.
- Low-risk read/list commands are the best next migration target because `review list`, `review ls`, `review log`, and `roast list` exercise catalog/log discovery and rendering without invoking model-backed review execution or GitHub publication.
- `publish-findings` should remain a steer-first decision point: it is write-capable, currently raw-command-shaped, referenced by CI/skills, and already tracked as a CLI conformance exception.

## Follow-Ups

- Add a curated `@sdl/roaster/api` export instead of promoting broad root exports as the Capability API. Initial candidates are stable request/result/domain contracts and gateway-injected operation entrypoints needed by SDL command adapters; keep CLI rendering, prompt resources, and private adapters out.
- Prove SDL command-face discovery and selected command loading for Roaster using the existing grouped-command/extension system, starting with side-effect-light read/list operations.
- Preserve standalone `roaster` binary, CI workflow invocations, and public skill instructions until SDL parity exists; then classify each as migrated, removed, or intentionally retained.
- Keep Branch Memory namespace/key semantics and GitHub comment markers unchanged while migrating command faces.
- Treat `roaster exec publish-findings` migration/disposition as a later guarded slice with fake-backed tests and no live GitHub write validation unless explicitly confirmed.
