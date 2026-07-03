# Flow regenerate-pr result block

## Summary

`sdl flow regenerate-pr` has migrated to the signed-off CLI house style (`house-style.md`). It is a
flow-local command (no CCC, no streaming): it reads the current branch PR, generates fresh title/body
via `ctx.textGenerator`, asks for confirmation, then edits GitHub. It reports a single settled
outcome whose body is domain-authored prose rather than a single git/Graphite `ExecResult`
transcript, so it reuses the flow-local `workflow-result-block.ts` — the same finite block
`branch-latest-commit` uses — instead of introducing a new renderer. No generic
destructive/preview renderer was created, and nothing was extracted to clinkr/core.

What changed:

- `ts/packages/capabilities/flow/src/commands/regenerate-pr.ts` resolves caps at the host-extension
  seam via `resolveFlowStreamCaps(ctx)` (§1) and renders every terminal outcome through
  `renderWorkflowResultBlock`:
  - **success** → `success` (green ✓) on stdout: concise headline "Regenerated PR title and
    description." plus a normal-weight body (`PR: #<n> <url>`, `Title: <new>`,
    `Prompt: <source>`) and dimmed `Cwd:` evidence. No transcript/plumbing on success (§4).
  - **declined confirmation** → `refusal` (warn ✗) on stderr: the user opted out; GitHub stays
    untouched. Not red (§7.3).
  - **missing confirmation channel** (`ctx.confirm === undefined`) → `refusal` (warn ✗) on stderr:
    a declined guardrail per the spec's explicit example, not a subprocess failure. No edit runs.
  - **PR lookup / diff / prompt / generation failure** → `failure` (red ✗) on stderr: the
    domain-authored error already leads with a summary sentence, so its first line becomes the bold
    headline and the rest the normal-weight cause body (§7.1 direct-domain-message). The original
    exit code (`prepared.exitCode ?? 1`) is preserved, so an unreadable prompt path still exits 2.
  - **post-confirmation edit failure** → `failure` (red ✗) on stderr with a command-authored
    headline (`Generated a PR description, but failed to update PR #<n>.`) and the gateway error as
    the body.
- The `ctx.confirm(...)` body (`formatConfirmationMessage`) is unchanged and stays plain prose:
  confirmation surfaces are not guaranteed to render ANSI and the prompt is not a machine contract
  (plan PR 4 step 3, §7.3). Only the final `ok(...)`/`failed(...)` blocks are styled.

GitHub write safety is unchanged:

- Confirmation is still required before any `gh pr edit`.
- `--force` remains a compatibility no-op and still does not bypass confirmation.
- Human-authored body text outside the SDL-managed generated region is still preserved (the body
  computation in `shared/pr-description.ts` is untouched).

Tests (`ts/packages/capabilities/flow/test/scenario/regenerate-pr-command.test.ts`):

- The success test now `stripAnsi`s the block and asserts the headline, the PR/title/prompt body
  lines, dimmed `Cwd:`, and that no failure/debug plumbing (`Exit:`, `stdout:`) leaks into success.
- The declined and missing-confirmation tests assert a **warn** refusal (the headline does not carry
  the `error` truecolor swatch), the actionable message text, and — critically — that no `gh pr edit`
  call occurs. The pre-existing body-preservation and `--force`-still-asks tests are unchanged and
  still prove the safety contract.
- The no-PR failure test asserts the domain summary becomes the headline and the cause line stays
  visible in the body.

## Objective impact

- `cli-surface-audit.md` now marks `sdl flow regenerate-pr` as Done.
- Confirms `workflow-result-block.ts` generalizes cleanly to a confirmation-gated GitHub side-effect
  command, not just the local Graphite transaction commands (`branch-latest-commit`, `autobranch`):
  the same three kinds (success/failure/refusal) cover "PR generated + edited", "guardrail declined",
  and "lookup/generation/edit failed".
- Remaining P0 flow side-effect surface: `sdl flow land` (the two-PR discovery + redesign
  mini-stack, PR 5a/5b).

## Follow-ups

- For `flow land` (PR 5a/5b): land is the last and largest surface and is CCC-owned via
  `runFlowCccCli`, so it should follow the **CCC-local** presentation precedent set by `flow autoslot`
  (`autoslot-presentation.ts`), not the flow-local `workflow-result-block.ts` used here — its typed
  outcomes are computed in CCC. PR 5a inventories the user-visible land states and isolates
  presentation seams; PR 5b applies the full house-style redesign while preserving confirmation,
  dry-run, partial-success, and recovery semantics.
- `workflow-result-block.ts` now has three flow-local consumers; the standing no-extraction decision
  still holds. Record any future promotion to a shared renderer as parked, not in-plan.

## Evidence

Validation run after implementation:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/scenario/regenerate-pr-command.test.ts`
  — passed (9 tests).
- `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-guard`,
  `just dprint-check` — see commit/PR for the recorded run.
