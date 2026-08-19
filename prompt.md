## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

Implement a new explicit Slot maintenance command:

`ns slot ff-detached`

## Goal

Replace the undocumented shell recipe for updating detached Slot worktrees:

`ns slot foreach --yes -- sh -c 'git symbolic-ref -q HEAD >/dev/null || exec git merge --ff-only master'`

with a first-class, tested CLI command that safely fast-forwards detached Slots to the repository’s configured trunk.

Expected human workflow after a tracked `.envrc` change lands:

1. `ns slot ff-detached`
2. Update/restack attached branches through their normal workflow.
3. `ns slot foreach --yes -- direnv allow`
4. Optionally: `ns slot foreach --yes -- direnv exec . true`

## Required repository orientation

Before implementation:

- Read root `AGENTS.md`.
- Run `ns objective exec load-orientations --format md`.
- Run `ns objective list` and inspect any active Objective overlapping Slot lifecycle work.
- Read:
  - `ts/AGENTS.md`
  - `CONTEXT-MAP.md`
  - `ts/packages/incubating/extensions/slots/CONTEXT.md`
  - `ts/packages/incubating/extensions/slots/README.md`
  - `skills/internal/agent-engineering/ns-cli-design/SKILL.md`
  - `.agents/skills/typescript-style/SKILL.md`
  - `.agents/skills/ns-typescript/SKILL.md`
  - `.agents/skills/slots/SKILL.md`
  - `.agents/skills/slots/references/direnv.md`
- Follow relevant cross-references from those files.
- Read the nearest nested `AGENTS.md` before editing if one exists.

Use Graphite workflow per root instructions if creating commits. Never commit on `main` or `master`.

## Verified facts from the source session

- The Slot package is at `ts/packages/incubating/extensions/slots/`.
- Existing relevant anchors include:
  - `ts/packages/incubating/extensions/slots/src/lifecycle/operations/foreach.ts`
  - `ts/packages/incubating/extensions/slots/src/lifecycle/operations/index.ts`
  - `ts/packages/incubating/extensions/slots/src/core/command-options.ts`
  - `ts/packages/incubating/extensions/slots/src/core/gateways/command.ts`
  - `ts/packages/incubating/extensions/slots/src/ns/slot-command-specs.ts`
  - `ts/packages/incubating/extensions/slots/src/ns/cli/slot/foreach/command.ts`
  - `ts/packages/incubating/extensions/slots/test/scenario/foreach-cli.test.ts`
  - `ts/packages/incubating/extensions/slots/test/unit/descriptor.test.ts`
- `ns slot foreach` currently:
  - includes the main worktree first;
  - then processes managed Slots in number order;
  - accepts plain argv after `--`;
  - supports repeatable `--exclude`;
  - prompts unless `--yes` is supplied;
  - continues after individual failures and returns aggregate non-success;
  - blocks when an included worktree has a Git operation in progress.
- Existing Slots skill documentation currently embeds the guarded shell recipe for fast-forwarding detached Slots.
- Direnv approval is per worktree/directory. Running `direnv allow` in a stale worktree approves the stale `.envrc`; when that worktree later receives a changed `.envrc`, direnv correctly blocks it again.
- In the source checkout, many detached and attached Slots contained an older `.envrc` blob while trunk contained a newer one. This confirmed that approval must happen after the relevant worktree receives the new file.
- The chosen command name is deliberately explicit:
  - `ns slot ff-detached`
  - “refresh” was rejected as underspecified because it could imply fetch, reset, recreation, provisioning, or direnv approval.
- Do not implement this as a mutating flag on `slot foreach`. A dedicated command gives the operation a narrow, discoverable interface.

## Required command contract

Implement:

- `ns slot ff-detached`
- `ns slot ff-detached --dry-run`
- standard Clinkr output support, including `--format json` and `--json-schema`

Suggested help text:

“Fast-forward detached Slots to the configured trunk without modifying attached Slots.”

Semantics:

1. Resolve repository context and the configured trunk using existing Slot/Git abstractions. Do not hard-code `master`.
2. Consider managed numbered Slots, not the main worktree.
3. Modify detached Slots only.
4. Never modify attached branches.
5. Use fast-forward-only behavior:
   - no reset;
   - no rebase;
   - no forced checkout;
   - no automatic detachment;
   - no merge commit.
6. A detached Slot already at trunk is a successful no-op.
7. A clean detached Slot whose current commit is an ancestor of trunk advances to trunk.
8. Dirty, divergent, or otherwise unsafe Slots must not be modified.
9. Process the whole target set and return a bounded per-Slot/aggregate result rather than stopping at the first unsafe Slot.
10. Detect and handle Git operations in progress consistently with existing Slot lifecycle policy.
11. `--dry-run` computes and returns the intended outcomes without mutation and is a successful inspection.
12. Do not require `--yes`; the intended operation is narrow. Unsafe cases should be reported/skipped or refused according to established Clinkr semantics rather than overridden.
13. Do not introduce `--force` unless repository conventions and concrete evidence require it. The command’s safety comes from refusing non-fast-forward and unsafe states.
14. Do not fetch implicitly unless existing Slot/trunk semantics clearly require and already establish that behavior. “Configured trunk” means the local configured trunk reference unless authoritative existing code says otherwise.

Design a stable machine result schema before implementation. It should make automation possible and identify, at minimum:

- configured trunk;
- whether the invocation was a dry run;
- each managed Slot considered;
- attached Slots that were left unchanged;
- detached Slots already current;
- detached Slots advanced or that would advance;
- detached Slots not advanced, with structured reasons such as dirty, divergent/non-fast-forwardable, Git operation in progress, or Git failure;
- aggregate counts.

Use camelCase properties and kebab-case ns-owned discriminant values. Follow Clinkr’s status-keyed envelope and exit semantics. Decide carefully whether partial per-Slot refusal is an `ok`, `negative`, or `failure` aggregate based on existing bulk Slot commands and the CLI design skill; encode recoverable details in structured data.

## Architecture and implementation constraints

- Keep workflow policy in Slot domain/lifecycle code, not in the CLI adapter.
- Use existing Gateway interfaces and fakes where possible.
- Before declaring or consolidating an external-tool Gateway, read `docs/conventions/consumer-gateways-and-command-shape.md`.
- Do not shell out through a hand-built `sh -c` recipe in application logic if existing Git gateways can express the required facts and mutation.
- Prefer pure planning/classification plus a narrow mutation step so `--dry-run` and tests share the same policy.
- Preserve existing Slot vocabulary from `ts/packages/incubating/extensions/slots/CONTEXT.md`.
- If implementation changes authoritative Slot behavior or vocabulary, update that `CONTEXT.md` in the same change, but do not invent unnecessary glossary terms.
- Follow TypeScript fake-driven testing rules:
  - no `vi.mock`;
  - no ambient `process.chdir`;
  - no direct `process.env` mutation;
  - no shared global/module state;
  - inject gateways/fakes.
- Keep the command human-facing and visible under `ns slot`; do not place it under hidden `exec`.
- Add a short alias only if local command naming conventions clearly support one; do not invent an unclear abbreviation.
- Do not add an unrelated general `foreach --detached-only` selector in this slice.

## Documentation updates

Update the public/package and agent-facing Slot documentation so users no longer need to discover the shell recipe:

- `ts/packages/incubating/extensions/slots/README.md`
- `.agents/skills/slots/SKILL.md`
- `.agents/skills/slots/references/direnv.md`

The documented direnv sequence should become:

1. `ns slot ff-detached`
2. update attached feature branches normally;
3. `ns slot foreach --yes -- direnv allow`;
4. optionally warm with `ns slot foreach --yes -- direnv exec . true`.

Explicitly state that `ff-detached` cannot and does not update attached feature branches. If an attached branch later receives a changed `.envrc`, it still requires approval after that update.

## Testing expectations

Add focused unit and CLI scenario coverage using existing test patterns. Cover at least:

- help exposes `ff-detached` and describes its safety boundary;
- `--json-schema` publishes the real result envelope;
- no managed Slots;
- attached Slots are never modified;
- detached Slot already at trunk;
- detached Slot successfully fast-forwards;
- multiple detached Slots process in deterministic Slot order;
- dirty detached Slot remains unchanged;
- divergent/non-fast-forwardable detached Slot remains unchanged;
- Git operation in progress remains unchanged;
- one Slot failure does not prevent later Slots from being evaluated;
- aggregate status and structured reasons for partial refusal/failure;
- `--dry-run` reports intended advancement without invoking mutation;
- configured trunk other than `master`;
- main worktree is never treated as a mutation target.

Prefer fake-driven tests in the default lane. Add a narrowly scoped real-Git integration test only if the existing package convention requires confidence in adapter behavior that cannot be established with fakes.

## Validation

Run the narrow relevant tests during development, then the repository-required checks:

- package/Slot-focused tests;
- `just ts-check`;
- `just ts-test-typescript-style-guard` because this changes TypeScript architecture/CLI surface;
- `just` as the default repository validation entrypoint.

If formatting fails, use `just ts-format-fix` or `just dprint-fix` as instructed by repository rules, then rerun validation. Report all commands and outcomes.

## Material risks and unknowns

These are assumptions to verify in the destination checkout:

- The configured trunk may come from existing Graphite/repository configuration rather than a simple Git branch name. Reuse the authoritative existing resolver.
- The current command gateway may or may not expose sufficient structured Git operations. Extend the smallest existing seam rather than introducing overlapping gateways.
- Existing bulk Slot commands may already define the correct aggregate status policy; inspect and follow them.
- A detached worktree can be advanced through `git merge --ff-only <trunk>`, but an implementation may have a safer existing Git abstraction. Preserve the exact safety properties rather than copying shell syntax.
- The source session inspected runtime state only; it made no repository edits and created no implementation branch or tests.