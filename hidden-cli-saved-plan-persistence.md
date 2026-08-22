# Plan: Replace the Pi Saved Plan tool with a hidden file-input CLI

## Goal and user-visible outcome

Replace Pi's permanently model-visible `write_saved_plan_file` tool with an ordinary conversational planning turn that uses generic tools and a hidden deterministic CLI.

The final workflow is:

```text
final reviewed Markdown
→ generic write to a unique temporary file
→ enriched-plan exec save --content-file <path> --format json
→ immutable timestamped Saved Plan
→ durable latest resolution from the Local Plan Store
```

After this change:

- `/ns:plan:save` and `/ns:plan:grill-and-save` still let the active LM determine the intended final plan from the conversation.
- The LM transports the exact plan through a temporary file and invokes the hidden Plans CLI.
- Pi no longer registers a purpose-built save tool.
- Saved-Plan Selection no longer reads Pi tool results or Saved Plan session evidence.
- A fresh session, context compaction, and a non-Pi consumer all resolve the same latest Saved Plan from durable Local Plan Store filenames.
- Saving remains separate from Branch Context creation and implementation.

## Provenance and scope

Planning baseline:

- Branch: `master`
- Commit: `b48e973c4fa84755998c328026e4cfe83d966343`
- Date: `2026-08-22 -0500`

Current-state anchors to revalidate before editing:

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/saved-plan-commands.ts` registers `write_saved_plan_file` and sends `/ns:plan:save` prompts.
- `ts/packages/incubating/extensions/plans/src/saved-plan-selection.ts` recognizes that tool's successful session results and prefers them before the mtime-based latest fallback.
- `ts/packages/incubating/extensions/plans/src/cli.ts` exposes `list` and hidden `exec resolve`, but no save command.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/core/impl-plan.ts` calls `prepareLatestSessionSavedPlan` directly.
- `ts/packages/incubating/extensions/branch-context/src/core/plan-preparation.ts` consumes `ValidatedSessionSavedPlan` and its optional session-derived summary.

In scope:

- The Plans domain, Local Plan Store adapter, hidden CLI, package API, tests, and context vocabulary.
- Pi Branch Context save prompts, command registration, Saved-Plan Selection, tests, and documentation.
- Herdr and Branch Context consumers that currently depend on Saved Plan session evidence.
- Removal of Saved Plan summary metadata that has no durable representation.

Out of scope:

- Branch Context output session artifacts used to resume an already-created implementation branch. Those artifacts describe Branch Context, not Saved Plan selection, and must remain.
- Branch Memory storage and Attached Plan semantics.
- Branch creation provider behavior, Graphite behavior, and implementation-session launch behavior.
- A general Clinkr whole-payload or arbitrary-stdin facility.
- Migration or renaming of existing Local Plan Store files.

## Non-negotiable design decisions

### Hidden command and exact-content transport

Restore this hidden command:

```text
enriched-plan exec save --content-file <path> [--format json]
```

`--content-file` is the only Markdown input. Do not add `--stdin`, inline Markdown, or whole-payload JSON. Resolve a relative content path against the command `cwd`; accept an absolute path directly.

The command reads but never deletes the source file. The caller owns cleanup. The command accepts no caller-provided slug and no summary option.

The command must:

1. Resolve the repository identity and current named Source Branch.
2. Require the content path to identify a regular, non-symlink file. Reject a symlink at the supplied path. Preserve existing trusted ancestor-path conventions rather than inventing a broad ancestor-symlink ban unless current gateway policy already requires one.
3. Read bytes, reject an empty or whitespace-only plan, and decode UTF-8 with fatal validation.
4. Preserve the original bytes exactly in the Saved Plan, including line endings and a UTF-8 BOM if one exists.
5. Derive the filename slug and local timestamp.
6. Publish a new immutable Source Branch Plan File without overwrite.
7. Return a typed Clinkr success envelope only after publication completes.

The success data must include at least the absolute file path, filename, semantic slug, local timestamp, sequence, repository evidence, Source Branch, and encoded branch key. Saving must not create a branch or write Branch Memory.

### Filename contract

Every successful save creates a new file with this exact grammar:

```text
<slug>--YY-MM-DDTHH-mm-ss--<sequence>.md
```

Example:

```text
simplify-plan-save--26-08-22T14-31-09--42.md
```

Rules:

- The timestamp uses the machine's local wall-clock timezone at save time.
- The timestamp does not include a UTC offset.
- The timestamp fields use fixed-width decimal values and valid local date/time ranges.
- The sequence is a canonical positive base-10 integer with no leading zeroes.
- The sequence is scoped to one repository, Source Branch, and exact timestamp second.
- Under a branch-directory save lock, allocate one plus the greatest sequence already present for the exact timestamp. Use `1` when none exists.
- If publication unexpectedly reports an existing target, rescan and retry allocation while still respecting cancellation and a bounded retry policy.
- The local timestamp tuple is the primary latest-order key. The numeric sequence is the tie-break for one timestamp second.
- Do not use lexical filename ordering for the sequence because `10` must sort after `9`.
- Do not use mtime to select new-format Saved Plans.

The user explicitly accepts that a local clock rollback, timezone change, or daylight-saving fallback can make implicit latest selection inaccurate. Document this limitation. Do not add a latest pointer, monotonic global sequence, UTC timestamp, or journal to remove the accepted edge case.

### Slug derivation

Derive the semantic slug deterministically from the first ATX H1 outside fenced code blocks. A valid heading begins with one `#` followed by whitespace. Ignore an optional closing run of `#` characters.

Normalize the heading by:

1. Using link labels instead of destinations.
2. Removing inline code delimiters and HTML tags.
3. Applying Unicode normalization before conversion to lowercase ASCII tokens.
4. Treating punctuation and non-alphanumeric runs as token separators.
5. Removing empty tokens.
6. Taking at most the first seven tokens.

Use the normalized heading only when it produces at least three tokens and passes the package's Saved Plan slug validator. If it does not, use:

```text
saved-plan-<first-12-lowercase-hex-characters-of-SHA-256-exact-input-bytes>
```

Hash the original bytes, including a BOM and line endings. Remove the current nested Codex slug-model dependency from the save workflow.

### Publication and concurrency

Add an explicit storage operation that publishes complete bytes exclusively. The real Node adapter must not expose a partially written final `.md` file and must not overwrite an existing file.

Use a branch-directory lock to serialize timestamp/sequence allocation and publication. Define the lock location as internal Local Plan Store metadata, not a Saved Plan. Keep lock acquisition, cancellation, stale-lock policy, temporary publication files, cleanup, and bounded collision retries behind the storage adapter.

Use the repository's Foundation time seams. Do not add raw production wall-clock reads. Because local timezone formatting is ambient behavior, provide an injected adapter or explicit test seam that lets default tests supply local timestamp values without process timezone mutation.

A save is complete only when the final immutable Markdown file is fully published. An interrupted save must not appear as a valid new-format Saved Plan. Internal temporary and lock artifacts must be excluded from list and resolve operations.

### Durable Saved-Plan Selection

Replace the current selection union with only:

```text
explicit validated Saved Plan path
otherwise latest timestamped Saved Plan for the current repository and Source Branch
```

Parse new filenames structurally. Compare local timestamp components, then numeric sequence.

Legacy `<slug>.md` files:

- Continue to show them in `enriched-plan list` with format metadata that distinguishes `legacy` from `timestamped`.
- Continue to permit them through an explicit validated path.
- Exclude them from implicit latest selection, even when no timestamped Saved Plan exists.
- When only legacy files exist, implicit resolution returns the normal no-new-format-plan negative result and tells the caller to pass an explicit path or save again.

Unify explicit Saved Plan validation around one Plans module operation. It must normalize `@` and home-relative syntax as currently documented, require an absolute `.md` regular file after normalization, and enforce lexical plus realpath containment in the current repository and Source Branch Local Plan Store directory. It must recognize both legacy and timestamped filename forms. For timestamped files, expose the semantic slug separately from the complete filename stem. Do not apply new slug derivation rules retroactively to an explicitly selected legacy filename beyond the existing safe filename/path requirements needed to read it.

`enriched-plan list` should order timestamped files by parsed timestamp and numeric sequence, newest first. List legacy files after timestamped files, with deterministic legacy ordering retained for inspection only.

### Pi planning workflow

Keep `/ns:plan:save` and `/ns:plan:grill-and-save` as ordinary agent turns. Replace all instructions to call `write_saved_plan_file` with this finalization procedure:

1. Produce and review the complete self-contained Markdown plan.
2. Run a command equivalent to `mktemp "${TMPDIR:-/tmp}/ns-saved-plan.XXXXXX"` and capture the returned unique path.
3. Use the generic write tool to write the exact final Markdown to that path.
4. Invoke `enriched-plan exec save --content-file '<exact path>' --format json`, with safe shell quoting.
5. Treat the save as successful only when the process exits zero and the parsed Clinkr envelope has success status and complete evidence.
6. After success, run `rm -- '<exact path>'`.
7. If cleanup fails, report the warning without invalidating the committed Saved Plan.
8. If save fails, retain and report the temporary path for diagnosis or retry.
9. Report the Saved Plan evidence and stop.

The planning turn must not create Branch Context, start implementation, or write Branch Memory.

## Implementation slices

### 1. Deepen the Plans persistence module

Refactor `saved-plan-file.ts`, `plan-store-gateway.ts`, and the slug helpers around byte-preserving save, parsed timestamped filename evidence, local-time injection, lock-backed allocation, exclusive atomic publication, and explicit/implicit resolution.

Define one result type that replaces `ValidatedSessionSavedPlan` for all durable consumers. It should carry repository and Source Branch directory evidence, semantic slug, filename/path, parsed timestamp/sequence for new files, and format discrimination. It must not carry `summary`.

Update `@nseng-ai/plans/api` and package-root compatibility exports deliberately. Keep low-level filesystem mechanics private.

Checkpoint strategy: this is the first coherent checkpoint after focused Plans tests pass. Use `ns flow cp` only on a feature branch and only when the package is not knowingly broken.

### 2. Restore the hidden CLI save command

Add the schema, handler, result schema, human rendering, and machine error contracts in `src/cli.ts`. Keep `exec` hidden. Use `--content-file` only. Follow the ns CLI design gates for standard Clinkr envelopes, `--json-schema`, stream behavior, and scenario coverage.

Test exact byte preservation, invalid UTF-8, whitespace-only input, relative and absolute paths, symlink rejection, detached HEAD, slug fallback, timestamp parsing, sequence allocation above 9, concurrent/collision retry behavior, publication failure, and JSON evidence.

### 3. Remove Saved Plan session selection and migrate consumers

Delete `WRITE_SAVED_PLAN_FILE_TOOL_NAME`, session-entry schemas, session candidate validation, `prepareLatestSessionSavedPlan`, and the `session` selection variant. Remove `sessionEntries` and source-branch-mismatch options used only for Saved Plan tool evidence.

Migrate:

- Pi Branch Context `from-plan-commands.ts` to explicit-or-durable-latest selection.
- Herdr `impl-plan.ts` to durable latest preparation.
- Branch Context `plan-preparation.ts` from `ValidatedSessionSavedPlan` to the new durable result type.

Remove Saved Plan summary propagation from these paths. Preserve Branch Context session artifacts and the existing resumption path for an already-created Branch Context.

### 4. Replace the Pi save tool with prompt-driven CLI use

Remove the custom tool registration, schema, rendering, progress timers, nested slug-model call, tool tests, and model prompt guidelines from `saved-plan-commands.ts`. Rename registration helpers so they describe commands rather than commands-and-tools.

Update both the project Prompt Point `.ns/prompts/branch-context.plans-write.md` and the built-in fallback prompt at `src/prompts/plans-write-default.md`. Keep them behaviorally aligned and test the finalization instructions.

Retain Grill activation and all plan-quality requirements. Saving still occurs only after the plan is complete and reviewed.

### 5. Synchronize documentation and vocabulary

Update:

- `ts/packages/incubating/extensions/plans/CONTEXT.md`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/CONTEXT.md`
- `docs/pi/branch-context-workflow.md`
- package READMEs and parity metadata where affected

Define Saved-Plan Selection as explicit validated path or latest timestamped Source Branch Plan File. Record the accepted local-clock rollback limitation. State that legacy files require explicit selection.

Also fix the current workflow documentation path from `.ns/prompts/plans-write.md` to `.ns/prompts/branch-context.plans-write.md` if that drift remains.

## Validation guidance

Run focused package tests while each slice is active. Before completion, run the repository TypeScript gates required by `ts/AGENTS.md`, including:

```text
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-sanity
just ts-test-typescript-style-guard
```

Run `just dprint-check` for changed Markdown and configuration. If formatting fails, use the documented autofix commands and rerun the checks.

Inspect tests rather than trusting green output. Confirm that no test still reconstructs Saved Plan state from `write_saved_plan_file` tool results. Confirm that Branch Context resumption tests still cover their separate session artifacts.

## Risks, assumptions, and STOP conditions

Accepted risk:

- Local wall-clock rollback or daylight-saving fallback can select the wrong implicit latest file. This is an explicit product tradeoff. Do not silently replace it with UTC or a durable latest pointer.

STOP and ask before continuing if:

- The current Clinkr command framework cannot support a command-owned `--content-file` option without introducing the previously rejected general whole-payload seam.
- The real filesystem adapter cannot provide exclusive complete-file publication without a platform-specific behavior that changes supported environments.
- A retained consumer requires durable Saved Plan summary metadata for behavior rather than presentation. The selected design deliberately stores Markdown only.
- Removing Saved Plan session evidence would also remove or alter Branch Context resumption evidence. These are separate contracts.

## Subagent orchestration and closeout

A focused editing subagent can own the Plans persistence and CLI slice because it has a clear package boundary. Migrate Pi, Herdr, and Branch Context consumers only after the new durable result type is stable. If editing subagents share one worktree, dispatch them sequentially and review each diff and focused validation result before the next task.

After implementation and focused validation pass, run exactly one in-session TypeScript style review subagent over the complete changed diff. Inspect its final status and findings. Fix only local, mechanical, low-risk issues, rerun focused checks after fixes, and report judgment calls instead of guessing.

At closeout, compare changed files to this scope, rerun the declared gates, inspect machine schemas and prompt text, and verify the complete journeys: save, revise-and-save, explicit legacy selection, implicit latest, fresh-session implementation, Branch Context creation, and Herdr implementation.