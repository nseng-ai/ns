# Guard Explorer Filesystem Access with a Subprocess-Only CWD Boundary

## Goal and outcome

Prevent `explorer` subagents from reading or recursively searching outside the repository/worktree directory supplied as their dispatch `cwd`.

The initial fix is intentionally narrow:

- explorers support only the `subprocess` execution architecture;
- subprocess explorers receive a package-owned child safety extension while ambient extensions remain disabled;
- the extension enforces **lexical** cwd containment for `read`, `grep`, `find`, and `ls`;
- automatic dispatch fails closed if subprocess execution is unavailable;
- explicit `execution: "in-process"` for an explorer is rejected before fleet launch;
- task agents and lower-level direct runner-subagent consumers retain their current behavior unless they explicitly receive the new internal filesystem-scope policy.

The change is complete when the reported class of request—such as explorer `grep` with `path: "/Users/schrockn"` from a repository cwd—is blocked before the underlying filesystem tool runs, without enabling ambient parent/global extensions in the child.

## Context and discovered facts

### Incident

An explorer child issued a recursive grep rooted at `/Users/schrockn`. macOS TCC logs tied the resulting protected-location prompts to the child `rg` process. The child could do this because its read-only tool allowlist limits operations but does not constrain paths.

The parent’s global guard at `~/.pi/agent/extensions/home-directory-guard.ts` did not run in the child:

- subprocess children are launched with `--no-extensions` in `src/runner-subagents/subagent-process.ts`;
- in-process children use `PI_IN_PROCESS_RESOURCE_POLICY.extensions: false` in `src/runtime/pi-agent-session.ts`;
- the parent extension sees only the outer `subagent(...)` call, not tool calls generated later inside the child.

Disabling ambient extensions is intentional: it prevents recursive subagent registration and unrelated user/project extension behavior in child sessions. The fix must not turn ambient extension discovery back on.

### Current architecture

Package: `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents`

- `src/agents/explorer.ts` defines `EXPLORER_AGENT_DESCRIPTOR`. It currently permits both `subprocess` and `in-process`, preferring them in that order, and grants `read`, `grep`, `find`, and `ls`.
- `src/tool/subagent.ts` resolves the descriptor/runtime and builds `RunnerSubagentOptions` in `runTask`.
- `src/runner-subagents/extension-api.ts` owns the internal `RunnerSubagentOptions` contract.
- `src/runner-subagents/subagent-process.ts` launches child Pi with `--no-extensions`, optionally adds a generated package-owned runtime extension, and sets child `cwd` to the dispatch cwd.
- `src/runner-subagents/subagent-runtime.ts` creates temporary runtime config/result/extension files.
- `src/runner-subagents/subagent-runtime-extension.ts` is the package-owned child extension currently used for terminal capture. It already has a `tool_call` hook and is the smallest existing enforcement point for subprocess children.
- Explorer calls use final-text mode and currently have no terminal tools, so runtime files are not normally created for them.
- `src/runtime/pi-agent-session.ts` owns the in-process resource policy. In-process enforcement is deliberately deferred from this change.

The package’s `AGENTS.md` requires descriptor policy to own permissions while runtime adapters enforce mechanics without weakening that policy. Preserve `SubagentRuntime.dispatch`, `createSubprocessSubagentRuntime()`, and direct-consumer terminal/final-text behavior.

### Requirements decisions from grilling

1. Use lexical cwd containment now. Do not include canonical `realpath`/symlink containment in the initial fix.
2. Make explorers subprocess-only and fail closed. Do not permit automatic or explicit fallback to an unguarded in-process explorer.
3. Treat guarded subprocess-only explorers as the complete scope of this change.
4. Record two explicit follow-ups:
   - share equivalent enforcement with the in-process resource loader, then restore in-process explorer support;
   - strengthen lexical containment to canonical containment that rejects symlink escapes.

## Files, symbols, tests, and documentation

### Primary implementation files

- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/agents/registry.ts`
  - `SubagentAgentDescriptor`
  - descriptor validation, if a typed filesystem-scope field is added
- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/agents/explorer.ts`
  - `EXPLORER_AGENT_DESCRIPTOR`
- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/agents/task.ts`
  - confirm task remains unrestricted and supports both runtimes
- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/tool/subagent.ts`
  - `executeSubagent`
  - `runTask`
- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/runner-subagents/extension-api.ts`
  - `RunnerSubagentOptions`
- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/runner-subagents/subagent-process.ts`
  - `dispatchRunnerSubagentProcess`
  - `BuildChildPiArgsInput`
  - `buildChildPiArgs`
- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/runner-subagents/subagent-runtime.ts`
  - `RuntimeConfigV1`
  - `CreateRunnerSubagentRuntimeFilesInput`
  - `createDefaultRunnerSubagentRuntimeFiles`
  - config parsing/validation and generated extension source
- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/runner-subagents/subagent-runtime-extension.ts`
  - `ToolCallEventLike`
  - `createRunnerSubagentRuntimeExtension`

### Tests to extend

- `test/agents/explorer-contract.test.ts`
  - assert explorer’s executable descriptor is subprocess-only and carries the cwd scope policy
- `test/tool/subagent-model-routing.test.ts` or the nearest runtime-selection tool test
  - auto explorer dispatch resolves to subprocess
  - explicit explorer `execution: "in-process"` returns a configuration error and dispatches nothing
  - task agents still support both execution architectures
- `test/runner-subagents/runner-subagent-process.test.ts`
  - final-text dispatch with cwd scope creates/passes the generated child extension despite having no terminal tools
  - ordinary unscoped final-text direct consumers preserve their existing child arguments and behavior
- `test/runner-subagents/runner-subagent-terminal-tools.test.ts`
  - runtime config round-trips the optional cwd scope
  - generated extension blocks escaping paths before execution
  - generated extension permits contained paths
  - existing terminal capture behavior remains unchanged
- Add a focused runtime-extension boundary test file only if the existing terminal-tools test becomes difficult to navigate; do not create a trivial module/test split without need.

### Documentation to update

- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/README.md`
  - state that explorer is temporarily subprocess-only
  - state that its four filesystem tools are lexically confined to dispatch cwd
  - remove the claim that both built-ins prefer subprocess while supporting both
  - explain that explicit in-process explorer execution is unsupported and fails before fleet launch
- `ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/AUTHORING.md`
  - document the descriptor-owned filesystem-scope policy and that a runtime claiming compatibility must enforce it
- `.ns/pi/agents/explorer.md`
  - add defense-in-depth wording that explorer paths must remain inside the current working directory; make clear this prose is not the enforcement mechanism
- `docs/follow-ups/README.md` and a focused new follow-up document under `docs/follow-ups/`
  - record restoring in-process explorer support after equivalent enforcement exists
  - record canonical/symlink-safe containment as the hardening step
  - state the temporary lexical threat model honestly

Update `CONTEXT.md` only if implementation introduces a durable domain term beyond the existing Agent Descriptor / Execution Architecture / Runtime Adapter language. Do not add proposed vocabulary ahead of implementation.

## Implementation steps

### 1. Preflight and branch safety

- Re-run `ns objective exec load-orientations --format md` and inspect active Objectives before editing because initiative state may have changed.
- Read the root and `ts/` instructions plus this package’s `AGENTS.md`, `CONTEXT.md`, and `AUTHORING.md`.
- Check git status. The current planning checkout was `master`; never commit there. Before any checkpoint/commit, load `code-graphite` and create/switch to a feature branch with `gt`.
- Do not recreate or reuse the abandoned files from the planning conversation; the worktree was clean after they were removed.

### 2. Encode the explorer scope as internal typed policy

Prefer a small descriptor-owned field rather than inferring safety from a tool-name array or checking `descriptor.name === "explorer"` in runtime code. Use a closed internal policy such as:

```ts
filesystemScope: "cwd" | "unrestricted"
```

or an optional `filesystemScope?: "cwd"` if omission clearly and consistently means unrestricted for existing descriptors/direct consumers.

Requirements:

- `EXPLORER_AGENT_DESCRIPTOR` selects cwd scope.
- `TASK_AGENT_DESCRIPTOR` remains unrestricted.
- Explorer `supportedRuntimes` and `runtimePreference` become exactly `["subprocess"]`.
- Descriptor validation rejects incoherent policy, such as a cwd-scoped descriptor advertising a runtime that does not enforce the scope. For this narrow change, validation may explicitly require cwd-scoped descriptors to be subprocess-only.
- `runTask` carries the selected descriptor policy into internal `RunnerSubagentOptions` once. Do not expose a new model-visible `subagent` input field; callers/models must not be able to relax the scope.

Keep this internal and compatible for lower-level callers: omitted policy must preserve current unrestricted direct-runner behavior.

### 3. Extend the generated subprocess runtime extension config

Reuse the existing package-owned generated runtime extension instead of loading ambient extensions or introducing a second child-extension mechanism.

- Extend `RuntimeConfigV1` and `CreateRunnerSubagentRuntimeFilesInput` with the optional cwd filesystem boundary needed by the child extension.
- Include the effective dispatch cwd in runtime config when `filesystemScope` is `"cwd"`.
- Permit generation of runtime files when there are zero terminal tools but a cwd boundary is configured. Preserve the invariant that a config with neither terminal tools nor a filesystem boundary is invalid or, preferably, never generated.
- Adjust `dispatchRunnerSubagentProcess` so runtime files are created for any dispatch needing terminal capture **or** cwd containment.
- Continue launching with `--no-extensions`; add only the generated package-owned extension with `--extension`.
- Keep temp-file permissions and cleanup behavior unchanged.
- Do not alter in-process runtime/session wiring in this change.

Take care with the existing terminal-tool validation, which currently requires at least one terminal tool. Refine it so an empty terminal-tool list is legal only when another runtime-extension capability (the cwd boundary) is present. Existing terminal-only callers and malformed-config diagnostics must retain their behavior.

### 4. Implement lexical tool-call containment in the child extension

In `createRunnerSubagentRuntimeExtension`, add pre-execution handling for exactly `read`, `grep`, `find`, and `ls` when the runtime config carries a cwd boundary.

Path extraction:

- `read`: `event.input.path` is required by the tool schema.
- `grep`, `find`, and `ls`: omitted `path` means `"."`.
- Treat malformed/non-string path values as blocked rather than allowing execution; normal Pi schema validation should prevent them, but the extension is a safety boundary.

Lexical containment algorithm:

1. Start from the configured effective child cwd, normalized with Node path utilities.
2. Reject `~` and `~/...` explicitly because Node `path.resolve` does not perform Pi’s home expansion. Also account for Pi’s accepted display/input prefix if nearby Pi path utilities show a leading `@` is stripped before resolution; the guard must not validate a different lexical path than the tool executes.
3. Resolve relative paths against the configured cwd; normalize absolute paths directly.
4. Use `path.relative(root, target)` plus `path.isAbsolute(relativeResult)` to decide containment. Allow the root itself and descendants. Reject `..` escapes and sibling prefix traps such as `/repo-other` when root is `/repo`.
5. Return `{ block: true, reason: ... }` before tool execution for rejected calls. The reason should identify the tool and state that explorer paths must remain inside the dispatch cwd, but should not disclose unrelated file contents.
6. Leave terminal capture tools and all other tool names untouched.

Do not use string-prefix matching. Do not call `realpath` in this initial implementation. Document that an in-cwd symlink to an outside target remains a known temporary gap.

Use the child’s configured dispatch cwd as the source of truth, not `$HOME`, a hardcoded username, or the parent process’s current directory. This remains simple while working across worktrees and other machines.

### 5. Make unsupported in-process explorer requests fail closed

Rely on the existing runtime registry compatibility check after changing the explorer descriptor:

- omission/`auto` resolves only subprocess;
- explicit `execution: "subprocess"` works;
- explicit `execution: "in-process"` returns a configuration diagnostic before fleet entry/runtime dispatch;
- subprocess unavailability returns a configuration/error outcome and does not fall back to in-process.

Do not remove the in-process runtime globally. Task agents continue to use it, and the implementation remains available for later guarded explorer restoration.

### 6. Add regression coverage at the real seams

At minimum cover each filesystem tool:

Allowed:

- omitted path for `grep`, `find`, and `ls`;
- `.`;
- a relative descendant such as `src/file.ts`;
- an absolute descendant under cwd;
- an in-root normalized path such as `src/../README.md`.

Blocked:

- `/Users/schrockn` or a platform-neutral absolute outside fixture;
- `~` and `~/.pi`;
- `..` and multi-level traversal;
- an absolute sibling with the same string prefix as root;
- malformed path input when it can reach the extension hook.

Also prove the scope boundary is narrowly applied:

- task-agent behavior is unchanged;
- unscoped lower-level `RunnerSubagentOptions` do not unexpectedly gain containment;
- terminal capture still works with the combined runtime extension;
- a final-text explorer now receives the extension even with no terminal tools;
- ambient extensions remain disabled (`--no-extensions` stays present).

Do not add a symlink test that claims to pass for the initial lexical implementation. Instead, place the symlink-escape case in the follow-up’s acceptance criteria.

### 7. Update user/developer-facing documentation and follow-up record

Update package docs and explorer prompt in the same change so ground truth and guidance agree.

The follow-up document should define two independently reviewable completion conditions:

1. **In-process restoration:** inject the same descriptor-owned boundary through the in-process `DefaultResourceLoader.extensionFactories` or an equivalent package-owned seam, test parity across both runtimes, then restore `"in-process"` to the explorer descriptor.
2. **Canonical hardening:** canonicalize the root and target/nearest existing ancestor and reject symlink escapes, with tests for direct, nested, and nonexistent-child-through-symlink cases. Note that true protection against adversarial filesystem races would require an OS sandbox; the extension guard addresses accidental/model-generated escapes.

Do not leave an untracked source-code TODO. Use the repository’s explicit follow-up documentation surface.

## Validation guidance

Start with focused, red-capable tests and then run package/repository gates. Use the pinned package-manager invocation from the repo (`corepack pnpm@11.8.0` through `just` or equivalent), not the ambient mismatched pnpm version.

Focused loop examples:

```bash
corepack pnpm@11.8.0 --dir ts exec vitest run --config vitest.config.ts \
  packages/internal/hosts/pi/subagents/ns-pi-subagents/test/runner-subagents/runner-subagent-terminal-tools.test.ts \
  packages/internal/hosts/pi/subagents/ns-pi-subagents/test/runner-subagents/runner-subagent-process.test.ts
```

Required package checks:

```bash
corepack pnpm@11.8.0 --dir ts --filter @internal/ns-pi-subagents test
corepack pnpm@11.8.0 --dir ts --filter @internal/ns-pi-subagents check
```

Then run the TypeScript/repository gates appropriate to touched architecture and docs:

```bash
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-typescript-style-guard
just dprint-check
```

Use `just ts-format-fix`, `just ts-lint-fix`, or `just dprint-fix` for formatter/autofix failures, then rerun checks. Run broader `just` before declaring the change complete; include integration/isolated/sanity lanes if changed seams or repo policy indicate they are relevant.

A manual smoke is useful after automated tests: dispatch an explorer asked to search an explicit outside path and inspect its child session evidence to confirm the tool call is blocked without triggering a real recursive search. Use a harmless temporary outside fixture, not the user’s home directory or protected macOS locations.

## Risks, assumptions, and open questions

### Accepted temporary limitations

- Lexical containment does not stop access through an in-repository symlink that points outside cwd.
- Explorers cannot use the in-process runtime until equivalent enforcement exists.
- If subprocess execution is unavailable, explorer dispatch fails rather than falling back.
- Subprocess startup/resource overhead remains; this is already the ordinary `auto` path today.

### Implementation risks

- **Path-semantics mismatch:** Pi expands `~` and may normalize an `@` prefix. The guard must cover these semantics rather than naïvely feeding raw input to `path.resolve`.
- **Scope leakage:** changing generic `RunnerSubagentOptions` defaults could accidentally constrain direct consumers or task agents. Omission must preserve existing behavior.
- **Runtime config regression:** relaxing the terminal-tool requirement could accidentally allow meaningless empty configs. Validate that at least one extension capability is configured.
- **Extension ordering:** retain `--no-extensions` and load only the generated extension. Confirm the generated extension is active before child tool execution.
- **Misleading security claim:** documentation must say “lexical cwd containment,” not “sandbox” or “symlink-safe.”

### Non-blocking assumptions

- The threat model for this initial change is accidental/model-generated traversal, not a malicious concurrent local process racing filesystem links.
- No current supported caller depends on explicit in-process explorer execution; even if one does, fail-closed behavior is the selected compatibility change.
- Breaking changes are acceptable because ns is private and unreleased, but diagnostics and direct-consumer behavior should still remain coherent.

No material product question remains open for the initial implementation. The two deferred capabilities are explicitly tracked follow-ups, not blockers.

## Review and remediation

Before completion, perform a focused review against these questions:

1. Can any model-visible input disable or widen explorer filesystem scope?
2. Does every subprocess explorer, including final-text/no-terminal-tools dispatch, load the guard?
3. Is `--no-extensions` still present, preventing ambient extension inheritance?
4. Are all four allowed filesystem tools covered, including their omitted-path behavior?
5. Do path checks use `relative`/`isAbsolute` rather than string prefixes?
6. Are `~`, absolute paths, `..`, and sibling-prefix escapes tested?
7. Does explicit in-process explorer execution fail before dispatch/fleet launch?
8. Are task agents and unscoped direct runner consumers unchanged?
9. Do docs state the lexical/symlink limitation and subprocess-only behavior accurately?
10. Are the in-process restoration and canonical-hardening follow-ups concrete and indexed?

If review finds that the existing combined runtime extension becomes difficult to reason about, prefer a small cohesive capability config and helper within the existing runtime-extension modules. Do not respond by enabling all child extensions or duplicating independent subprocess safety mechanisms.

Remove any temporary debug instrumentation and inspect `git diff`/status before handoff. The final implementation summary should state the root cause: explorer permissions constrained tool names but not paths, while both child architectures intentionally disabled ambient extensions.