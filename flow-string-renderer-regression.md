# Fix Flow string-result terminal rendering

## Goal and user-visible outcome

Fix `ns flow pull-trunk` and the other Flow commands that return already-rendered strings so human output is emitted as terminal text rather than Clinkr’s generic JSON fallback. The reported symptom is a quoted string containing literal `\u001b` and `\n`, for example:

```text
"\u001b[1m✓ Pulled ...\u001b[0m\nNo full ..."
```

After the change, `ns flow pull-trunk` must print an ordinary multiline result block, with ANSI styling only when the sink supports it. `--format json` must continue to emit the normal typed Clinkr envelope and must not be changed by the human renderer.

## Provenance and drift anchors

Planning snapshot: branch `master`, commit `d30314d22dd13f14774c81a2e8c2357bcb4f08a2`, 2026-08-05. The SHA is forensic context only; compare these excerpts against live code before editing:

- `flowPullTrunkCommand` in `ts/packages/incubating/extensions/flow/src/ns/commands/pull-trunk.ts` has `resultSchema: z.string()` and returns `ok(block)`, but has no `renderHuman`.
- `renderOutcomeView` in `ts/packages/public/infra/clinkr/src/app/app.ts` selects `definition.renderHuman` for human format and otherwise calls `envelopeJsonText(outcome.data)`. Thus the fallback correctly JSON-serializes string data, producing quotes and escaped control characters when a command omits its renderer.
- `writeCommandExitOutput` in Flow’s direct scenario helper writes `String(result.data)` itself. Those tests bypass the real Clinkr renderer, explaining why substring assertions remain green despite the production defect.

If these mechanics have materially changed, stop and re-diagnose at the current terminal-emission boundary rather than applying this plan mechanically.

## Non-negotiable decisions and constraints

1. **Fix Flow command declarations, not Clinkr’s fallback.** Pretty JSON is intentional generic behavior for success data without a renderer. Changing it would affect unrelated commands and weaken the explicit-renderer contract.
2. **Repair the complete Flow string-result family.** At the planning anchor, all twelve Flow command definitions use `resultSchema: z.string()` and omit `renderHuman`. Apply one explicit identity human renderer consistently; fixing only `pull-trunk` leaves the same latent defect elsewhere.
3. **Do not add `renderMarkdown`.** Terminal-preformatted strings do not establish a distinct Markdown contract.
4. Preserve result schemas, statuses, stream routing, ANSI capability handling, and JSON envelopes. A structured-result redesign would be a larger CLI-contract migration and is out of scope.
5. The active `clinkr-readme-driven-development` Objective explicitly calls for command renderers. This repair follows that settled architecture; update the Objective only if implementation discovers an actual contract change.

## Scope boundary

In scope:

- The twelve definitions under `ts/packages/incubating/extensions/flow/src/ns/commands/`: `autobranch`, `autoslot`, `branch-latest-commit`, `changes`, `cp`, `exec-read-graphite-branch-metadata`, `generate-pr-inventory`, `land`, `pull-trunk`, `push`, `squash-stack`, and `submit`.
- A small Flow-owned identity renderer helper.
- `ts/packages/public/sdk/test/integration/flow-extension-cli.test.ts`, the existing seam that installs Flow and runs it through production SDK composition, modern `ClinkrApp`, and `emitTerminalOutcome` with scripted dependencies.
- The SDK fake helper only if needed to pass explicit render capabilities through `runWithRealFlowExtension`.

Out of scope:

- `ts/packages/public/infra/clinkr/src/app/app.ts`; its fallback is working as designed.
- Rich result schemas, Markdown rendering, output wording/theme changes, non-Flow callers, and legacy Clinkr deletion.
- Pi extension tests; they stub CLI execution and cannot prove this rendering boundary.

## Implementation slices

### 1. Add a red-capable real-renderer regression

In `flow-extension-cli.test.ts`, add a successful `flow pull-trunk` invocation through `runWithRealFlowExtension`. Extend that local helper to accept and forward `renderCapabilities` to `runCliWithFakes`; do not modify the shared fake context’s default. Invoke with ANSI-capable render capabilities so the regression covers the exact reported control-character symptom.

Use this deterministic non-checked-out-trunk script:

1. `git symbolic-ref --short refs/remotes/origin/HEAD` → `origin/main\n`.
2. `git for-each-ref --format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref) refs/heads/main` → `refs/heads/main\0origin\0refs/heads/main\n`.
3. `git worktree list --porcelain` → one worktree on a feature branch, so trunk is not checked out.
4. `git fetch origin refs/heads/main:refs/heads/main` → success.

Assert exit 0 and empty stderr. For stdout, prefer structural byte-level assertions over a brittle full ANSI snapshot:

- it starts with an actual ESC sequence followed by the success glyph/headline, not `"`;
- it contains actual newline-separated lines for `No full \`gt sync\` was run.`, `Command: git fetch origin refs/heads/main:refs/heads/main`, and `Cwd: <fixture cwd>`;
- it does not contain literal `\\u001b` or `\\n` substrings and is not a JSON string literal;
- stripping ANSI yields the expected four-line semantic block plus the terminal boundary’s trailing newline.

Run before implementation and capture failure specifically caused by quoted/escaped output.

Gate: `pnpm --dir ts exec vitest run packages/public/sdk/test/integration/flow-extension-cli.test.ts` fails on the new rendering assertions before the fix.

### 2. Declare Flow’s identity human renderer

Create `ts/packages/incubating/extensions/flow/src/ns/presentation/string-result.ts` with a named function such as:

```ts
export function renderFlowStringResult(result: string): string {
  return result;
}
```

Import it and set `renderHuman: renderFlowStringResult` on all twelve definitions. This location makes presentation ownership explicit without adding a package export. Do not re-render using capabilities: most strings were already rendered from `NsExtensionApi` capabilities before being returned.

Execution mode: use parent-owned precise edits rather than an opaque script. Although this is a 12-file same-shape change, the current harness has no `refactor-swarm` skill/tool and no identified repo codemod; introducing one would be disproportionate. Make one import/property edit per definition, inspect every changed object, and use the inventory check below as the deterministic equivalent. If an existing TypeScript-aware codemod becomes available at implementation time, it may be used instead after inspecting its diff.

Preserve these semantic cases:

- `exec-read-graphite-branch-metadata` deliberately returns serialized JSON text in human mode; identity rendering preserves raw JSON instead of JSON-encoding the string again.
- `submit` returns `ok("")` after writing settled output; `autoslot` and `land` may also return empty data after forwarding/flushing. Identity rendering must not synthesize output.
- Other commands return terminal-ready prose or themed blocks; pass them through unchanged.

Inventory gate:

```bash
rg -l 'resultSchema: z\.string\(\)' ts/packages/incubating/extensions/flow/src/ns/commands | sort
rg -l 'renderHuman: renderFlowStringResult' ts/packages/incubating/extensions/flow/src/ns/commands | sort
```

The sorted file lists must match exactly after manually inspecting that each property belongs to the relevant command definition. Expected count at the anchor is twelve; investigate rather than forcing that count if live inventory differs.

No intermediate checkpoint: the declarations form one small coherent repair and should land together.

### 3. Cover distinct result roles without duplicating every command

Keep pull-trunk as the mandatory primary regression. In the same real-host integration file:

- Strengthen the existing `cp` success test to reject surrounding quotes/literal escape sequences, covering ordinary prose output.
- Add a real-host `flow exec read-graphite-branch-metadata` assertion only if its SQLite fixture is already available without new environment machinery; assert the human output parses directly as the expected JSON array rather than as a JSON string. Otherwise retain its existing direct scenario exact-output test and document why pull-trunk plus the renderer inventory is proportionate.
- Strengthen one existing successful streamed-output test (prefer `submit`) to assert stdout does not end with a rendered `""` line. Do not create a new expensive scenario solely for this.

Also invoke pull-trunk with `--format json` through the same scripted fixture. Parse stdout and assert a success envelope with string `data`; the human renderer must not replace or flatten the envelope. This is the explicit machine-contract guard.

Gate: the focused SDK integration file passes and assertions demonstrably traverse `runCliWithFakes`, not Flow’s custom `writeCommandExitOutput` helper.

## Validation and expected results

Run:

```bash
pnpm --dir ts exec vitest run packages/public/sdk/test/integration/flow-extension-cli.test.ts
pnpm --dir ts exec vitest run packages/incubating/extensions/flow/test/scenario
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-typescript-style-guard
```

All should pass. If formatting fails, use `just ts-format-fix`; if lint has autofixable failures, use `just ts-lint-fix`, then rerun gates. Record unrelated pre-existing failures with command/output evidence rather than conflating them with this change.

A manual `ns flow pull-trunk` smoke is optional because it mutates local trunk state; only run it from a safe non-trunk implementation checkout. The fake-driven real-host regression is authoritative.

## STOP conditions

- `renderOutcomeView` no longer uses generic JSON fallback when `renderHuman` is absent, or Flow has moved to structured results: re-diagnose the true double-serialization owner.
- Any string-result Flow command now has a meaningful non-identity renderer or distinct Markdown contract: exclude it and document the semantic exception rather than overwriting it.
- The real-host fixture cannot inject pull-trunk’s Git calls without touching a real repository: establish a safe Clinkr boundary fixture; do not weaken coverage to the bypassing direct harness.
- Adding `renderHuman` changes `--format json` envelope/data behavior: stop because renderer selection has leaked into the machine contract.

## Inherited evidence and revalidation

### Stable inherited evidence

- Modern Clinkr renders successful human data with a command renderer and otherwise uses pretty-JSON fallback; negative messages use a separate path.
- `runWithRealFlowExtension` reaches production filesystem registration and Clinkr terminal emission while using scripted execution.
- Flow’s direct scenario helper bypasses the renderer and cannot catch this symptom.

### Revalidate during implementation

- The twelve-command inventory and each command’s result role.
- The exact extension command path for metadata and current streamed-output integration coverage.
- Integration-lane discovery and whether focused test placement remains correct.

### Explicitly unresolved

- Metadata real-host coverage is conditional on reusing the existing SQLite fixture without broad setup; it is not required if the exact direct scenario plus renderer inventory remains intact.

## Subagent orchestration opportunities

Subagent orchestration opportunities: none for implementation. The change is mechanically broad but tightly coupled to one helper and one regression seam; with no available `refactor-swarm` facility, parent-owned precise edits and aggregate validation are safer than coordinating shared-worktree editing children.

## Checkpoint and closeout review

This is one small coherent repair; prefer one final commit rather than intermediate `ns flow cp` checkpoints. If work expands into schema or presentation migration, stop and re-plan.

After implementation and focused validation pass, run exactly one in-session `typescript-style` review subagent over the changed diff, using that review definition’s default model when available (OpenAI-family Pi review example: `openai-codex/gpt-5.6-luna:medium`). Inspect status and final text, fix only local/mechanical/low-risk findings, rerun focused validation after fixes, and report judgment calls rather than guessing; do not repeat the style review.

Finally, rerun declared done criteria, compare changed files with scope, inspect assertions for genuine red-capability, verify the two renderer-inventory lists match, and confirm `--format json` remains an envelope rather than raw human text.