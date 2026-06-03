# Consolidate Submit Into asdl-dev

## Thesis

`/code:submit` should be a durable repo-local developer command instead of a Pi-only workflow. The canonical behavior belongs in `asdl-dev submit`, where humans, agents, scripts, and tests can exercise the same headless contract. Pi may expose or lightly compose that command, but it must not grow a second Graphite submit implementation.

The Pi surface lives under the `/code:*` namespace: `submit` (and `cp`) are routed there through `asdlDevCodeExtension()` (`piNamespace: "code"`), while `preview-url` stays under `/dev:*`. The submit command moved from `/dev:submit` to `/code:submit` as a domain-namespacing decision; the headless `asdl-dev submit` contract is unchanged.

This Objective tracks the end-to-end consolidation plus the review hardening needed before the branch is structurally review-ready.

## Scope

This Objective covers:

- Moving submit behavior into `ts/packages/asdl-dev/` as a headless command with explicit arguments, stdout/stderr, exit codes, gateway-backed workflow decisions, and CLI scenario/gateway tests.
- Removing the legacy Pi-only submit command surface and tests once `/code:submit` is backed by the `asdl-dev` command table.
- Keeping Pi submit composition thin: Pi may add UX wrapper behavior such as display, progress, or confirmation, but Graphite orchestration, output interpretation, retries, and failure policy remain canonical in `asdl-dev`.
- Hardening process timeout behavior so long-running submit/restack commands cannot hang indefinitely after a timeout.
- Cleaning the submit boundary so real gateways return semantic result causes rather than user-facing English strings that leak presentation into adapter/fake contracts.
- Updating docs and inventories so the consolidation model is clear: “mirror” means exposing the CLI command through Pi, not maintaining parallel implementations.

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
- Targeted TypeScript checks/tests and the relevant strict code-quality review evidence pass for the changed areas.

## Assumptions and Risks

Assumptions:

- A single Objective is the right tracking unit because the migration, deletion of duplicate Pi behavior, docs, tests, and review hardening all serve one thesis: make submit a durable `asdl-dev` workflow with Pi as a surface.
- `asdl-dev` is the correct canonical layer for durable submit behavior because the command's contract can be expressed through arguments, stdout, stderr, and exit codes.
- Any Pi-specific submit work can remain a thin UX composition layer without owning Graphite policy or shell-output interpretation.
- Validated: the existing submit behavior can be preserved while replacing presentation-string gateway fields with typed semantic causes; scenario tests continue to assert the user-facing no-current-PR and empty-branch guidance while fakes provide only semantic causes.
- Shared command timeout behavior can be hardened centrally without surprising other `asdl-dev` gateway users.

Risks:

- Pi duplication drift is a major risk: a thin wrapper could gradually recreate a parallel submit implementation with its own Graphite orchestration and failure policy.
- Shared runner hardening could affect other `runCommand` callers; substantially de-risked — the SIGKILL fallback and exit-code-124 timeout semantics are additive behind an optional `timeoutKillGraceMs` (default 5s), so existing callers that pass no new options keep working while gaining bounded timeout escalation, and command-runner tests guard the behavior (PR #787).
- Submit UX may regress if the headless command permanently loses useful old Pi affordances such as progress feedback or checkpoint-recovery prompts.
- Graphite output parsing remains inherently brittle, but the typed-cause boundary narrows that risk: real-gateway tests cover the known empty-branch/no-current-PR/startup/timeout/generic-failure mappings, and future Graphite success-with-failure states should be added as explicit cause variants rather than raw prose.

## Open Questions

- After the headless CLI path is hardened, does `/code:submit` actually need a thin Pi UX wrapper beyond the generic command-surface adapter? If so, what concrete evidence or user pain justifies adding it?
- Resolved: the blast radius of the SIGTERM→SIGKILL fallback is contained. `timeoutKillGraceMs` is optional with a 5s default and the new behavior only adds a bounded SIGKILL escalation plus a normalized exit code 124 for timed-out runs; callers that pass no new options are otherwise unchanged, so no existing caller depended on the prior weaker timeout behavior (PR #787).
