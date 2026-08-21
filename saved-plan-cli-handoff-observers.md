# Eliminate Three Pi Custom Tools in a Three-PR Stack

## Goal and outcome

Replace the three model-visible Pi custom tools that currently carry Saved Plan and Handoff workflow mechanics with portable `ns`/package CLI operations plus small Pi host observers, landing the work as exactly three stacked PRs with one tool eliminated per PR:

1. `write_saved_plan_file`
2. `derive_handoff_slug_from_content`
3. `handoff_self_queue_pickup`

After the stack lands:

- Saved Plan persistence is a hidden agent-facing `enriched-plan exec save` machine contract invoked through Pi's built-in `bash` tool.
- `ns handoff create` derives a semantic content slug atomically when `--slug` is omitted, while a hidden `ns handoff exec derive-slug` operation remains available for low-level agent composition and diagnostics.
- `/ns:handoff:self` observes the successful structured Handoff create result, independently verifies that exact artifact after the agent settles, and then performs Pi-native session replacement without a model-visible rendezvous tool.
- The three custom tool schemas, descriptions, prompt guidelines, renderers, registration paths, and global system-prompt weight are deleted.
- The migration is a clean break: do not retain tool aliases, resumed-call compatibility shims, or legacy `write_saved_plan_file` tool-result recognition.
- Existing safety properties remain: semantic content-derived slugs, no deterministic fallback, exclusive/no-overwrite writes, repository/branch validation, exact artifact verification, and fail-closed session replacement.

## Settled requirements

- Use exactly three PRs, one per custom tool, ordered Saved Plans → Handoff slug derivation/create → self-handoff rendezvous.
- Use a hybrid command surface:
  - hidden agent-facing primitives for Saved Plan saving and standalone Handoff slug derivation;
  - public `ns handoff create` atomically derives its slug when no explicit slug is supplied;
  - retain explicit `--slug` as a supported override for human or advanced callers.
- Make a complete compatibility break. Remove old tool registrations and old session-result recognition rather than preserving aliases or read compatibility.
- Before `/ns:handoff:self` clears context, require both:
  1. a successful structured `ns handoff create --format json` result observed during the active workflow; and
  2. independent domain verification of that exact branch/slug after `agent_settled`.
- Keep Pi-only UI, command prompting, workflow observation, and `ctx.newSession({ withSession })` in the Pi adapters. Do not move live-session behavior into the harness-independent Handoffs package or a CLI.

## Context and discovered facts

### Repository and initiative constraints

- The checkout is currently on `master`; implementation must create a feature branch before any commit. Use Graphite for the three-PR stack.
- The working tree contains an unrelated untracked `.pi/extensions/hey-nana.ts`; leave it untouched and exclude it from every PR.
- Active package-curation direction requires harness-independent domain and CLI behavior under `@nseng-ai/plans` / `@nseng-ai/handoffs`, with Pi registration and session behavior in `@nseng-ai/pi-ns-branch-context` / `@nseng-ai/pi-ns-handoffs`.
- Agent-only CLI leaves must live under hidden `exec` groups, publish real Clinkr result schemas, use the standard machine envelope, and keep JSON results on stdout.
- TypeScript changes must honor strict TS, injected gateway/time seams, shared-cache-safe tests, and curated cross-package exports.

### Current Saved Plan path

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/saved-plan-commands.ts` registers `write_saved_plan_file`. The tool validates `{content, summary?}`, derives a semantic slug, calls the portable write operation, renders progress, and returns file/repository/branch evidence.
- Portable slug derivation already exists in `ts/packages/incubating/extensions/plans/src/saved-plan-content-slug.ts` and `content-slug-derivation.ts`.
- Portable exclusive write behavior already exists in `saved-plan-file.ts` and `plan-store-gateway.ts`; it derives repository/source-branch store paths and refuses overwrite via exclusive creation.
- `ts/packages/incubating/extensions/plans/src/cli.ts` currently exposes `list` and hidden `exec resolve`, but no save command.
- `ts/packages/incubating/extensions/plans/src/saved-plan-selection.ts` recognizes session evidence only when it appears as a `toolResult` named `write_saved_plan_file`. This coupling must be replaced in the same PR or session-selected implementation workflows will regress.
- Pi supports durable custom session entries through `pi.appendEntry()`. They do not enter model context and are suitable for recording validated Saved Plan evidence without defining a custom tool.

### Current Handoff slug path

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/handoff-launch.ts` registers `derive_handoff_slug_from_content` and deduplicates it across Handoffs/Herdr adapters.
- Handoff-specific slug rules currently live incorrectly in the Pi adapter at `src/content-slug.ts`; the generic model invocation and model-policy machinery already lives in `@nseng-ai/extension-kit`.
- `ts/packages/incubating/extensions/handoffs/src/core/operations/create.ts` currently requires `slug`, reads stdin or `--file`, checks collision, and writes the artifact.
- `ns handoff create` already returns authoritative branch, slug, key, entry locator, commit, and source-file evidence. Its machine schema is the natural durable-reference source for downstream Pi workflows.
- `/ns:handoff:create`, `/ns:handoff:self`, and Herdr handoff-tab prompts currently compose content, call the slug tool, then separately invoke `ns handoff create --slug ...`.

### Current self-handoff path

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/self.ts` implements an in-memory `idle`/`starting`/`waiting` state machine.
- `handoff_self_queue_pickup` currently gates on an opaque workflow ID and target branch, independently checks the artifact, resolves the waiter, and returns `terminate: true` so the old agent turn stops before replacement.
- Safe replacement is irreducibly Pi-native: `ctx.newSession()` must run from the active command context, and post-replacement work must use the fresh `withSession` context.
- Pi exposes `tool_execution_end` with command arguments/results and `agent_settled` after retries, compaction retries, and queued continuations are finished. These events can replace the model-visible rendezvous.

## Stack shape and dependency rules

Create a Graphite stack of exactly three branches/PRs. Each PR must be independently coherent and green at its stack point.

1. **PR 1 — Move Saved Plan save to CLI and remove `write_saved_plan_file`**
2. **PR 2 — Make Handoff slugging/create portable and remove `derive_handoff_slug_from_content`**
3. **PR 3 — Observe self-handoff completion and remove `handoff_self_queue_pickup`**

PR 2 may rely on no PR 1 internals; their stack relationship is review/landing order. PR 3 deliberately builds on PR 2's atomic `ns handoff create --format json` result.

Do not defer tool cleanup into a fourth PR. Each named tool must be fully removed, including live prompts/docs/tests, in its owning PR.

## PR 1 — Replace `write_saved_plan_file`

### Command/domain implementation

1. Extend `ts/packages/incubating/extensions/plans/src/cli.ts` with hidden `enriched-plan exec save`.
2. Define Zod request/result schemas and a stable Clinkr machine envelope. The request should accept:
   - `file?: string`, defaulting to stdin;
   - `summary?: string`;
   - optional existing plan-store-root injection only if needed for established test/adapter behavior, not as a new user-facing convenience.
3. Read the complete Markdown through an injected source-reader boundary. Reuse an existing finite whole-payload/source-reader abstraction if one already fits; do not embed ad hoc shell parsing or unbounded line logic in the command.
4. Derive the slug internally with `deriveSavedPlanContentSlug()` using current repository model policy. Preserve the current content-only prompt, truncation, normalization, validation, configured `slug` operation, retry behavior, and no-fallback failure.
5. Call `writeSavedPlanFile()` with the derived slug and content. Preserve detached-HEAD rejection, repository identity, source-branch encoding, private parent creation, and exclusive no-overwrite semantics.
6. Return a typed result containing the full `SavedPlanFileEvidence` plus slug provider/model evidence and optional summary. Human output may mirror `formatSavedPlanFileEvidence()`; JSON is the authoritative observer contract.
7. Keep the operation hidden under `exec`, including from top-level human help. Add or update package/API exports only where downstream package composition requires them.

### Pi workflow and session evidence

8. Replace tool instructions in the default/point-backed `/ns:plan:save` and `/ns:plan:grill-and-save` prompts with a built-in-tool sequence:
   - write the final reviewed Markdown to a temporary file using Pi's built-in file tool;
   - invoke `enriched-plan exec save --file <path> --format json` as a standalone bash command;
   - do not choose or pass a slug;
   - stop on collision or derivation failure;
   - remove the temporary file only after a successful save if the prompt owns cleanup.
9. Add a small Pi Saved Plan workflow observer in `@nseng-ai/pi-ns-branch-context`:
   - arm it when either plan-writing slash command dispatches its planning turn;
   - inspect `tool_execution_end` only while that workflow is active;
   - accept only a successful, parseable Clinkr JSON envelope for `enriched-plan exec save` from the current workflow/cwd;
   - validate the returned evidence with the existing Saved Plan repository/branch/path/file checks before trusting it;
   - append a typed custom session entry (for example `ns:saved-plan`) carrying only validated `SavedPlanFileEvidence`;
   - clear pending observer state on success, abort/failure, session shutdown, or `agent_settled` without a valid save;
   - reject ambiguous multiple successful save results rather than silently selecting one.
10. Update `saved-plan-selection.ts` to parse the new custom entry shape and preserve the existing stale/unsafe/path-containment validation pipeline.
11. Because this is a clean break, delete `WRITE_SAVED_PLAN_FILE_TOOL_NAME`, the old tool-result schema, and all old-tool extraction logic. Old sessions containing only `write_saved_plan_file` results will no longer supply session-selected plans; explicit path/latest fallback behavior remains governed by existing callers.

### Tool removal and presentation cleanup

12. Delete `buildWriteSavedPlanFileTool`, its parameter/progress/detail types, renderers, timer/status plumbing, and `pi.registerTool(...)` registration.
13. Rename `registerSavedPlanCommandsAndTools` to command-focused terminology and update extension exports/callers.
14. Remove tool guidance from system prompt metadata and update parity notes: plan authoring now has a hidden portable CLI save primitive, while structured grill UI remains Pi-specific.

### Tests and docs

15. Add CLI/domain tests covering stdin and file input, optional summary, configured model selection, invalid model output, no fallback, detached HEAD, exclusive collision, XDG path evidence, JSON schema/envelope, and human rendering.
16. Replace `branch-context-write-tool.test.ts` with command-observer tests covering successful capture, malformed/nonzero/unrelated bash output, wrong cwd/repository/branch, unsafe path evidence, duplicate results, no-result settlement, abort/shutdown cleanup, and custom-entry persistence.
17. Update Saved Plan selection, branch-context session-artifact, attached-plan, implementation launch, surface, and parity tests for the custom entry and clean break.
18. Update:
   - `src/prompts/plans-write-default.md`;
   - `.ns/prompts/branch-context.plans-write.md`;
   - `docs/pi/branch-context-workflow.md`;
   - `docs/pi/README.md` and current conventions/follow-ups that describe the tool as live;
   - `@nseng-ai/plans` and Pi-adapter `CONTEXT.md` if authoritative vocabulary/ownership changed.
   Preserve historical ADRs and dated records as time-in-place artifacts unless they are explicitly live guidance.

## PR 2 — Replace `derive_handoff_slug_from_content`

### Move slug ownership into Handoffs

1. Move the Handoff-specific content-slug variant, normalization, generic-only-word rejection, truncation constants, and prompt helpers from `@nseng-ai/pi-ns-handoffs/src/content-slug.ts` into `@nseng-ai/handoffs`.
2. Keep model-policy resolution and model subprocess execution behind injected command/config/git dependencies. The Handoffs domain/CLI must not import Pi runtime APIs; using the neutral extension-kit model slug machinery is allowed.
3. Export only the curated slug derivation types/functions needed by Handoffs command leaves and tests through `@nseng-ai/handoffs/api` or an appropriate owned internal module. Do not expose Pi presentation types.

### Hybrid CLI surface

4. Add hidden `ns handoff exec derive-slug` with a schema-first finite result:
   - read final Markdown from `--file` or stdin;
   - derive from final content only;
   - return slug, key, provider, and model;
   - preserve no continuation-focus/deterministic fallback;
   - publish the real result envelope via the command schema.
5. Change public `ns handoff create` so `slug` is optional:
   - if `--slug` is supplied, retain current deterministic normalization and report `requestedSlug`;
   - if omitted, read the content first, derive the semantic slug internally, then prepare/check/write the artifact;
   - ensure the source is read once and the exact bytes used for derivation are the bytes stored;
   - check collision only after the final slug is known and still refuse overwrite;
   - include a discriminant such as `slugSource: "explicit" | "content-derived"` and optional slug-model evidence in the stable result schema;
   - retain branch, key, entry locator, commit, and source-file evidence needed by Pi observers and Herdr.
6. Preserve normal public help around `create`; describe `--slug` as an override rather than a required argument. Keep `exec derive-slug` hidden.

### Migrate Pi and Herdr workflows

7. Rewrite `/ns:handoff:create` to compose final Markdown and call one atomic command: `ns handoff create --branch <branch> --file <temp-or-stdin> --format json`, omitting `--slug` unless the user explicitly supplied an override.
8. Rewrite shared launch prompts used by `/ns:handoff:self` and Herdr handoff-tab similarly. The exact slug passed to their still-existing PR-2 launch/rendezvous step must come from the successful create command's structured output, not from raw focus or a separate model tool.
9. Update Herdr's launch command construction so `<returned-slug>` means the `data.slug` from `ns handoff create`. Keep its independent artifact read/verification before tab launch.
10. Remove `derive_handoff_slug_from_content` registration, `WeakSet` deduplication, registration methods from `HandoffPromptCreateIntegration`, constants, schemas, rendering/progress code, and all prompt/system guidance naming the tool.
11. Leave `handoff_self_queue_pickup` operational in this PR: it should receive the branch/slug returned by atomic create, verify the artifact, and resolve the existing workflow. Its removal belongs only to PR 3.

### Tests and docs

12. Move/adapt `handoff-content-slug.test.ts` into the Handoffs package and retain success, normalization, model-policy, generic-only rejection, truncation, timeout/retry, malformed output, and no-fallback cases.
13. Expand Handoff command scenario/unit tests for:
   - content-derived stdin and file creation;
   - explicit slug override compatibility;
   - exact-content parity between derivation and storage;
   - model failure before mutation;
   - derived-slug collision;
   - detached HEAD/source-read errors;
   - hidden `exec derive-slug`, command help, JSON schema, and envelopes.
14. Update Handoffs Pi and Herdr tests to assert no slug tool registration and atomic create instructions/result transport.
15. Update Handoff skills, `docs/pi/handoff-artifacts.md`, `docs/pi/README.md`, Herdr command documentation, parity notes/tables, and both Handoffs/Pi adapter `CONTEXT.md` files so semantic Handoff identity is owned by Handoffs and Pi owns only prompting/presentation/session orchestration.

## PR 3 — Replace `handoff_self_queue_pickup`

### Host-observed completion state machine

1. Refactor `createHandoffSelfWorkflow()` in `src/self.ts` so completion is driven by Pi events rather than a model-visible tool.
2. Retain explicit workflow states and concurrency rejection, but replace the tool waiter with state containing:
   - opaque internal workflow ID if useful for logs/state isolation only (do not expose it to the model);
   - expected branch and cwd;
   - observed exact create evidence, initially absent;
   - lifecycle/abort/timeout ownership using existing timer seams.
3. While a self workflow is active, observe `tool_execution_end` and accept only a successful standalone `ns handoff create ... --format json` result whose Clinkr envelope validates against the Handoff create result schema and whose branch equals the expected branch.
4. Do not infer the slug from command text, raw continuation focus, filenames, human output, or inventory order. Store exact `data.branch`, `data.slug`, `data.key`, locator, and commit from structured command output.
5. Treat malformed output, nonzero execution, wrong branch, multiple successful create results, or a create result outside the active workflow window as non-completion. Surface a precise fail-closed notification after settlement; never clear context.
6. On `agent_settled`, require exactly one captured successful create result, then independently call the Handoffs domain check for that exact branch/key. Verification must happen after settlement so all CLI/storage effects are visible and no queued continuation remains.
7. Only after verification succeeds:
   - call `ctx.waitForIdle()` defensively;
   - call `ctx.newSession()` with the old session path as `parentSession` when available;
   - use only the fresh `withSession` context to notify and send the natural-language pickup prompt;
   - retain cancellation/failure manual-recovery messages.
8. On no evidence, ambiguity, verification missing/failure, timeout, abort, shutdown, or replacement cancellation/failure, reset state and preserve the old context.
9. Ensure event handlers cannot complete a stale workflow after state changes or timeout. Keep all scheduling through the existing injected `TimerScheduler` conventions.

### Remove the rendezvous tool

10. Delete `buildTool()`, `handoff_self_queue_pickup`, workflow-id prompt sections, parameter parsing/gates, `terminate: true` result logic, registration, status copy, and system-prompt guidelines.
11. Register `/ns:handoff:self` whenever command/session replacement support is available; it should no longer be conditional on `pi.registerTool`.
12. Remove now-unused generic verified-launch abstractions only if no Herdr or other launch consumer still needs them after PR 2. Do not broaden PR 3 into unrelated launch-framework cleanup.
13. Update parity notes to state that self-handoff uses portable atomic creation plus Pi-host observation/verification/session replacement, with manual fresh-session pickup as the cross-harness fallback.

### Tests and docs

14. Rewrite `handoff-self.test.ts` around event-driven completion:
   - exact successful create envelope plus verification replaces the session;
   - old context is stale after replacement and only `withSession` sends pickup;
   - no create result, malformed result, nonzero bash, wrong branch, duplicate results, missing artifact, verification failure, timeout, abort, concurrent invocation, shutdown, replacement cancellation, and replacement exception all preserve context;
   - unrelated `bash` and create commands outside the active workflow are ignored;
   - settlement ordering prevents replacement before the old run is fully done.
15. Update fakes/runtime types narrowly to model `tool_execution_end` and `agent_settled` payloads honestly. Prefer typed parser helpers over broad casts.
16. Update Handoff prompts, `docs/pi/handoff-artifacts.md`, `docs/pi/README.md`, parity tables, tests, and `@nseng-ai/pi-ns-handoffs/CONTEXT.md`. Remove every live reference to `handoff_self_queue_pickup` and opaque model-visible workflow IDs.

## Cross-PR implementation guidance

### Structured command-result parsing

- Centralize parsing of Clinkr JSON envelopes at the owning Pi adapter boundary; validate `unknown` with Zod before use.
- Match active workflow, cwd, command shape, exit status, and result schema. Do not trust arbitrary text containing a slug/path.
- Keep stdout as the machine result and stderr as status/human diagnostics.
- In workflow prompts, require the save/create CLI invocation as a standalone final bash command with `--format json`; prohibit command chaining/redirection that would corrupt the observable stdout contract.
- If Pi's built-in Bash result shape cannot expose untruncated stdout reliably, stop and introduce the narrowest neutral Pi runtime helper to extract a completed Bash result. Do not reintroduce a custom tool or parse session JSONL directly.

### Payload handling

- Prefer a temporary Markdown file written through Pi's built-in `write` tool for large model-authored payloads; pass its path to the CLI. This avoids embedding arbitrary Markdown in shell command arguments or custom-tool JSON schemas.
- CLI commands must continue to support stdin for portable/manual composition.
- Ensure temporary artifacts are outside the durable store, are not mistaken for Saved Plans/Handoff Artifacts, and are cleaned up only after durable creation succeeds.

### Architecture and vocabulary

- Plans owns Saved Plan slugging/store semantics and the hidden save command.
- Handoffs owns Handoff Slug derivation, atomic Handoff creation, and hidden derive command.
- Pi adapters own slash-command prompts, tool/built-in event observation, custom session evidence, UI, and session replacement.
- Herdr consumes the Handoff adapter's declared composition surface and Handoffs' structured durable references; it does not redefine Handoff lifecycle.
- Update authoritative `CONTEXT.md` files in the same PR as changed ground truth. Do not rewrite immutable ADR history.

## Validation guidance

For each PR, run focused package tests while iterating, then the repository-required TypeScript gates appropriate to the touched architecture. Before the final stack is declared ready, run at least:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-sanity
just ts-test-typescript-style-guard
just dprint-check
just
```

Run `just ts-test-isolated` as well if any changed test remains in or is added to the isolated lane. Use `just ts-format-fix`, `just ts-lint-fix`, or `just dprint-fix` for formatter/autofixer failures rather than hand-formatting generated output.

CLI scenario coverage must include applicable `-h`/`--help`, `--version`, `--runtime`, `--json-schema`, human rendering, JSON envelope, stdout/stderr, and coarse exit-code behavior. Confirm hidden `exec` leaves remain absent from normal top-level help but invocable explicitly.

At the top of the stack, verify by bounded search that no live source, prompt, skill, test, parity metadata, or current documentation references remain for:

```text
write_saved_plan_file
derive_handoff_slug_from_content
handoff_self_queue_pickup
```

Historical immutable/time-in-place records may retain names only when clearly historical and not loaded as current workflow guidance.

Also inspect Pi startup/system-prompt tooling to confirm the three definitions and their prompt guidelines are absent, and exercise these end-to-end scenarios manually or through integration tests:

1. `/ns:plan:save` creates one Saved Plan and a later session-selected implementation command resolves its custom session evidence.
2. `/ns:plan:grill-and-save` completes structured grilling and saves through the same CLI path.
3. `/ns:handoff:create` derives and creates atomically without a custom slug tool.
4. Herdr handoff-tab launches from the slug returned by atomic create.
5. `/ns:handoff:self` creates, observes, verifies, replaces the session, and sends pickup only from the fresh context.
6. Collision/model/verification failures leave durable state un-overwritten and never clear the current session.

## Risks, assumptions, and open questions

### Risks

- **Bash-result ambiguity or truncation:** the observer must consume typed, complete command output. Mitigate with standalone JSON commands, strict envelope validation, bounded results, and a narrow runtime helper if the existing event result is insufficient.
- **Observer lifecycle leaks:** slash-command handlers return after queuing a turn, so pending workflow state must be explicitly cleared on settlement, abort, shutdown, timeout, and replacement.
- **Parallel tool execution:** sibling tool calls may complete out of order. Require exactly one accepted save/create result and settle only at `agent_settled`; never let first completion silently win when multiple candidates exist.
- **Clean-break impact:** old Pi sessions with only `write_saved_plan_file` results will no longer provide session Saved Plan evidence, and resumed old calls to any removed tool will fail. This is intentional and should be stated in release/PR notes.
- **Create operation ordering:** content-derived Handoff create must read content before it can check a slug collision. Ensure read/model failures happen before storage mutation and exact read bytes are reused for writing.
- **Package-boundary drift:** moving Handoff slugging must not pull Pi runtime dependencies into `@nseng-ai/handoffs`; use neutral command/config/git gateways only.
- **Temporary-file leakage:** prompts and observers must not treat temporary authored Markdown as durable output, and cleanup must not remove content before successful creation.

### Assumptions

- The configured model `slug` operation remains the source for both Saved Plan and Handoff semantic slugs; implementation must correct current prose that inaccurately hard-codes “Codex” if policy permits other providers/models.
- Pi's `tool_execution_end` and `agent_settled` events remain available through the local Pi runtime type boundary.
- Explicit `ns handoff create --slug ...` remains useful and supported even though content derivation becomes the default when omitted.
- No database or ad hoc hidden state file is needed; durable outcomes remain in the Local Plan Store or Branch Memory, while pending observer state remains extension-instance memory.

### Open questions for implementation-time verification

These are evidence checks, not unresolved product requirements:

- Confirm the exact local Bash tool result detail shape and whether stdout can ever be truncated before observer parsing. If it can, add a tested neutral extraction seam before migrating workflows.
- Confirm whether `@nseng-ai/plans` already has a suitable injected whole-payload source reader; otherwise introduce the smallest package-owned gateway rather than coupling Plans to Handoffs/brmem readers.
- Decide the final custom entry identity and schema name for Saved Plan evidence after checking existing extension custom-entry naming conventions.

## Review and remediation strategy

Review each PR independently along both repository-standard and requirement/spec axes before stacking the next:

### PR 1 review gate

- The hidden save command fully owns derivation + exclusive write.
- Session selection works from validated custom entries.
- No `write_saved_plan_file` registration or compatibility reader remains.
- Plan write/grill prompts use built-in write/bash only.

### PR 2 review gate

- Handoff slug semantics live in `@nseng-ai/handoffs`, not its Pi adapter.
- Atomic create stores exactly the content used to derive the slug.
- Explicit slug override and hidden derive command both obey schemas.
- No `derive_handoff_slug_from_content` registration/reference remains.
- Existing self/Herdr workflows still work using create-result slug evidence.

### PR 3 review gate

- Exact create evidence plus independent verification is mandatory.
- Session replacement cannot occur before `agent_settled` or on ambiguous/failing evidence.
- Post-replacement messaging uses only `withSession` context.
- No `handoff_self_queue_pickup`, model-visible workflow ID, or tool registration remains.

If review finds a defect owned by an earlier branch, fix/amend that branch and restack with Graphite rather than masking it in a later PR. Keep the three PRs semantically clean and do not add a fourth cleanup PR. At the top, run final residue searches, complete validation, and inspect the aggregate diff for unrelated files—especially the pre-existing untracked `.pi/extensions/hey-nana.ts`—before submission.