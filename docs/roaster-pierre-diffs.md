# Roaster and `@pierre/diffs`

Roaster uses the published npm package `@pierre/diffs` as its shared diff parser. This document records the integration boundary: which Pierre APIs roaster uses, which Pierre APIs it deliberately does not use, and which semantics roaster delegates to Pierre instead of preserving locally.

See also [ADR 0007](adr/0007-roaster-shared-diff-parser.md).

## Package boundary

Roaster depends on `@pierre/diffs` from npm in `ts/packages/roaster/package.json`. Do not replace this with a local `file:` dependency, workspace link, or deep import into a Pierre checkout.

Roaster imports only from the package root:

```ts
import { parsePatchFiles, type FileDiffMetadata, type Hunk } from "@pierre/diffs";
```

The root export currently pulls in rendering/highlighting-related transitive dependencies such as Shiki and React peer resolutions. That dependency weight is a known consequence of using the published package root rather than copying parser source or deep-importing private internals.

## APIs roaster uses

### `parsePatchFiles(data, cacheKeyPrefix?)`

Roaster calls `parsePatchFiles` for both full local diffs and GitHub REST per-file patch snippets.

For full diffs, `parseUnifiedDiff(diffText)` in `ts/packages/roaster/src/diff-parsing.ts` calls `parsePatchFiles(diffText, "roaster-diff")` and flattens each returned `ParsedPatch.files` entry.

For GitHub REST per-file `patch` strings, `commentableRightSideLines(patch)` in `ts/packages/roaster/src/inline-commentability.ts` first synthesizes a minimal file diff:

```text
diff --git a/__roaster_inline__.patch b/__roaster_inline__.patch
--- a/__roaster_inline__.patch
+++ b/__roaster_inline__.patch
<github patch body>
```

It then calls `parsePatchFiles(..., "roaster-inline")` and reads the resulting hunks.

Roaster intentionally does not pass `throwOnError: true`. Parse failures at these boundaries are not fatal:

- unsupported or malformed full diff text becomes no parsed files;
- malformed GitHub patch snippets produce no inline-commentable lines, so findings fall back to non-inline publication.

### `FileDiffMetadata`

Roaster maps Pierre `FileDiffMetadata` into roaster's `DiffFile` DTO.

| Roaster field     | Source                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- |
| `path`            | `metadata.name`                                                                        |
| `oldPath`         | `metadata.prevName` only when Pierre reports a rename                                  |
| `changeKind`      | `metadata.type` mapped to roaster's string union                                       |
| `addedLines`      | sum of `hunk.additionLines`                                                            |
| `removedLines`    | sum of `hunk.deletionLines`                                                            |
| `hunkCount`       | `metadata.hunks.length`                                                                |
| `rawText`         | roaster's per-file raw segment split, used for budgeting/reporting                     |
| `byteSize`        | `Buffer.byteLength(rawText, "utf8")`                                                   |
| `estimatedTokens` | roaster's existing code-point-count estimate over `rawText`                            |
| `isBinary`        | small roaster-owned raw text check for `Binary files ... differ` or `GIT binary patch` |

Roaster preserves its DTO type shape, but Pierre owns parser semantics.

### `Hunk`

For inline commentability, roaster uses Pierre `Hunk` geometry directly. The commentable right-side line range for a hunk is:

```ts
hunk.additionStart <= line < hunk.additionStart + hunk.additionCount
```

That includes right-side context and added lines, and excludes deleted-only lines because deleted-only lines are not present on the right side.

## Semantics roaster delegates to Pierre

Roaster does not fight to preserve historical parser edge cases when Pierre has a clear default. Current delegated semantics include:

- Git copy diffs are reported through Pierre's rename model (`rename-pure` / `rename-changed`), so roaster surfaces them as `renamed`, not `copied`.
- Git quoted paths with octal-escaped UTF-8 bytes remain in Pierre's path form, for example `spaced/\303\251 file.txt` rather than decoding to `spaced/é file.txt`.
- Unexpected non-git text produces no parsed files instead of a synthetic modified file with an empty path.
- Inline commentability trusts valid hunk header geometry from Pierre rather than recalculating line movement from raw hunk body lines.

These are accepted simplifications. Reintroduce old behavior only if a user-visible roaster requirement outweighs keeping the adapter small.

## Git diff format expectations

Pierre expects canonical Git `a/` and `b/` side prefixes. Roaster controls its own local diff command and forces those prefixes in `buildGitDiffArgs`:

```text
git -c diff.noprefix=false \
    -c diff.mnemonicPrefix=false \
    -c diff.srcPrefix=a/ \
    -c diff.dstPrefix=b/ \
    diff --no-ext-diff origin/<base>...HEAD
```

This avoids carrying a broad patch normalizer in roaster. Direct calls to `parseUnifiedDiff` should provide standard Git-format diffs if they need structured results.

## APIs deliberately not used

Roaster does not use these `@pierre/diffs` surfaces:

- Rendering components such as `File`, `FileDiff`, `CodeView`, virtualized renderers, or web components. Roaster is a CI/review CLI and needs parser metadata only.
- Syntax highlighting and theme APIs such as `getSharedHighlighter`, language/theme registration, Shiki helpers, or CSS utilities.
- Worker APIs and worker-pool rendering entrypoints. Roaster parsing is synchronous and small enough to run in process.
- `parseDiffFromFile`. Roaster receives diff text from its own git gateway and GitHub gateway; it does not need Pierre to read files.
- `processFile` / `processPatch` direct helpers. `parsePatchFiles` is the stable high-level parser boundary roaster needs.
- Hunk rendering, annotation, selection, scrolling, and interaction manager APIs. Roaster only needs hunk geometry for inline commentability.

If a future change needs one of these APIs, document why the CLI now needs rendering, highlighting, workers, or lower-level parser internals before expanding the dependency surface.

## Maintenance guidance

Prefer deleting roaster adapter code over preserving compatibility through raw patch parsing. The integration is considered healthy when `diff-parsing.ts` and `inline-commentability.ts` remain thin translations from Pierre metadata into roaster DTOs.

Before changing this integration, run at least:

```bash
pnpm --dir ts --filter @asdl/roaster run test
pnpm --dir ts run check
```

Run the full TS test suite when dependency or workspace behavior changes:

```bash
pnpm --dir ts run test
```
