# ADR 0007: Roaster Shared Diff Parser

## Status

Accepted

## Context

The TypeScript roaster package originally carried two hand-written diff parsers:

- `diff-parsing.ts` parsed full local `git diff` output into roaster's `DiffFile` DTOs.
- `inline-commentability.ts` parsed GitHub REST per-file `patch` hunks to decide whether findings could be posted as inline comments.

Those parsers duplicated a domain that roaster does not need to own. The published `@pierre/diffs` package already provides Git patch parsing and hunk geometry. A prototype replaced roaster's parser logic with Pierre and showed that keeping Pierre semantics produces a substantially smaller adapter than trying to preserve every historical roaster edge case.

## Decision

Use the published npm package `@pierre/diffs` as roaster's shared diff parser.

Roaster imports `parsePatchFiles` and parser metadata types from the package root. Roaster does not copy Pierre source, deep-import private Pierre paths, or depend on a local Pierre checkout.

Roaster keeps its own public DTOs and review workflow contracts, but delegates parser semantics to Pierre:

- `parseUnifiedDiff` maps Pierre `FileDiffMetadata` into `DiffFile`.
- `commentableRightSideLines` synthesizes a minimal file diff around GitHub REST patch hunks, then maps Pierre `Hunk` ranges into right-side line numbers.
- Local git diff invocation forces canonical `a/` / `b/` prefixes with Git `-c` options instead of adding a broad patch normalizer to roaster.

The simplification standard is explicit: prefer Pierre defaults over reimplementing raw patch parsing in roaster. Current accepted semantic changes include:

- copy diffs surface through Pierre's rename model, so roaster reports them as `renamed` rather than preserving `copied`;
- octal-escaped Git quoted paths remain in Pierre's path representation rather than being decoded by roaster;
- malformed or unsupported full diff text yields no parsed files rather than a synthetic empty-path modified file;
- inline commentability trusts Pierre hunk range geometry instead of reparsing hunk body lines.

## Consequences

Roaster's parser code is much smaller and easier to audit. The package now has one parser dependency for both full local diffs and GitHub inline-commentability hunk parsing.

Roaster's `DiffChangeKind` still includes `copied` for DTO compatibility, but the Pierre-backed local parser does not currently produce it. Future code should not add raw copy detection unless a concrete user-facing requirement justifies making the adapter more complex.

The published `@pierre/diffs` root export brings rendering/highlighting-related transitive dependencies, including Shiki-related packages and React peer resolution in the workspace. That weight is accepted for now because the alternative is copying or deep-importing parser internals. If startup or install weight becomes unacceptable, revisit the package boundary with Pierre rather than rebuilding roaster's parser.

Roaster-owned local diffs now rely on canonical prefix Git arguments:

```text
git -c diff.noprefix=false -c diff.mnemonicPrefix=false -c diff.srcPrefix=a/ -c diff.dstPrefix=b/ diff --no-ext-diff origin/<base>...HEAD
```

Direct `parseUnifiedDiff` callers should pass normal Git-format diffs. Roaster does not promise to normalize arbitrary noprefix or mnemonic-prefix patch text.

## Rejected Alternatives

- **Keep the hand-written parsers:** preserves exact old behavior but keeps roaster responsible for Git patch grammar, hunk geometry, quoted paths, copy/rename metadata, and GitHub patch quirks.
- **Use Pierre but preserve every old edge semantic:** requires raw metadata checks, path decoding, fallback synthetic files, and patch normalization that recreate much of the parser complexity this change is meant to delete.
- **Port Hunk-style patch normalization into roaster:** robust but too broad for roaster's needs. Roaster controls its own `git diff` invocation and can force canonical prefixes there.
- **Deep-import Pierre parser internals:** might avoid root-export dependency weight but couples roaster to private package layout and unpublished API stability.
- **Copy Pierre parser source into ASDL:** creates a forked parser maintenance burden and violates the shared-parser goal.
- **Add a user-facing parser selector or escape hatch:** increases command surface without a current product requirement. This is an internal implementation choice.
