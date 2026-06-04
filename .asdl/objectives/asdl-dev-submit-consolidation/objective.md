# Consolidate Submit Into asdl-dev

## Thesis

`/code:submit` should be a durable repo-local developer command instead of a Pi-only workflow. The canonical behavior belongs in `asdl-dev submit`, where humans, agents, scripts, and tests can exercise the same headless contract. Pi may expose or lightly compose that command, but it must not grow a second Graphite submit implementation.

The Pi surface lives under the `/code:*` namespace: `submit` (and `cp`) are routed there through `asdlDevCodeExtension()` (`piNamespace: "code"`), while `preview-url` stays under `/dev:*`. The submit command moved from `/dev:submit` to `/code:submit` as a domain-namespacing decision; the headless `asdl-dev submit` contract is unchanged.

This Objective tracks the end-to-end consolidation plus the review hardening needed before the branch is structurally review-ready. It is now in final closeout mode: the durable submit implementation, timeout hardening, typed submit causes, and `/code:submit` mirror have landed; the remaining implementation stack is intentionally limited to verification, review remediation, and closure evidence.

## Scope

This Objective covers:

- Moving submit behavior into `ts/packages/asdl-dev/` as a headless command with explicit arguments, stdout/stderr, exit codes, gateway-backed workflow decisions, and CLI scenario/gateway tests.
- Removing the legacy Pi-only submit command surface and tests once `/code:submit` is backed by the `asdl-dev` command table.
- Keeping Pi submit composition thin: Pi may add UX wrapper behavior such as display, progress, or confirmation, but Graphite orchestration, output interpretation, retries, and failure policy remain canonical in `asdl-dev`.
- Hardening process timeout behavior so long-running submit/restack commands cannot hang indefinitely after a timeout.
- Cleaning the submit boundary so real gateways return semantic result causes rather than user-facing English strings that leak presentation into adapter/fake contracts.
- Updating docs and inventories so the consolidation model is clear: “mirror” means exposing the CLI command through Pi, not maintaining parallel implementations.
- Final closeout: verify that the generic `/code:submit` mirror is sufficient, run the relevant strict review, fix any concrete blocking findings within the existing `asdl-dev` / `pi-extensions` boundaries, and record intentional deferrals.

## Non-Goals

- Do not restore a standalone Pi-owned submit implementation with duplicate Graphite decision logic.
- Do not redesign Graphite, `gt submit`, or this repository's broader Graphite workflow.
- Do not turn `asdl-dev` into a nested command framework; it continues to use a flat task-command table.
- Do not perform a broad Pi extension architecture rewrite except where needed to keep `/code:submit` correctly surfaced.
- Do not create routine validation-only work items; targeted tests and repo checks are completion evidence for semantic work.

## Completion Criteria

- `asdl-dev submit` is the canonical submit workflow and `/code:submit` reaches it through the shared asdl-dev Pi adapter.
- The old Pi-only submit registration, implementation, and behavior tests are removed or reduced only to genuinely Pi-specific thin composition.
- Submit preflight, optional restack, submit, current-PR verification, semantic empty-branch detection, conflict reporting, and no-current-PR guidance are covered by CLI scenario tests and real-gateway tests.
- Shared command timeout handling robustly enforces timeout semantics, including escalation after SIGTERM when appropriate, with tests that protect against indefinite hangs.
- Submit gateway results expose typed semantic causes; formatting owns user-facing prose, and in-memory fakes model semantic states rather than duplicated English messages.
- Documentation describes the CLI-owned/Pi-mirrored consolidation pattern and calls out the allowed boundary for any future thin Pi UX wrapper.
- The Objective records the closeout decision that no dedicated `/code:submit` Pi UX wrapper is required for this Objective unless review or validation uncovers a concrete regression that the generic command adapter cannot address.
- Targeted TypeScript checks/tests and the relevant strict code-quality review evidence pass for the changed areas.

## Definition of Progress

Progress is keepable when it makes the Objective easier to close without reopening the submit architecture:

- evidence confirms `asdl-dev submit` remains the only owner of Graphite submit behavior;
- `/code:submit` continues to be a thin Pi mirror through the shared asdl-dev command adapter;
- strict review findings are either fixed structurally or recorded as intentional deferrals with rationale;
- docs, context, or Objective tracking are updated only when they clarify the CLI-owned/Pi-mirrored boundary; and
- targeted TypeScript validation passes for changed areas.

Do not keep changes that:

- add a Pi-owned submit implementation, Graphite orchestration, Graphite output parsing, retries, or failure policy;
- introduce a dedicated `/code:submit` wrapper without concrete evidence that the generic adapter is insufficient;
- redesign Graphite submission semantics or `asdl-dev` command structure; or
- broaden this closeout into unrelated Pi command architecture work.

Useful evidence includes targeted `asdl-dev` and `pi-extensions` tests, `just ts-check`, `just ts-test`, strict review output, docs/context diffs that clarify the boundary, and a final Objective update or closure note.

## Runner Policy

This Objective is execution-friendly for `objective-stack-impl` as a small closeout stack.

- Direct execution is allowed for the final review/remediation slice: inspect the current submit and Pi mirror code, run the strict code-quality review, fix bounded findings inside `ts/packages/asdl-dev` or `ts/packages/pi-extensions`, update docs/context when the boundary wording is stale, and record Objective evidence.
- Treat the default wrapper decision as settled: no dedicated `/code:submit` Pi UX wrapper is required for closure. A runner may reaffirm or document this decision, but should not add wrapper code unless validation or review finds concrete user-visible behavior that cannot be handled by the generic asdl-dev adapter.
- Steer or ask first before changing the `gt submit -nps --ai` contract, adding new Graphite parsing policy, adding streaming/progress UX, changing the `asdl-dev` flat command-table architecture, or widening the work beyond submit closeout.
- Validation before keeping work should include the most specific changed-file tests plus `just ts-check` and `just ts-test` when TypeScript changes are made; Markdown-only changes should at least run `just dprint-check` or the targeted dprint check.
- PR submission remains out of scope unless explicitly requested.

## Assumptions and Risks

Assumptions:

- A single Objective is the right tracking unit because the migration, deletion of duplicate Pi behavior, docs, tests, and review hardening all serve one thesis: make submit a durable `asdl-dev` workflow with Pi as a surface.
- `asdl-dev` is the correct canonical layer for durable submit behavior because the command's contract can be expressed through arguments, stdout, stderr, and exit codes.
- Any Pi-specific submit work can remain a thin UX composition layer without owning Graphite policy or shell-output interpretation.
- Settled closeout decision: no dedicated `/code:submit` Pi UX wrapper is required for this Objective unless concrete review or validation evidence shows the generic adapter is insufficient.
- Validated: the existing submit behavior can be preserved while replacing presentation-string gateway fields with typed semantic causes; scenario tests continue to assert the user-facing no-current-PR and empty-branch guidance while fakes provide only semantic causes.
- Shared command timeout behavior can be hardened centrally without surprising other `asdl-dev` gateway users.

Risks:

- Pi duplication drift is a major risk: a thin wrapper could gradually recreate a parallel submit implementation with its own Graphite orchestration and failure policy.
- Shared runner hardening could affect other `runCommand` callers; substantially de-risked — the SIGKILL fallback and exit-code-124 timeout semantics are additive behind an optional `timeoutKillGraceMs` (default 5s), so existing callers that pass no new options keep working while gaining bounded timeout escalation, and command-runner tests guard the behavior (PR #787).
- Submit UX may regress if the headless command permanently loses useful old Pi affordances such as progress feedback or checkpoint-recovery prompts; this risk is accepted for closeout unless a concrete regression appears during final review, and future rich UX can be a separate Objective.
- Graphite output parsing remains inherently brittle, but the typed-cause boundary narrows that risk: real-gateway tests cover the known empty-branch/no-current-PR/startup/timeout/generic-failure mappings, and future Graphite success-with-failure states should be added as explicit cause variants rather than raw prose.

## Open Questions

- Resolved: `/code:submit` does not need a dedicated thin Pi UX wrapper for this Objective. The generic asdl-dev command adapter is the closure target unless final review finds a concrete regression that cannot be addressed without wrapper code.
- Resolved: the blast radius of the SIGTERM→SIGKILL fallback is contained. `timeoutKillGraceMs` is optional with a 5s default and the new behavior only adds a bounded SIGKILL escalation plus a normalized exit code 124 for timed-out runs; callers that pass no new options are otherwise unchanged, so no existing caller depended on the prior weaker timeout behavior (PR #787).

## Closure

Closed on 2026-06-04 as completed.

Final review confirmed that `asdl-dev submit` remains the canonical owner of Graphite submit behavior and `/code:submit` remains a generic Pi mirror through the shared `asdl-dev` CLI adapter. Manual review inspected the submit command/gateway/runner paths, Pi namespace wiring, generic CLI bridge, project-local `.pi` adapters, submit and namespace tests, and relevant docs. No Pi-owned submit implementation, Graphite output parsing, retry policy, or dedicated `/code:submit` wrapper was introduced.

The accepted closeout findings were stale namespace wording in `ts/packages/asdl-dev/README.md` and `docs/agent-resource-catalog.md`; they now describe domain-specific Pi mirrors rather than the old all-`/dev:*` model, including the current split of `/dev:preview-url` through `.pi/extensions/asdl-dev.ts` and `/code:cp` plus `/code:submit` through `.pi/extensions/code.ts`.

Strict review evidence: `.agents/skills/autoreview/scripts/autoreview --mode local --prompt ...` returned clean with no accepted/actionable findings. The reviewer specifically confirmed the README correction matched current Pi wiring and that inspected submit/mirror code preserved `asdl-dev` ownership, the generic CLI bridge, semantic submit/verification causes, and absence of a separate Pi-owned Graphite submit workflow.

Validation passed:

- `cd ts/packages/asdl-dev && bun test test/scenario/submit-cli.test.ts test/gateways/submit-gateway.test.ts test/gateways/command-runner.test.ts`
- `cd ts/packages/pi-extensions && bun test test/asdl-dev-extension.test.ts test/code.test.ts`
- `just dprint-check`
- `just ts-check`
- `just ts-test`

Remaining caveats are intentional deferrals rather than blockers: richer Pi submit UX can be a separate future Objective if concrete user-facing need appears, and additional Graphite zero-exit semantic failure states should become explicit `SubmitSemanticFailureCause` variants instead of raw gateway prose.
